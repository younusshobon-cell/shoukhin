import { rm, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });
const html = await readFile('public/index.html', 'utf8');
for (const route of ['shop','categories','offers','account','bag','checkout','product']) {
  await mkdir(`dist/${route}`, { recursive: true });
  await writeFile(`dist/${route}/index.html`, html);
}
console.log('Built Shoukhin storefront → dist');
