import { db, json } from './_lib.js';

// Dashboard overview numbers.
export async function onRequestGet({ env }) {
  const D = db(env);
  const [totals, byStatus, recent, topProducts, lowStock, unread, daily] = await Promise.all([
    D.prepare(
      `SELECT
         COUNT(*)                                                     AS orders,
         COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total END), 0)        AS revenue,
         COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN 1 END), 0)   AS orders_today,
         COALESCE(SUM(CASE WHEN date(created_at) = date('now') AND status != 'cancelled' THEN total END), 0) AS revenue_today,
         COALESCE(SUM(CASE WHEN created_at >= datetime('now','-30 day') AND status != 'cancelled' THEN total END), 0) AS revenue_30d
       FROM orders`,
    ).first(),
    D.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all(),
    D.prepare('SELECT id, customer_name, customer_phone, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 8').all(),
    D.prepare(
      `SELECT oi.title, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status != 'cancelled'
        GROUP BY oi.title ORDER BY qty DESC LIMIT 6`,
    ).all(),
    D.prepare('SELECT id, title, stock FROM products WHERE is_active = 1 AND stock <= 5 ORDER BY stock LIMIT 8').all(),
    D.prepare("SELECT COUNT(*) AS n FROM conversations WHERE unread > 0").first(),
    D.prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
         FROM orders WHERE created_at >= datetime('now','-13 day') AND status != 'cancelled'
        GROUP BY day ORDER BY day`,
    ).all(),
  ]);

  return json({
    ok: true,
    totals: totals || {},
    byStatus: Object.fromEntries((byStatus.results || []).map((r) => [r.status, r.n])),
    recent: recent.results || [],
    topProducts: topProducts.results || [],
    lowStock: lowStock.results || [],
    unreadConversations: unread?.n || 0,
    daily: daily.results || [],
  });
}
