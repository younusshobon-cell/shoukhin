import { db, json, bad } from '../_lib.js';

const STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned'];

export async function onRequestGet({ params, env }) {
  const order = await db(env).prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  if (!order) return bad('Order not found', 404);
  const [{ results: items }, { results: events }] = await Promise.all([
    db(env).prepare('SELECT * FROM order_items WHERE order_id = ?').bind(params.id).all(),
    db(env).prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at').bind(params.id).all(),
  ]);
  return json({ ok: true, order: { ...order, items: items || [], events: events || [] } });
}

export async function onRequestPut({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }

  const existing = await db(env).prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  if (!existing) return bad('Order not found', 404);
  if (b.status && !STATUSES.includes(b.status)) return bad(`Status must be one of: ${STATUSES.join(', ')}`);

  const sets = [], binds = [];
  for (const k of ['status', 'courier', 'tracking_code', 'payment_status', 'payment_trx_id', 'notes']) {
    if (b[k] !== undefined) { sets.push(`${k} = ?`); binds.push(b[k] || null); }
  }
  if (!sets.length) return bad('Nothing to update');
  sets.push("updated_at = datetime('now')");
  binds.push(params.id);

  const statements = [db(env).prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds)];

  if (b.status && b.status !== existing.status) {
    statements.push(
      db(env).prepare('INSERT INTO order_events (order_id,status,note) VALUES (?,?,?)')
        .bind(params.id, b.status, b.note || null),
    );
    // Cancelling or returning puts the stock back.
    if (['cancelled', 'returned'].includes(b.status) && !['cancelled', 'returned'].includes(existing.status)) {
      const { results: items } = await db(env)
        .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').bind(params.id).all();
      for (const it of items || []) {
        if (!it.product_id) continue;
        statements.push(
          db(env).prepare('UPDATE products SET stock = stock + ?, sold = MAX(0, sold - ?) WHERE id = ?')
            .bind(it.quantity, it.quantity, it.product_id),
        );
      }
    }
  }

  await db(env).batch(statements);
  const order = await db(env).prepare('SELECT * FROM orders WHERE id = ?').bind(params.id).first();
  return json({ ok: true, order });
}
