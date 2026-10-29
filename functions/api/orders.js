import { readCustomer } from './customer.js';
import { db, json, bad, num, newOrderId, getSettings, deliveryChargeFor, parseJSON } from './_lib.js';
import { evaluateCoupon } from './coupons/validate.js';

const PHONE_RE = /^(?:\+?880|0)1[3-9]\d{8}$/;

// ----------------------------------------------------------- admin: list orders
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(num(url.searchParams.get('limit'), 100), 300);

  const where = [], binds = [];
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status); }
  if (q) { where.push('(id LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)'); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const { results } = await db(env)
    .prepare(`SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`)
    .bind(...binds, limit).all();

  const orders = results || [];
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const { results: items } = await db(env)
      .prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids).all();
    const grouped = {};
    for (const it of items || []) (grouped[it.order_id] ||= []).push(it);
    for (const o of orders) o.items = grouped[o.id] || [];
  }
  return json({ ok: true, orders });
}

// ------------------------------------------------------- public: place an order
export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }

  const name = String(b?.customer_name || '').trim();
  const phone = String(b?.customer_phone || '').trim().replace(/[\s-]/g, '');
  const address = String(b?.address || '').trim();
  const district = String(b?.district || '').trim();

  if (name.length < 2) return bad('Please enter your full name');
  if (!PHONE_RE.test(phone)) return bad('Please enter a valid Bangladeshi mobile number');
  if (address.length < 6) return bad('Please enter a delivery address');
  if (!district) return bad('Please choose your district');

  const cart = Array.isArray(b?.items) ? b.items : [];
  if (!cart.length) return bad('Your cart is empty');
  if (cart.length > 60) return bad('Too many items in one order');

  // Prices always come from the database, never from the browser.
  const ids = [...new Set(cart.map((i) => String(i.product_id || '')).filter(Boolean))];
  if (!ids.length) return bad('Your cart is empty');
  const { results: rows } = await db(env)
    .prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active = 1`)
    .bind(...ids).all();
  const byId = Object.fromEntries((rows || []).map((r) => [r.id, r]));

  const lines = [];
  for (const item of cart) {
    const p = byId[item.product_id];
    if (!p) return bad('One of the items is no longer available. Please refresh and try again.');
    const qty = Math.max(1, Math.min(num(item.quantity, 1), 20));
    if (p.stock < qty) return bad(`Only ${p.stock} left of ${p.title}`);
    const unit = p.discount_price != null && p.discount_price > 0 ? p.discount_price : p.price;
    const sizes = parseJSON(p.sizes, []);
    if (sizes.length && item.size && !sizes.includes(item.size)) return bad(`Invalid size for ${p.title}`);
    lines.push({
      product_id: p.id, title: p.title, image: (parseJSON(p.images, [])[0] || null),
      size: item.size || null, color: item.color || null,
      unit_price: unit, quantity: qty, line_total: Math.round(unit * qty),
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const settings = await getSettings(env);

  let discount = 0, couponCode = null, freeShipping = false;
  if (b.coupon_code) {
    const c = await evaluateCoupon(env, b.coupon_code, subtotal);
    if (!c.valid) return bad(c.reason, 422);
    discount = c.discount || 0;
    freeShipping = !!c.freeShipping;
    couponCode = c.code;
  }

  let delivery = deliveryChargeFor(district, settings);
  const threshold = num(settings.free_delivery_threshold, 0);
  if (freeShipping || (threshold > 0 && subtotal >= threshold)) delivery = 0;

  const total = Math.max(0, subtotal - discount) + delivery;
  const method = ['cod', 'bkash', 'nagad', 'rocket'].includes(b.payment_method) ? b.payment_method : 'cod';
  if (method !== 'cod' && !String(b.payment_trx_id || '').trim()) {
    return bad('Please enter the transaction ID for your payment');
  }

  const customer = await readCustomer(env, request);
  const id = newOrderId();
  const statements = [
    db(env).prepare(
      `INSERT INTO orders (id,customer_name,customer_phone,customer_email,address,district,thana,postcode,notes,
         subtotal,discount,delivery_charge,total,coupon_code,payment_method,payment_trx_id,status,source,customer_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','website',?)`,
    ).bind(id, name, phone, b.customer_email || null, address, district, b.thana || null, b.postcode || null,
      b.notes || null, subtotal, discount, delivery, total, couponCode, method, b.payment_trx_id || null, customer?.id || null),
    db(env).prepare("INSERT INTO order_events (order_id,status,note) VALUES (?,'pending','Order placed from the website')").bind(id),
  ];
  for (const l of lines) {
    statements.push(
      db(env).prepare(
        'INSERT INTO order_items (order_id,product_id,title,image,size,color,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?,?,?,?)',
      ).bind(id, l.product_id, l.title, l.image, l.size, l.color, l.unit_price, l.quantity, l.line_total),
    );
    statements.push(
      db(env).prepare('UPDATE products SET stock = MAX(0, stock - ?), sold = sold + ? WHERE id = ?')
        .bind(l.quantity, l.quantity, l.product_id),
    );
  }
  if (couponCode) {
    statements.push(db(env).prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?').bind(couponCode));
  }

  await db(env).batch(statements);

  return json(
    { ok: true, order: { id, subtotal, discount, delivery_charge: delivery, total, payment_method: method, items: lines } },
    { status: 201 },
  );
}
