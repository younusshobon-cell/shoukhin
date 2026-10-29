import { db, json, shapeProduct, getSettings, PUBLIC_SETTING_KEYS } from './_lib.js';

// Public catalogue feed. One request gives the storefront everything it needs to boot.
export async function onRequestGet({ env }) {
  const D = db(env);
  const [cats, prods, settings] = await Promise.all([
    D.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name').all(),
    D.prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1
        ORDER BY p.sort_order, p.created_at DESC`,
    ).all(),
    getSettings(env, PUBLIC_SETTING_KEYS),
  ]);

  return json(
    {
      ok: true,
      categories: cats.results || [],
      products: (prods.results || []).map(shapeProduct),
      settings,
    },
    { headers: { 'cache-control': 'public, max-age=30, stale-while-revalidate=300' } },
  );
}
