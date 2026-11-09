/* 運転日報 PWA 2026.11.09.1 — same-origin static shell only. */
'use strict';
const VERSION = '2026.11.09.1';
const CACHE_PREFIX = 'truck-log-pwa-shell-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const BASE_URL = new URL('./', self.location.href);
const INDEX_URL = new URL('index.html', BASE_URL).href;
const STATIC_PATHS = [
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];
const STATIC_URLS = new Set(STATIC_PATHS.map(path => new URL(path, BASE_URL).href));
const SHELL_URLS = [INDEX_URL, ...STATIC_URLS];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Do not install a partial shell or silently use the HTTP cache.
    await Promise.all(SHELL_URLS.map(async url => {
      const response = await fetch(new Request(url, {cache: 'no-store', credentials: 'same-origin'}));
      if (!response.ok || response.type !== 'basic') throw new Error('Shell download failed');
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Never delete other applications' caches, localStorage or IndexedDB.
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheKey, isPage) {
  try {
    const response = await fetch(new Request(request, {cache: 'no-store'}));
    if (response.ok && response.type === 'basic') {
      // A cache quota/write error must not prevent a successful online launch.
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKey, response.clone());
      } catch (error) { /* Offline availability may be limited; keep the network response. */ }
      return response;
    }
    const cached = await caches.match(cacheKey, {cacheName: CACHE_NAME});
    return cached || response;
  } catch (error) {
    const cached = await caches.match(cacheKey, {cacheName: CACHE_NAME});
    if (cached) return cached;
    if (isPage) {
      return new Response('<!DOCTYPE html><html lang="ja"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>運転日報・オフライン</title><body><h1>オフラインです</h1><p>初回は通信できる場所で運転日報を開いてください。端末の保存データは変更していません。</p></body></html>', {
        status: 503, headers: {'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store'}
      });
    }
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  // Apps Script, Drive, POST, downloads and all other origins bypass this worker.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin || !url.pathname.startsWith(BASE_URL.pathname)) return;
  const isPage = request.mode === 'navigate' &&
    (url.pathname === BASE_URL.pathname || url.pathname === new URL(INDEX_URL).pathname);
  const staticUrl = url.origin + url.pathname;
  if (!isPage && (url.search || !STATIC_URLS.has(staticUrl))) return;
  event.respondWith(networkFirst(request, isPage ? INDEX_URL : staticUrl, isPage));
});
