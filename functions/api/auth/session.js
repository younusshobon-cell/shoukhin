import { json, readSession } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(env, request);
  const configured = !!(env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD);
  return json({ ok: true, signedIn: !!session, configured, expiresAt: session?.exp ?? null });
}
