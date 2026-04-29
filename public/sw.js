const CACHE_VERSION = 'iwak-static-v1';
const APP_SHELL = '/catalog';
const STATIC_PATHS = [
  '/',
  '/catalog',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function shouldBypass(requestUrl) {
  return (
    requestUrl.pathname.startsWith('/api') ||
    requestUrl.pathname.startsWith('/admin') ||
    requestUrl.pathname.startsWith('/adminpanel') ||
    requestUrl.pathname.startsWith('/uploads')
  );
}

function isStaticAsset(request, requestUrl) {
  return (
    requestUrl.pathname.startsWith('/assets/') ||
    requestUrl.pathname.startsWith('/icons/') ||
    requestUrl.pathname === '/manifest.json' ||
    requestUrl.pathname === '/favicon.svg' ||
    ['script', 'style', 'font', 'image'].includes(request.destination)
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return (await caches.match(request)) || (await caches.match(APP_SHELL));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_PATHS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (!isSameOrigin(requestUrl) || shouldBypass(requestUrl)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset(request, requestUrl)) {
    event.respondWith(cacheFirst(request));
  }
});
