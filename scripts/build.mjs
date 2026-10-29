import { rm, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });

// Pre-render the shell at each top-level route so a cold visit to a deep link
// still paints immediately instead of waiting on the SPA redirect.
const html = await readFile('public/index.html', 'utf8');
const routes = ['shop', 'cart', 'checkout', 'track', 'wishlist', 'success'];
for (const route of routes) {
  await mkdir(`dist/${route}`, { recursive: true });
  await writeFile(`dist/${route}/index.html`, html);
}

console.log(`Built Shoukhin storefront → dist (${routes.length + 1} shells, admin included)`);
