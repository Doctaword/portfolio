// Caches the whole mirrored site so it works offline once it has been opened online.
const BASE = new URL('./', self.location).href;
let manifestP = null;
const getManifest = () => manifestP || (manifestP = fetch(BASE + 'precache.json', { cache: 'no-store' }).then(r => r.json()));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const m = await fetch(BASE + 'precache.json', { cache: 'no-store' }).then(r => r.json());
    const c = await caches.open('site-' + m.version);
    await c.put(BASE + 'precache.json', new Response(JSON.stringify(m), { headers: { 'content-type': 'application/json' } }));
    await c.addAll(m.core.map(p => BASE + p));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const cur = await currentCache();
    // carry over media already downloaded by an older version, then drop old caches
    for (const k of await caches.keys()) {
      if (k === cur || !k.startsWith('site-')) continue;
      const old = await caches.open(k), now = await caches.open(cur);
      for (const req of await old.keys()) if (!(await now.match(req))) await now.put(req, await old.match(req));
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function currentCache() {
  const keys = (await caches.keys()).filter(k => k.startsWith('site-'));
  for (const k of keys) {
    const r = await (await caches.open(k)).match(BASE + 'precache.json');
    if (r) { const m = await r.json(); if (keys.length === 1 || k === 'site-' + m.version) return k; }
  }
  return keys[keys.length - 1];
}

let running = null;
async function broadcast(msg) { for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg); }
async function cacheMedia() {
  const name = await currentCache();
  const c = await caches.open(name);
  const m = await (await c.match(BASE + 'precache.json')).json();
  const all = m.core.concat(m.media);
  const have = new Set((await c.keys()).map(r => r.url));
  const todo = all.filter(p => !have.has(BASE + p));
  let done = all.length - todo.length;
  if (!todo.length) return broadcast({ type: 'ready' });
  let failed = 0, i = 0, lastSent = 0;
  async function worker() {
    while (i < todo.length) {
      const p = todo[i++];
      try { const r = await fetch(BASE + p, { cache: 'no-cache' }); if (!r.ok) throw 0; await c.put(BASE + p, r); } catch (e) { failed++; }
      done++;
      if (Date.now() - lastSent > 400) { lastSent = Date.now(); broadcast({ type: 'progress', done, total: all.length }); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  broadcast(failed ? { type: 'error' } : { type: 'ready' });
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'cache-media') {
    running = running || cacheMedia().finally(() => { running = null; });
    e.waitUntil(running);
  }
});

async function rangeResponse(req, res) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range'));
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = buf.byteLength - +m[2]; end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'content-type': res.headers.get('content-type') || 'video/mp4',
    'content-range': `bytes ${start}-${end}/${buf.byteLength}`, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes' } });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(BASE)) return;
  e.respondWith((async () => {
    let url = req.url.split('#')[0].split('?')[0];
    if (url.endsWith('/')) url += 'index.html';
    const name = await currentCache();
    const c = name && await caches.open(name);
    let res = c && await c.match(url);
    if (!res) {
      try {
        res = await fetch(url === req.url ? req : url);
        if (res.ok && res.status === 200 && c && !req.headers.has('range')) c.put(url, res.clone());
        return res;
      } catch (err) {
        if (req.mode === 'navigate' && c) return (await c.match(BASE + 'index.html')) || Response.error();
        return Response.error();
      }
    }
    if (req.headers.has('range')) return rangeResponse(req, res);
    return res;
  })());
});
