// Local dev server: serves the static site and the /api/preview endpoint.
//   node server.mjs            → http://localhost:8140
//   PORT=3000 node server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import preview from './api/preview.js';
import gdelt from './api/gdelt.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8140;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  if (pathname === '/api/preview') return preview(req, res);
  if (pathname === '/api/gdelt') return gdelt(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }

  // Same as Vercel's cleanUrls: /about serves about.html.
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname);
  if (!path.extname(rel)) rel += '.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) || file.includes(`${path.sep}api${path.sep}`) || file.endsWith('server.mjs')) {
    res.statusCode = 404; return res.end('Not found');
  }
  try {
    const body = await readFile(file);
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(port, () => console.log(`Earth live weather → http://localhost:${port}`));
