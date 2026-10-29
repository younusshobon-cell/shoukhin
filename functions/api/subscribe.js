import { db, json, bad } from './_lib.js';

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const email = String(b?.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return bad('Please enter a valid email address');
  await db(env).prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').bind(email).run();
  return json({ ok: true });
}
