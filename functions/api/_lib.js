// Shared helpers for every Shoukhin API route.

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

export function bad(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

export const ok = (data = {}) => json({ ok: true, ...data });

// ---------------------------------------------------------------- crypto bits
const enc = new TextEncoder();

function b64urlEncode(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function hmacHex(secret, message) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time string compare.
export function timingSafeEqual(a, b) {
  const ab = enc.encode(String(a));
  const bb = enc.encode(String(b));
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Password hash format: pbkdf2$<iterations>$<saltB64url>$<hashB64url>
export async function pbkdf2Hash(password, saltBytes, iterations = 100000) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    256,
  );
  return `pbkdf2$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(bits)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!stored.startsWith('pbkdf2$')) return timingSafeEqual(password, stored); // plaintext fallback
  const [, iterStr, saltStr] = stored.split('$');
  const recomputed = await pbkdf2Hash(password, b64urlDecode(saltStr), Number(iterStr));
  return timingSafeEqual(recomputed, stored);
}

// ------------------------------------------------------------------ sessions
const COOKIE = 'shk_session';
const SESSION_TTL = 60 * 60 * 12; // 12 hours

export async function createSession(env) {
  const payload = b64urlEncode(
    enc.encode(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_TTL })),
  );
  const sig = await hmacHex(sessionSecret(env), payload);
  return `${payload}.${sig}`;
}

export async function readSession(env, request) {
  if (!env.SESSION_SECRET && !env.ADMIN_PASSWORD_HASH && !env.ADMIN_PASSWORD) return null;
  const raw = (request.headers.get('cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const token = raw.slice(COOKIE.length + 1);
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await hmacHex(sessionSecret(env), payload);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookie(value, maxAge = SESSION_TTL) {
  const parts = [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

export const clearCookie = () => sessionCookie('', 0);

function sessionSecret(env) {
  // Falls back to the password hash so the app still works if SESSION_SECRET is unset,
  // which also invalidates every session when the password changes.
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD;
  if (!secret) throw new Error('Admin session signing is not configured.');
  return secret;
}

// ----------------------------------------------------------------- db helpers
export function db(env) {
  if (!env.DB) throw new Error('D1 binding "DB" is missing. Bind shoukhin-db in the Pages project.');
  return env.DB;
}

export async function getSettings(env, keys = null) {
  const sql = keys
    ? `SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`
    : 'SELECT key, value FROM settings';
  const stmt = keys ? db(env).prepare(sql).bind(...keys) : db(env).prepare(sql);
  const { results } = await stmt.all();
  return Object.fromEntries((results || []).map((r) => [r.key, r.value]));
}

export async function setSettings(env, obj) {
  const stmts = Object.entries(obj).map(([k, v]) =>
    db(env)
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(k, v == null ? null : String(v)),
  );
  if (stmts.length) await db(env).batch(stmts);
}

// Settings the storefront is allowed to read without auth.
export const PUBLIC_SETTING_KEYS = [
  'store_name', 'tagline', 'hotline', 'email', 'address',
  'whatsapp_number', 'messenger_username', 'facebook_url', 'instagram_url',
  'announcement', 'delivery_inside_dhaka', 'delivery_outside_dhaka',
  'free_delivery_threshold', 'bkash_number', 'nagad_number', 'rocket_number',
  'cod_enabled', 'return_days',
];

// --------------------------------------------------------------- misc helpers
export function parseJSON(value, fallback) {
  try {
    const v = JSON.parse(value);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function shapeProduct(row) {
  if (!row) return null;
  return {
    ...row,
    sizes: parseJSON(row.sizes, []),
    colors: parseJSON(row.colors, []),
    images: parseJSON(row.images, []),
    is_featured: !!row.is_featured,
    is_flash_sale: !!row.is_flash_sale,
    is_active: !!row.is_active,
  };
}

export function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `item-${Date.now()}`;
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// Order ids look like SHK-261030-4821
export function newOrderId() {
  const d = new Date();
  const stamp = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
  return `SHK-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function num(v, fallback = 0) {
  // Number(null) and Number('') are both 0, which silently turned a missing
  // ?limit= into "LIMIT 0". Treat empty values as absent instead.
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const DHAKA_DISTRICTS = ['Dhaka'];

export function deliveryChargeFor(district, settings) {
  const inside = num(settings.delivery_inside_dhaka, 70);
  const outside = num(settings.delivery_outside_dhaka, 130);
  return DHAKA_DISTRICTS.includes(String(district || '').trim()) ? inside : outside;
}
