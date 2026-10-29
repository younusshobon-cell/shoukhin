import { db, json, bad, shapeProduct, slugify } from '../_lib.js';

export async function onRequestGet({ params, env }) {
  const row = await db(env).prepare('SELECT * FROM products WHERE id = ? OR slug = ?').bind(params.id, params.id).first();
  if (!row) return bad('Product not found', 404);
  return json({ ok: true, product: shapeProduct(row) });
}

const FIELDS = {
  title: (v) => String(v), title_bn: (v) => v || null, sku: (v) => v || null,
  short_description: (v) => v || null, description: (v) => v || null,
  category_id: (v) => v || null, price: Number, stock: Number,
  fabric: (v) => v || null, care: (v) => v || null, tag: (v) => v || null,
  sort_order: Number,
  discount_price: (v) => (v === '' || v == null ? null : Number(v)),
  flash_sale_ends_at: (v) => v || null,
  sizes: (v) => JSON.stringify(v || []),
  colors: (v) => JSON.stringify(v || []),
  images: (v) => JSON.stringify(v || []),
  is_featured: (v) => (v ? 1 : 0),
  is_flash_sale: (v) => (v ? 1 : 0),
  is_active: (v) => (v ? 1 : 0),
};

export async function onRequestPut({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }

  const existing = await db(env).prepare('SELECT * FROM products WHERE id = ?').bind(params.id).first();
  if (!existing) return bad('Product not found', 404);

  const price = b.price != null ? Number(b.price) : existing.price;
  const discount = b.discount_price === '' || b.discount_price == null ? null : Number(b.discount_price);
  if (b.discount_price !== undefined && discount != null && discount >= price) {
    return bad('Discount price must be lower than the regular price');
  }

  const sets = [];
  const binds = [];
  for (const [key, cast] of Object.entries(FIELDS)) {
    if (b[key] === undefined) continue;
    sets.push(`${key} = ?`);
    binds.push(cast(b[key]));
  }
  if (b.slug !== undefined) { sets.push('slug = ?'); binds.push(slugify(b.slug)); }
  if (!sets.length) return bad('Nothing to update');

  sets.push("updated_at = datetime('now')");
  binds.push(params.id);
  await db(env).prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();

  const row = await db(env).prepare('SELECT * FROM products WHERE id = ?').bind(params.id).first();
  return json({ ok: true, product: shapeProduct(row) });
}

export async function onRequestDelete({ params, env }) {
  // Soft delete keeps order history readable.
  const res = await db(env)
    .prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
    .bind(params.id).run();
  if (!res.meta.changes) return bad('Product not found', 404);
  return json({ ok: true, archived: params.id });
}
