import { db, getSettings, json, timingSafeEqual } from '../_lib.js';

// One webhook endpoint for both Messenger and WhatsApp Cloud API.
// Point Meta at:  https://<your-domain>/api/webhooks/meta

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const { meta_verify_token } = await getSettings(env, ['meta_verify_token']);
  if (mode === 'subscribe' && meta_verify_token && timingSafeEqual(token, meta_verify_token)) {
    return new Response(challenge || '', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('Verification failed', { status: 403 });
}

async function signatureValid(appSecret, rawBody, header) {
  if (!appSecret) return false;
  if (!header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, header.slice(7));
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const settings = await getSettings(env, ['meta_app_secret']);

  // Meta signs every delivery. Unsigned or wrongly signed payloads are dropped.
  const valid = await signatureValid(settings.meta_app_secret, raw, request.headers.get('x-hub-signature-256'));
  if (!valid) return new Response('Bad signature', { status: 403 });

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ ok: true, ignored: 'unparseable' }); }

  const incoming = [];
  for (const entry of payload.entry || []) {
    // --- Messenger
    for (const m of entry.messaging || []) {
      if (!m.message || m.message.is_echo) continue;
      incoming.push({
        channel: 'messenger',
        external_id: m.sender?.id,
        mid: m.message.mid || null,
        body: m.message.text || null,
        attachment: m.message.attachments?.[0]?.payload?.url || null,
        attachment_type: m.message.attachments?.[0]?.type || null,
        name: null,
        phone: null,
      });
    }
    // --- WhatsApp Cloud API
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const profileByWaId = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || null]));
      for (const m of v.messages || []) {
        incoming.push({
          channel: 'whatsapp',
          external_id: m.from,
          mid: m.id || null,
          body: m.text?.body || m.button?.text || m.interactive?.list_reply?.title || null,
          attachment: null,
          attachment_type: m.type && m.type !== 'text' ? m.type : null,
          name: profileByWaId[m.from] || null,
          phone: m.from,
        });
      }
    }
  }

  for (const msg of incoming) {
    if (!msg.external_id) continue;
    const convId = `${msg.channel}:${msg.external_id}`;
    const preview = (msg.body || `[${msg.attachment_type || 'attachment'}]`).slice(0, 180);
    try {
      await db(env).batch([
        db(env).prepare(
          `INSERT INTO conversations (id,channel,external_id,customer_name,customer_phone,last_message,last_direction,last_message_at,unread)
             VALUES (?,?,?,?,?,?, 'in', datetime('now'), 1)
           ON CONFLICT(channel, external_id) DO UPDATE SET
             last_message    = excluded.last_message,
             last_direction  = 'in',
             last_message_at = excluded.last_message_at,
             unread          = conversations.unread + 1,
             status          = 'open',
             customer_name   = COALESCE(conversations.customer_name, excluded.customer_name),
             customer_phone  = COALESCE(conversations.customer_phone, excluded.customer_phone)`,
        ).bind(convId, msg.channel, msg.external_id, msg.name, msg.phone, preview),
        db(env).prepare(
          `INSERT OR IGNORE INTO messages (conversation_id,direction,body,attachment_url,attachment_type,external_mid,status)
             VALUES ((SELECT id FROM conversations WHERE channel = ? AND external_id = ?), 'in', ?, ?, ?, ?, 'delivered')`,
        ).bind(msg.channel, msg.external_id, msg.body, msg.attachment, msg.attachment_type, msg.mid),
      ]);
    } catch { /* never fail the webhook: Meta retries and would duplicate */ }
  }

  // Meta needs a fast 200 or it backs off and eventually unsubscribes.
  return json({ ok: true, received: incoming.length });
}
