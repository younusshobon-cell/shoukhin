import { bad, ok, json, verifyPassword, createSession, sessionCookie, getSettings, setSettings, num } from '../_lib.js';

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function onRequestPost({ request, env }) {
  const configured = env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD;
  if (!configured) {
    return bad(
      'No admin password is configured. Set ADMIN_PASSWORD_HASH in the Pages project environment variables.',
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return bad('Expected a JSON body');
  }
  const password = String(body?.password || '');
  if (!password) return bad('Password is required');

  // Lockout state lives in D1 so it survives across isolates.
  let state = { attempts: 0, locked_until: 0 };
  try {
    const s = await getSettings(env, ['login_attempts', 'login_locked_until']);
    state = { attempts: num(s.login_attempts, 0), locked_until: num(s.login_locked_until, 0) };
  } catch { /* settings table unavailable: fail open on lockout only */ }

  const now = Date.now();
  if (state.locked_until > now) {
    const mins = Math.ceil((state.locked_until - now) / 60000);
    return bad(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 429);
  }

  const valid = await verifyPassword(password, configured);
  if (!valid) {
    const attempts = state.attempts + 1;
    const patch = { login_attempts: attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.login_locked_until = now + LOCK_MINUTES * 60000;
      patch.login_attempts = 0;
    }
    try { await setSettings(env, patch); } catch { /* ignore */ }
    // Small constant delay to blunt rapid guessing.
    await new Promise((r) => setTimeout(r, 400));
    return bad('Wrong password', 401);
  }

  try { await setSettings(env, { login_attempts: 0, login_locked_until: 0 }); } catch { /* ignore */ }

  const token = await createSession(env);
  return json({ ok: true }, { headers: { 'set-cookie': sessionCookie(token) } });
}
