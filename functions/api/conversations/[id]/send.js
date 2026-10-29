import { db, json, bad, getSettings } from '../../_lib.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export async function onRequestPost({ params, request, env }) {
  let b;
  try { b = await request.json(); } catch { return bad('Expected a JSON body'); }
  const text = String(b?.body || '').trim();
  if (!text) return bad('Message cannot be empty');
  if (text.length > 1800) return bad('Message is too long');

  const conv = await db(env).prepare('SELECT * FROM conversations WHERE id = ?').bind(params.id).first();
  if (!conv) return bad('Conversation not found', 404);

  const s = await getSettings(env, ['meta_page_token', 'whatsapp_token', 'whatsapp_phone_id']);

  let endpoint, payload, headers = { 'content-type': 'application/json' };
  if (conv.channel === 'messenger') {
    if (!s.meta_page_token) {
      return bad('Facebook is not connected yet. Add your Page access token in Settings.', 409, { needsSetup: 'messenger' });
    }
    endpoint = `${GRAPH}/me/messages?access_token=${encodeURIComponent(s.meta_page_token)}`;
    payload = { recipient: { id: conv.external_id }, messaging_type: 'RESPONSE', message: { text } };
  } else {
    if (!s.whatsapp_token || !s.whatsapp_phone_id) {
      return bad('WhatsApp is not connected yet. Add your token and phone number ID in Settings.', 409, { needsSetup: 'whatsapp' });
    }
    endpoint = `${GRAPH}/${s.whatsapp_phone_id}/messages`;
    headers.authorization = `Bearer ${s.whatsapp_token}`;
    payload = { messaging_product: 'whatsapp', to: conv.external_id, type: 'text', text: { body: text } };
  }

  let sent = false, mid = null, errText = null;
  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      sent = true;
      mid = data.message_id || data.messages?.[0]?.id || null;
    } else {
      errText = data?.error?.message || `Meta returned ${res.status}`;
    }
  } catch (e) {
    errText = e?.message || 'Could not reach Meta';
  }

  await db(env).batch([
    db(env).prepare(
      `INSERT INTO messages (conversation_id,direction,body,external_mid,status,error)
       VALUES (?, 'out', ?, ?, ?, ?)`,
    ).bind(params.id, text, mid, sent ? 'sent' : 'failed', errText),
    db(env).prepare(
      `UPDATE conversations SET last_message = ?, last_direction = 'out', last_message_at = datetime('now'), unread = 0 WHERE id = ?`,
    ).bind(text.slice(0, 180), params.id),
  ]);

  if (!sent) return json({ ok: false, error: errText }, { status: 502 });
  return json({ ok: true, messageId: mid });
}
