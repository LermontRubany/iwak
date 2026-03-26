import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

/* Dynamic viewport height for WebView (Instagram, Telegram) */
const setVH = () => {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
};
window.addEventListener('resize', setVH, { passive: true });
window.addEventListener('orientationchange', setVH, { passive: true });
setVH();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
