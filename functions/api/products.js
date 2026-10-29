import { db, json, bad, shapeProduct, slugify, newId } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const category = url.searchParams.get('category');
  const where = [];
  const binds = [];
  if (q) { where.push('(p.title LIKE ? OR p.sku LIKE ?)'); binds.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push('p.category_id = ?'); binds.push(category); }
  const sql = `SELECT p.*, c.name AS category_name FROM products p
                 LEFT JOIN categories c ON c.id = p.category_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY p.sort_order, p.created_at DESC`;
  const { results } = await db(env).prepare(sql).bind(...binds).all();
  return json({ ok: true, products: (results || []).map(shapeProduct) });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  if (!b?.title) return bad('Title is required');
  if (b.price == null || Number(b.price) <= 0) return bad('A price above zero is required');
  if (b.discount_price != null && b.discount_price !== '' && Number(b.discount_price) >= Number(b.price)) {
    return bad('Discount price must be lower than the regular price');
  }

  const id = b.id || newId('p');
  let slug = slugify(b.slug || b.title);
  // Keep slugs unique without failing the save.
  const clash = await db(env).prepare('SELECT id FROM products WHERE slug = ?').bind(slug).first();
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  await db(env)
    .prepare(
      `INSERT INTO products
        (id,title,title_bn,slug,sku,short_description,description,category_id,price,discount_price,
         stock,sizes,colors,images,fabric,care,tag,is_featured,is_flash_sale,flash_sale_ends_at,
         is_active,sort_order,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    )
    .bind(
      id, b.title, b.title_bn || null, slug, b.sku || null,
      b.short_description || null, b.description || null, b.category_id || null,
      Number(b.price), b.discount_price ? Number(b.discount_price) : null,
      Number(b.stock || 0),
      JSON.stringify(b.sizes || []), JSON.stringify(b.colors || []), JSON.stringify(b.images || []),
      b.fabric || null, b.care || null, b.tag || null,
      b.is_featured ? 1 : 0, b.is_flash_sale ? 1 : 0, b.flash_sale_ends_at || null,
      b.is_active === false ? 0 : 1, Number(b.sort_order || 0),
    )
    .run();

  const row = await db(env).prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
  return json({ ok: true, product: shapeProduct(row) }, { status: 201 });
}
