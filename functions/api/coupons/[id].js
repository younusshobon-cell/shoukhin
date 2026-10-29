import { db, json, bad } from '../_lib.js';

export async function onRequestPut({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const sets = [], binds = [];
  for (const k of ['description', 'type', 'starts_at', 'expires_at']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k] || null); }
  }
  for (const k of ['value', 'min_order']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(Number(b[k] || 0)); }
  }
  for (const k of ['max_discount', 'usage_limit']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k] ? Number(b[k]) : null); }
  }
  if (b.is_active !== undefined) { sets.push('is_active = ?'); binds.push(b.is_active ? 1 : 0); }
  if (!sets.length) return bad('Nothing to update');
  binds.push(params.id);
  const res = await db(env).prepare(`UPDATE coupons SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  if (!res.meta.changes) return bad('Coupon not found', 404);
  const row = await db(env).prepare('SELECT * FROM coupons WHERE id = ?').bind(params.id).first();
  return json({ ok: true, coupon: row });
}

export async function onRequestDelete({ params, env }) {
  const res = await db(env).prepare('DELETE FROM coupons WHERE id = ?').bind(params.id).run();
  if (!res.meta.changes) return bad('Coupon not found', 404);
  return json({ ok: true, deleted: params.id });
}
