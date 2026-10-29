import { db, json, bad, num } from '../_lib.js';

// Shared by checkout and by the order endpoint, so the rules live in one place.
export async function evaluateCoupon(env, code, subtotal) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { valid: false, reason: 'No code given' };

  const c = await db(env).prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').bind(clean).first();
  if (!c) return { valid: false, reason: 'That code is not valid' };

  const now = new Date();
  if (c.starts_at && new Date(c.starts_at) > now) return { valid: false, reason: 'This code is not active yet' };
  if (c.expires_at && new Date(c.expires_at) < now) return { valid: false, reason: 'This code has expired' };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { valid: false, reason: 'This code has been fully used' };
  if (subtotal < num(c.min_order, 0)) {
    return { valid: false, reason: `Spend at least ${Math.round(c.min_order)} Taka to use this code` };
  }

  let discount = 0;
  let freeShipping = false;
  if (c.type === 'percent') {
    discount = (subtotal * num(c.value)) / 100;
    if (c.max_discount != null) discount = Math.min(discount, num(c.max_discount));
  } else if (c.type === 'fixed') {
    discount = Math.min(num(c.value), subtotal);
  } else if (c.type === 'free_shipping') {
    freeShipping = true;
  }

  return { valid: true, code: clean, type: c.type, discount: Math.round(discount), freeShipping, description: c.description };
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const result = await evaluateCoupon(env, b?.code, num(b?.subtotal, 0));
  if (!result.valid) return json({ ok: false, error: result.reason }, { status: 422 });
  return json({ ok: true, ...result });
}
