import { db, json, bad } from '../_lib.js';

export async function onRequestGet({ params, env }) {
  const conv = await db(env).prepare('SELECT * FROM conversations WHERE id = ?').bind(params.id).first();
  if (!conv) return bad('Conversation not found', 404);
  const { results } = await db(env)
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT 300').bind(params.id).all();
  // Opening a thread clears its unread badge.
  await db(env).prepare('UPDATE conversations SET unread = 0 WHERE id = ?').bind(params.id).run();
  return json({ ok: true, conversation: { ...conv, unread: 0 }, messages: results || [] });
}

export async function onRequestPut({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const sets = [], binds = [];
  if (b.status !== undefined) {
    if (!['open', 'closed'].includes(b.status)) return bad('Status must be open or closed');
    sets.push('status = ?'); binds.push(b.status);
  }
  if (b.customer_name !== undefined) { sets.push('customer_name = ?'); binds.push(b.customer_name || null); }
  if (b.unread !== undefined) { sets.push('unread = ?'); binds.push(Number(b.unread) || 0); }
  if (!sets.length) return bad('Nothing to update');
  binds.push(params.id);
  const res = await db(env).prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  if (!res.meta.changes) return bad('Conversation not found', 404);
  return json({ ok: true });
}
