// GET /api/preview?url=<article url>
// Returns the article's own share image (og:image / twitter:image) so the news list can show a thumbnail.
// Works as a Vercel serverless function and is also used by ../server.mjs for local development.
//
// Safety: only http(s), blocks private/loopback addresses (re-checked on every redirect), reads at most
// ~800 KB of HTML, 8 s timeout, and only ever returns a URL string, never proxied content.

import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 800 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublic(url) {
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) URLs');
  if (url.username || url.password) throw new Error('Credentials not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Blocked address');
}

async function readHead(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;          // the share image always lives in <head>
  }
  reader.cancel().catch(() => {});
  return html;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function findImage(html) {
  const metas = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content && !metas[key]) metas[key] = a.content.trim();
  }
  let img = metas['og:image:secure_url'] || metas['og:image'] || metas['og:image:url'] ||
    metas['twitter:image'] || metas['twitter:image:src'] || metas['image'];
  if (!img) {
    const link = html.match(/<link\b[^>]*rel=["']?image_src["']?[^>]*>/i);
    if (link) img = attrs(link[0]).href;
  }
  return { image: img || null, siteName: metas['og:site_name'] || null };
}

async function preview(rawUrl) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; EarthLiveWeather/1.0; link preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    if (!/html/i.test(res.headers.get('content-type') || '')) return { image: null };
    const { image, siteName } = findImage(await readHead(res));
    let abs = null;
    if (image) {
      try {
        const u = new URL(image, url);
        if (/^https?:$/.test(u.protocol)) abs = u.href;
      } catch { /* ignore bad image urls */ }
    }
    return { image: abs, siteName };
  }
  throw new Error('Too many redirects');
}

export default async function handler(req, res) {
  const send = (status, body, maxAge) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', `public, max-age=${maxAge}`);
    res.end(JSON.stringify(body));
  };
  let target;
  try {
    target = new URL(req.url, 'http://local').searchParams.get('url');
    if (!target || target.length > 2048) return send(400, { error: 'Missing url' }, 0);
    new URL(target);
  } catch {
    return send(400, { error: 'Bad url' }, 0);
  }

  const hit = cache.get(target);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return send(200, hit.data, 86400);
  try {
    const data = await preview(target);
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(target, { t: Date.now(), data });
    return send(200, data, 86400);
  } catch (e) {
    return send(200, { image: null, error: String(e.message || e) }, 600);
  }
}
