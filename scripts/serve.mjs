import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'public');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json' };
http.createServer(async (req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
  if (!path.extname(file)) file = path.join(root,'index.html');
  try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(bytes); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(3000,'0.0.0.0',()=>console.log('Shoukhin: http://localhost:3000'));
