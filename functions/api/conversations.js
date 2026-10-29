import { db, json } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const status = url.searchParams.get('status') || 'open';
  const where = [], binds = [];
  if (channel && channel !== 'all') { where.push('channel = ?'); binds.push(channel); }
  if (status && status !== 'all') { where.push('status = ?'); binds.push(status); }
  const { results } = await db(env)
    .prepare(`SELECT * FROM conversations ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY last_message_at DESC LIMIT 200`)
    .bind(...binds).all();
  return json({ ok: true, conversations: results || [] });
}
