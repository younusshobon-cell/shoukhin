import { bad } from '../_lib.js';

// Public image serving straight from R2, same-origin so the CSP stays tight.
export async function onRequestGet({ params, env, request }) {
  if (!env.MEDIA) return bad('R2 bucket "MEDIA" is not bound.', 503);
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const etag = object.httpEtag;
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', etag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

export async function onRequestDelete({ params, env }) {
  if (!env.MEDIA) return bad('R2 bucket "MEDIA" is not bound.', 503);
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!key || key.includes('..')) return bad('Bad key', 400);
  await env.MEDIA.delete(key);
  return new Response(null, { status: 204 });
}
