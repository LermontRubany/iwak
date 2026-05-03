import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './registerServiceWorker.js'

function getBundleReloadKey() {
  const entry = Array.from(document.scripts).find((script) => script.src && script.src.includes('/assets/index-'));
  const marker = entry?.src || 'unknown-entry';
  return `iwak:chunk-reload-once:${marker}`;
}

function shouldAutoRecoverFromChunkError(reason) {
  const msg = String(reason?.message || reason || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('ChunkLoadError')
  );
}

function recoverOnceFromChunkError() {
  try {
    const key = getBundleReloadKey();
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // no-op: if sessionStorage is unavailable, still try one reload
  }
  window.location.reload();
  return true;
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  recoverOnceFromChunkError();
});

window.addEventListener('unhandledrejection', (event) => {
  if (!shouldAutoRecoverFromChunkError(event?.reason)) return;
  if (recoverOnceFromChunkError()) event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
