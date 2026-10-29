import { db, json, bad, pbkdf2Hash, verifyPassword } from './_lib.js';

const COOKIE = '__Host-shoukhin_customer';
const TTL = 14 * 24 * 60 * 60;
const PHONE = /^(?:\+?880|0)1[3-9]\d{8}$/;
const encode = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const cookie = (token, ttl = TTL) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`;
const tokenFrom = request => (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
const fields = 'c.id,c.name,c.email,c.phone,c.address,c.district';

export async function readCustomer(env, request) {
  const token = tokenFrom(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db(env).prepare(`SELECT ${fields} FROM customers c JOIN customer_sessions s ON s.customer_id=c.id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hash(token), Date.now()).first();
}

async function newSession(env, id) {
  const token = encode(crypto.getRandomValues(new Uint8Array(32)));
  await db(env).prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES (?,?,?)').bind(await hash(token), id, Date.now() + TTL * 1000).run();
  return cookie(token);
}

async function throttle(env, request) {
  const now = Date.now();
  const key = await hash('customer-auth:' + (request.headers.get('cf-connecting-ip') || 'local'));
  const row = await db(env).prepare(`INSERT INTO customer_auth_attempts (id,attempts,window_start) VALUES (?,1,?)
    ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END,
    window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING attempts`).bind(key, now, now - 900000, now - 900000).first();
  return row.attempts > 12;
}

export async function onRequestGet({ request, env }) {
  const customer = await readCustomer(env, request);
  if (!customer) return json({ ok: true, customer: null, orders: [] });
  const { results: orders } = await db(env).prepare('SELECT id,status,payment_status,payment_method,total,created_at,courier,tracking_code FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100').bind(customer.id).all();
  const ids = orders.map(o => o.id);
  if (ids.length) {
    const { results: items } = await db(env).prepare(`SELECT order_id,title,size,color,quantity,line_total FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    for (const order of orders) order.items = items.filter(i => i.order_id === order.id);
  }
  return json({ ok: true, customer, orders });
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return bad('Please use the Shoukhin website to continue.', 403);
  const b = await request.json().catch(() => null);
  if (!b) return bad('Expected a JSON body');
  if (b.action === 'logout') {
    const token = tokenFrom(request);
    if (token) await db(env).prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await hash(token)).run();
    return json({ ok: true }, { headers: { 'set-cookie': cookie('', 0) } });
  }
  if (!['login', 'register'].includes(b.action)) return bad('Unknown account action');
  if (await throttle(env, request)) return bad('Too many sign-in attempts. Please try again in 15 minutes.', 429);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return bad('Enter a valid email address');
  if (password.length < 12 || password.length > 128) return bad('Use a password between 12 and 128 characters');
  let customer = await db(env).prepare('SELECT * FROM customers WHERE email=?').bind(email).first();
  if (b.action === 'register') {
    const name = String(b.name || '').trim();
    if (name.length < 2 || name.length > 120) return bad('Enter your full name');
    if (customer) return bad('An account already uses this email. Please sign in.', 409);
    const id = crypto.randomUUID();
    const passwordHash = await pbkdf2Hash(password, undefined, 100000);
    try {
      await db(env).prepare('INSERT INTO customers (id,name,email,password_hash) VALUES (?,?,?,?)').bind(id, name, email, passwordHash).run();
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return bad('An account already uses this email. Please sign in.', 409);
      throw err;
    }
    customer = { id };
  } else {
    if (!customer) {
      await pbkdf2Hash(password, new Uint8Array(16), 100000);
      return bad('Email or password is incorrect', 401);
    }
    if (!await verifyPassword(password, customer.password_hash)) return bad('Email or password is incorrect', 401);
  }
  await db(env).prepare('DELETE FROM customer_sessions WHERE expires_at < ?').bind(Date.now()).run();
  return json({ ok: true }, { headers: { 'set-cookie': await newSession(env, customer.id) } });
}

export async function onRequestPut({ request, env }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return bad('Please use the Shoukhin website to continue.', 403);
  const customer = await readCustomer(env, request);
  if (!customer) return bad('Please sign in to your account.', 401);
  const b = await request.json().catch(() => null);
  if (!b) return bad('Expected a JSON body');
  const name = String(b.name || '').trim();
  const phone = String(b.phone || '').trim().replace(/[\s-]/g, '');
  const address = String(b.address || '').trim();
  const district = String(b.district || '').trim();
  if (name.length < 2 || name.length > 120) return bad('Enter your full name');
  if (phone && !PHONE.test(phone)) return bad('Enter a valid Bangladeshi mobile number');
  if (address.length > 500 || district.length > 100) return bad('Please shorten your address');
  await db(env).prepare('UPDATE customers SET name=?,phone=?,address=?,district=? WHERE id=?').bind(name, phone, address, district, customer.id).run();
  return json({ ok: true });
}
