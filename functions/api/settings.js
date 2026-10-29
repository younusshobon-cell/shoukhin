import { json, getSettings, setSettings, readSession, bad, PUBLIC_SETTING_KEYS } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(env, request);
  // Signed in: everything. Public: the storefront subset only, so tokens never leak.
  const settings = session ? await getSettings(env) : await getSettings(env, PUBLIC_SETTING_KEYS);
  if (session) {
    // Never hand back secrets in full; show only whether each is set.
    for (const k of ['meta_page_token', 'meta_app_secret', 'whatsapp_token']) {
      if (settings[k]) settings[k] = '••••••••';
    }
  }
  return json({ ok: true, settings });
}

export async function onRequestPut({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return bad('Expected a JSON body'); }
  const patch = body?.settings;
  if (!patch || typeof patch !== 'object') return bad('settings object is required');

  // A masked value means "leave this secret alone".
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'string' && /^•+$/.test(v)) delete patch[k];
  }
  await setSettings(env, patch);
  return json({ ok: true, saved: Object.keys(patch).length });
}
