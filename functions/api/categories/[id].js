import { db, json, bad, slugify } from '../_lib.js';

export async function onRequestPut({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const sets = [], binds = [];
  for (const k of ['name', 'name_bn', 'parent_id', 'image']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k] || null); }
  }
  if (b.sort_order !== undefined) { sets.push('sort_order = ?'); binds.push(Number(b.sort_order)); }
  if (b.is_active !== undefined) { sets.push('is_active = ?'); binds.push(b.is_active ? 1 : 0); }
  if (b.slug !== undefined) { sets.push('slug = ?'); binds.push(slugify(b.slug)); }
  if (!sets.length) return bad('Nothing to update');
  binds.push(params.id);
  const res = await db(env).prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  if (!res.meta.changes) return bad('Category not found', 404);
  const row = await db(env).prepare('SELECT * FROM categories WHERE id = ?').bind(params.id).first();
  return json({ ok: true, category: row });
}

export async function onRequestDelete({ params, env }) {
  const inUse = await db(env).prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').bind(params.id).first();
  if (inUse?.n) return bad(`${inUse.n} product(s) still use this category. Move them first.`, 409);
  const res = await db(env).prepare('DELETE FROM categories WHERE id = ?').bind(params.id).run();
  if (!res.meta.changes) return bad('Category not found', 404);
  return json({ ok: true, deleted: params.id });
}
