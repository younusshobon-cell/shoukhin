import { db, json, bad, newId } from './_lib.js';

export async function onRequestGet({ env }) {
  const { results } = await db(env).prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  return json({ ok: true, coupons: results || [] });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const code = String(b?.code || '').trim().toUpperCase();
  if (!code) return bad('Coupon code is required');
  if (!['percent', 'fixed', 'free_shipping'].includes(b.type)) return bad('Type must be percent, fixed or free_shipping');
  if (b.type === 'percent' && (Number(b.value) <= 0 || Number(b.value) > 100)) return bad('Percent value must be between 1 and 100');
  if (b.type === 'fixed' && Number(b.value) <= 0) return bad('Fixed value must be above zero');
  if (await db(env).prepare('SELECT id FROM coupons WHERE code = ?').bind(code).first()) {
    return bad('That coupon code already exists', 409);
  }
  const id = b.id || newId('cp');
  await db(env)
    .prepare(
      `INSERT INTO coupons (id,code,description,type,value,min_order,max_discount,usage_limit,starts_at,expires_at,is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(id, code, b.description || null, b.type, Number(b.value || 0), Number(b.min_order || 0),
      b.max_discount ? Number(b.max_discount) : null, b.usage_limit ? Number(b.usage_limit) : null,
      b.starts_at || null, b.expires_at || null, b.is_active === false ? 0 : 1)
    .run();
  const row = await db(env).prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first();
  return json({ ok: true, coupon: row }, { status: 201 });
}
