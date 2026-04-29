const CACHE_VERSION = 'iwak-static-v4';
const CATALOG_IMAGE_CACHE = 'iwak-catalog-images-v1';
const PRODUCT_IMAGE_CACHE = 'iwak-product-images-v1';
const MAX_CATALOG_IMAGES = 360;
const MAX_PRODUCT_IMAGES = 120;
const APP_SHELL = '/catalog';
const OFFLINE_PAGE = '/offline.html';
const STATIC_PATHS = [
  '/',
  '/catalog',
  OFFLINE_PAGE,
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function shouldBypass(requestUrl) {
  return (
    requestUrl.pathname.startsWith('/api') ||
    requestUrl.pathname.startsWith('/admin') ||
    requestUrl.pathname.startsWith('/adminpanel') ||
    (requestUrl.pathname.startsWith('/uploads') &&
      !requestUrl.pathname.startsWith('/uploads/catalog/') &&
      request.destination !== 'image')
  );
}

function isCatalogImage(request, requestUrl) {
  return request.destination === 'image' && requestUrl.pathname.startsWith('/uploads/catalog/');
}

function isProductImage(request, requestUrl) {
  return (
    request.destination === 'image' &&
    requestUrl.pathname.startsWith('/uploads/') &&
    !requestUrl.pathname.startsWith('/uploads/catalog/') &&
    !requestUrl.pathname.startsWith('/uploads/og/')
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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  });

  if (cached) {
    fresh.catch(() => {});
    return cached;
  }
  return fresh;
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  await Promise.all(keys.slice(0, keys.length - maxItems).map((key) => cache.delete(key)));
}

async function cacheFirstCatalogImage(request) {
  const cache = await caches.open(CATALOG_IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).then(() => trimCache(CATALOG_IMAGE_CACHE, MAX_CATALOG_IMAGES));
  }
  return response;
}

async function cacheFirstProductImage(request) {
  const cache = await caches.open(PRODUCT_IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone()).then(() => trimCache(PRODUCT_IMAGE_CACHE, MAX_PRODUCT_IMAGES));
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
  } catch {
    return (await caches.match(request)) || (await caches.match(APP_SHELL)) || (await caches.match(OFFLINE_PAGE));
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
          .filter((key) => key !== CATALOG_IMAGE_CACHE)
          .filter((key) => key !== PRODUCT_IMAGE_CACHE)
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

  if (isCatalogImage(request, requestUrl)) {
    event.respondWith(cacheFirstCatalogImage(request));
    return;
  }

  if (isProductImage(request, requestUrl)) {
    event.respondWith(cacheFirstProductImage(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isStaticAsset(request, requestUrl)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'IWAK', body: event.data?.text() || 'Новый дроп уже на сайте' };
  }

  const title = payload.title || 'IWAK';
  const options = {
    body: payload.body || 'Новый дроп уже на сайте',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/catalog' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/catalog', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
