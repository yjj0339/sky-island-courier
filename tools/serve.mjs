// 极简静态服务器：node tools/serve.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || 5200);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg', '.css': 'text/css' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) { res.writeHead(403); return res.end(); }
    let f = join(root, p || 'index.html');
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch {}
    const buf = await readFile(f);
    res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log('serving', root, 'on', port));
