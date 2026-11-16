const cachePrefix = 'wallpaper-resources-v2-wwgl-3.0.2-';
const legacyCachePrefix = 'wallpaper-resources-v1-';
const databaseName = 'wallpaper-browser-cache-v1';
const maxCacheBytes = 1024 * 1024 * 1024;
const maxFileBytes = 512 * 1024 * 1024;
const inFlight = new Map();
let operationQueue = Promise.resolve();

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(legacyCachePrefix)).map((name) => caches.delete(name)));
  })());
});

function enqueue(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('浏览器缓存数据库被占用'));
  });
}

async function readStates(keys) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const store = database.transaction('state', 'readonly').objectStore('state');
      const requests = keys.map((key) => store.get(key));
      const transaction = store.transaction;
      transaction.oncomplete = () => resolve(requests.map((request) => request.result));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('读取缓存状态被中止'));
    });
  } finally { database.close(); }
}

async function readAllState() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const store = database.transaction('state', 'readonly').objectStore('state');
      const keys = store.getAllKeys();
      const values = store.getAll();
      const transaction = store.transaction;
      transaction.oncomplete = () => resolve(keys.result.map((key, index) => [key, values.result[index]]));
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('读取缓存状态被中止'));
    });
  } finally { database.close(); }
}

async function writeStates(entries) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      for (const [key, value] of entries) store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('写入缓存状态被中止'));
    });
  } finally { database.close(); }
}

async function deleteStates(keys) {
  if (!keys.length) return;
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      for (const key of keys) store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('删除缓存状态被中止'));
    });
  } finally { database.close(); }
}

async function snapshot(workshopId) {
  const [enabled, generation, version] = await readStates(['enabled', 'generation', `version:${workshopId}`]);
  return { enabled: enabled === true, generation: Number(generation) || 0, version: typeof version === 'string' ? version : '' };
}

function cacheName(workshopId, version) {
  return `${cachePrefix}${workshopId}-${encodeURIComponent(version)}`;
}

function metadataKey(name) {
  return `meta:${name}`;
}

function managedCache(name) {
  return name.startsWith(cachePrefix) || name.startsWith(legacyCachePrefix);
}

function decorate(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set('X-Wallpaper-Cache', cacheStatus);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function ranged(response, range, cacheStatus) {
  if (!range || response.status !== 200) return decorate(response, cacheStatus);
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const blob = await response.blob();
  const total = blob.size;
  if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}`, 'X-Wallpaper-Cache': cacheStatus } });
  let start = 0;
  let end = total - 1;
  if (!match[1] && match[2]) start = Math.max(0, total - Number(match[2]));
  else start = Number(match[1]);
  if (match[2] && match[1]) end = Math.min(Number(match[2]), end);
  if (!Number.isSafeInteger(start) || start > end || start >= total) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}`, 'X-Wallpaper-Cache': cacheStatus } });
  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  headers.set('X-Wallpaper-Cache', cacheStatus);
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

async function evictOverflow(protectedName) {
  const [names, states] = await Promise.all([caches.keys(), readAllState()]);
  const stateMap = new Map(states);
  const candidates = names.filter((name) => name.startsWith(cachePrefix)).map((name) => ({
    name,
    bytes: 0,
    entries: 0,
    lastUsed: 0,
    ...stateMap.get(metadataKey(name)),
  }));
  let total = candidates.reduce((sum, item) => sum + item.bytes, 0);
  const removedMetadata = [];
  for (const candidate of candidates.filter((item) => item.name !== protectedName).sort((a, b) => a.lastUsed - b.lastUsed)) {
    if (total <= maxCacheBytes) break;
    await caches.delete(candidate.name);
    removedMetadata.push(metadataKey(candidate.name));
    total -= candidate.bytes;
  }
  await deleteStates(removedMetadata);
}

async function touch(name, generation) {
  await enqueue(async () => {
    const key = metadataKey(name);
    const [[currentGeneration, current], names] = await Promise.all([readStates(['generation', key]), caches.keys()]);
    if ((Number(currentGeneration) || 0) !== generation || !names.includes(name)) return;
    await writeStates([[key, { bytes: 0, entries: 0, lastUsed: 0, ...current, lastUsed: Date.now() }]]);
  });
}

