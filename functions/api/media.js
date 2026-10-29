import { json, bad } from './_lib.js';

const ALLOWED = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif' };
const MAX_BYTES = 8 * 1024 * 1024;

// Admin-only upload. Returns the public path to store on the product.
export async function onRequestPost({ request, env }) {
  if (!env.MEDIA) return bad('R2 bucket "MEDIA" is not bound to this Pages project.', 503);

  const form = await request.formData().catch(() => null);
  if (!form) return bad('Send the image as multipart/form-data');
  const file = form.get('file');
  if (!file || typeof file === 'string') return bad('No file received');
  if (!ALLOWED[file.type]) return bad('Use a WebP, JPEG, PNG or AVIF image');
  if (file.size > MAX_BYTES) return bad('That image is over 8 MB. Export it smaller first.');

  const ext = ALLOWED[file.type];
  const key = `products/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return json({ ok: true, path: `/api/media/${key}`, key, size: file.size }, { status: 201 });
}

export async function onRequestGet({ env }) {
  if (!env.MEDIA) return bad('R2 bucket "MEDIA" is not bound.', 503);
  const list = await env.MEDIA.list({ prefix: 'products/', limit: 200 });
  return json({
    ok: true,
    media: list.objects.map((o) => ({ key: o.key, path: `/api/media/${o.key}`, size: o.size, uploaded: o.uploaded })),
  });
}
