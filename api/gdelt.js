// GET /api/gdelt?q=<GDELT query>&start=<YYYYMMDDHHMMSS>
// Searches the free GDELT news index for coverage of a place + event type. GDELT allows one request
// every 5 seconds per IP, so calls are queued and results cached for 30 minutes.
// Returns { articles: [{ url, title, date, domain, image, country }] }.

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const MIN_GAP_MS = 5500;
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();
let queue = Promise.resolve();
let lastCall = 0;

function schedule(task) {
  const run = queue.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

function parseSeen(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

async function search(q, start) {
  const params = new URLSearchParams({ query: q, mode: 'artlist', format: 'json', maxrecords: '75', sort: 'datedesc' });
  if (start) params.set('startdatetime', start); else params.set('timespan', '14d');
  let lastError = 'GDELT rate limit';
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await schedule(() => fetch(`${ENDPOINT}?${params}`, {
        signal: AbortSignal.timeout(30000),
        headers: { 'user-agent': 'EarthLiveWeather/1.0 (local news matching for a disaster map)' },
      }));
    } catch (e) {
      lastError = String((e.cause && (e.cause.code || e.cause.message)) || e.message || e);   // GDELT often drops connections under load
      continue;
    }
    if (res.status === 429) continue;                  // rate limited: the queue spaces the retry out
    if (!res.ok) throw new Error(`GDELT ${res.status}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 120) || 'GDELT returned no JSON'); }
    return (data.articles || []).map((a) => ({
      url: a.url, title: a.title, date: parseSeen(a.seendate), domain: a.domain,
      image: a.socialimage || null, country: a.sourcecountry || null,
    }));
  }
  throw new Error(lastError);
}

export default async function handler(req, res) {
  const send = (status, body, maxAge) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', maxAge ? `public, max-age=${maxAge}` : 'no-store');
    res.end(JSON.stringify(body));
  };
  const sp = new URL(req.url, 'http://local').searchParams;
  const q = sp.get('q') || '';
  const start = sp.get('start') || '';
  if (!q || q.length > 600) return send(400, { error: 'Missing or too long query' }, 0);
  if (start && !/^\d{14}$/.test(start)) return send(400, { error: 'Bad start' }, 0);

  const key = `${q}|${start}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return send(200, hit.data, 1800);
  try {
    const data = { articles: await search(q, start) };
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, { t: Date.now(), data });
    return send(200, data, 1800);
  } catch (e) {
    return send(200, { articles: [], error: String(e.message || e) }, 0);
  }
}
