import { db, json, bad, slugify, newId } from './_lib.js';

export async function onRequestGet({ env }) {
  const { results } = await db(env)
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
         FROM categories c ORDER BY c.sort_order, c.name`,
    ).all();
  return json({ ok: true, categories: results || [] });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  if (!b?.name) return bad('Name is required');
  const id = b.id || newId('cat');
  let slug = slugify(b.slug || b.name);
  if (await db(env).prepare('SELECT id FROM categories WHERE slug = ?').bind(slug).first()) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  await db(env)
    .prepare('INSERT INTO categories (id,name,name_bn,slug,parent_id,image,sort_order,is_active) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, b.name, b.name_bn || null, slug, b.parent_id || null, b.image || null, Number(b.sort_order || 0), b.is_active === false ? 0 : 1)
    .run();
  const row = await db(env).prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  return json({ ok: true, category: row }, { status: 201 });
}
