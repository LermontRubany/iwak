export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (window.location.protocol !== 'https:' && !isLocalhost) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // PWA should never block the shop if registration fails.
    });
  });
}
