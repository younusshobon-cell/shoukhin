import { readSession, bad, json } from './_lib.js';

// Routes reachable without an admin session. Everything else under /api is guarded.
const PUBLIC = [
  ['GET',  /^\/api\/customer$/],
  ['POST', /^\/api\/customer$/],
  ['PUT',  /^\/api\/customer$/],
  ['POST', /^\/api\/auth\/login$/],
  ['GET',  /^\/api\/auth\/session$/],
  ['POST', /^\/api\/auth\/logout$/],
  ['GET',  /^\/api\/catalog$/],
  ['GET',  /^\/api\/settings$/],
  ['POST', /^\/api\/orders$/],
  ['GET',  /^\/api\/track$/],
  ['POST', /^\/api\/coupons\/validate$/],
  ['POST', /^\/api\/subscribe$/],
  ['GET',  /^\/api\/webhooks\/meta$/],
  ['GET',  /^\/api\/media\/.+$/],      // serving an image is public; uploading is not
  ['POST', /^\/api\/webhooks\/meta$/],
];

function isPublic(method, path) {
  return PUBLIC.some(([m, re]) => m === method && re.test(path));
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': url.origin,
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }

  if (!isPublic(request.method, path)) {
    const session = await readSession(env, request);
    if (!session) return bad('Not signed in', 401);
    context.data.session = session;
  }

  try {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set('x-content-type-options', 'nosniff');
    out.headers.set('referrer-policy', 'same-origin');
    return out;
  } catch (err) {
    const message = err && err.message ? err.message : 'Unexpected server error';
    return json({ ok: false, error: message }, { status: 500 });
  }
}