async function download(request, workshopId, version, generation) {
  const name = cacheName(workshopId, version);
  const key = `${name}|${request.url}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    const range = request.headers.get('range');
    const networkRequest = range ? new Request(request.url, { credentials: 'same-origin' }) : request;
    const load = async (retry) => {
      const response = await fetch(networkRequest);
      if (!response.ok || response.status !== 200) return response;
      const lengthHeader = response.headers.get('Content-Length');
      const declared = lengthHeader === null ? null : Number(lengthHeader);
      if (declared !== null && Number.isSafeInteger(declared) && declared > maxFileBytes) return response;
      let body;
      let timer;
      try {
        body = await Promise.race([
          response.blob(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('读取壁纸资源超时')), 30000); }),
        ]);
      } catch (error) {
        if (retry) return load(false);
        throw error;
      } finally { if (timer) clearTimeout(timer); }
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding');
      headers.set('Content-Length', String(body.size));
      if (!response.headers.get('Content-Encoding') && Number.isSafeInteger(declared) && declared >= 0 && body.size !== declared) {
        if (retry) return load(false);
        return new Response(body, { status: 200, statusText: response.statusText, headers });
      }
      if (body.size <= maxFileBytes) {
        await enqueue(async () => {
          const current = await snapshot(workshopId);
          if (!current.enabled || current.generation !== generation || current.version !== version) return;
          const cache = await caches.open(name);
          await cache.put(request.url, new Response(body, { status: 200, statusText: response.statusText, headers }));
          const key = metadataKey(name);
          const [metadata] = await readStates([key]);
          await writeStates([[key, {
            bytes: (metadata?.bytes || 0) + body.size,
            entries: (metadata?.entries || 0) + 1,
            lastUsed: Date.now(),
          }]]);
          await evictOverflow(name);
        }).catch(() => undefined);
      }
      return new Response(body, { status: 200, statusText: response.statusText, headers });
    };
    return load(true);
  })();
  inFlight.set(key, task);
  try { return await task; }
  finally { if (inFlight.get(key) === task) inFlight.delete(key); }
}

async function serveResource(event, workshopId) {
  const request = event.request;
  try {
    const current = await snapshot(workshopId);
    if (!current.enabled || !current.version) return fetch(request);
    const name = cacheName(workshopId, current.version);
    const cache = await caches.open(name);
    const cached = await cache.match(request.url);
    if (cached) {
      event.waitUntil(touch(name, current.generation).catch(() => undefined));
      return ranged(cached, request.headers.get('range'), 'HIT');
    }
    const response = await download(request, workshopId, current.version, current.generation);
    return ranged(response.clone(), request.headers.get('range'), 'MISS');
  } catch {
    return fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const match = /^\/api\/wallpapers\/(\d+)\/resources(?:\/|$)/.exec(url.pathname);
  if (url.origin === self.location.origin && match) event.respondWith(serveResource(event, match[1]));
});

async function usage() {
  await operationQueue;
  const [names, states] = await Promise.all([caches.keys(), readAllState()]);
  const stateMap = new Map(states);
  let bytes = 0;
  let entries = 0;
  for (const name of names.filter((name) => name.startsWith(cachePrefix))) {
    const metadata = stateMap.get(metadataKey(name));
    if (metadata) {
      bytes += metadata.bytes || 0;
      entries += metadata.entries || 0;
    } else {
      const cache = await caches.open(name);
      entries += (await cache.keys()).length;
    }
  }
  return { bytes, entries };
}

self.addEventListener('message', (event) => {
  const respond = async () => {
    try {
      if (event.data?.type === 'wm-cache-enabled') {
        const enabled = await enqueue(async () => {
          const [current, generation] = await readStates(['enabled', 'generation']);
          const next = Boolean(event.data.enabled);
          if (current === next) return next;
          await writeStates([['enabled', next], ['generation', (Number(generation) || 0) + 1]]);
          return next;
        });
        event.ports[0]?.postMessage({ ok: true, enabled });
        return;
      }
      if (event.data?.type === 'wm-cache-prepare') {
        const workshopId = String(event.data.workshopId || '');
        const version = String(event.data.version || '');
        const versionTime = Date.parse(version);
        if (!/^\d+$/.test(workshopId) || !version || version.length > 128 || !Number.isFinite(versionTime)) throw new Error('壁纸版本信息无效');
        await enqueue(async () => {
          const [currentVersion, currentTime] = await readStates([`version:${workshopId}`, `versionTime:${workshopId}`]);
          if (typeof currentVersion === 'string' && currentVersion && Number(currentTime) >= versionTime) return;
          await writeStates([[`version:${workshopId}`, version], [`versionTime:${workshopId}`, versionTime]]);
          const current = cacheName(workshopId, version);
          const prefix = `${cachePrefix}${workshopId}-`;
          const names = await caches.keys();
          const obsolete = names.filter((name) => name.startsWith(prefix) && name !== current);
          await Promise.all(obsolete.map((name) => caches.delete(name)));
          await deleteStates(obsolete.map(metadataKey));
        });
        event.ports[0]?.postMessage({ ok: true });
        return;
      }
      if (event.data?.type === 'wm-cache-clear') {
        await enqueue(async () => {
          const [generation, states] = await Promise.all([readStates(['generation']), readAllState()]);
          await writeStates([['generation', (Number(generation) || 0) + 1]]);
          const names = await caches.keys();
          await Promise.all(names.filter(managedCache).map((name) => caches.delete(name)));
          await deleteStates(states.map(([key]) => key).filter((key) => String(key).startsWith('meta:')));
        });
        event.ports[0]?.postMessage({ ok: true });
        return;
      }
      if (event.data?.type === 'wm-cache-usage') {
        event.ports[0]?.postMessage(await usage());
        return;
      }
      throw new Error('未知缓存操作');
    } catch (error) {
      event.ports[0]?.postMessage({ error: error instanceof Error ? error.message : '浏览器缓存操作失败' });
    }
  };
  event.waitUntil(respond());
});
