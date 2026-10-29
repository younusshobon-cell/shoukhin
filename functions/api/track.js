import { db, json, bad } from './_lib.js';

// Public order lookup. Needs both the order id and the phone it was placed with.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim().toUpperCase();
  const phone = (url.searchParams.get('phone') || '').trim().replace(/[\s-]/g, '');
  if (!id || !phone) return bad('Enter both your order number and phone number');

  const order = await db(env)
    .prepare('SELECT id,status,courier,tracking_code,total,created_at,updated_at FROM orders WHERE id = ? AND replace(customer_phone, " ", "") LIKE ?')
    .bind(id, `%${phone.slice(-10)}`).first();
  if (!order) return bad('No order found with that number and phone', 404);

  const [{ results: items }, { results: events }] = await Promise.all([
    db(env).prepare('SELECT title,size,color,quantity,line_total FROM order_items WHERE order_id = ?').bind(id).all(),
    db(env).prepare('SELECT status,note,created_at FROM order_events WHERE order_id = ? ORDER BY created_at').bind(id).all(),
  ]);
  return json({ ok: true, order: { ...order, items: items || [], events: events || [] } });
}
