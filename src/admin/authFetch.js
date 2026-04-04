import { notifyGlobal } from '../context/NotificationsContext';

const TOKEN_KEY = 'iwak_admin_token';
let _redirecting = false;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Decode JWT payload without verification.
 * Returns null on any parse error.
 */
function decodePayload(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function isTokenValid() {
  const token = getToken();
  if (!token) return false;
  const payload = decodePayload(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
}

/**
 * Returns minutes remaining until token expires.
 * Returns 0 if token is missing/invalid/expired.
 */
export function tokenMinutesLeft() {
  const token = getToken();
  if (!token) return 0;
  const payload = decodePayload(token);
  if (!payload || !payload.exp) return 0;
  const ms = payload.exp * 1000 - Date.now();
  return ms > 0 ? Math.floor(ms / 60000) : 0;
}

/**
 * Centralised logout — single place for cleanup + redirect.
 */
export function logout(reason = 'unknown') {
  if (_redirecting) return;
  _redirecting = true;
  // eslint-disable-next-line no-console
  console.warn('[auth] logout:', reason);
  localStorage.removeItem(TOKEN_KEY);
  notifyGlobal('error', 'Сессия истекла — войдите снова');
  setTimeout(() => { window.location.href = '/adminpanel'; }, 600);
}

/** Reset redirect guard (call on fresh login) */
export function resetAuthGuard() { _redirecting = false; }

/**
 * fetch wrapper that injects Authorization header
 * and redirects to login on 401 or expired token.
 */
export default async function authFetch(url, opts = {}) {
  if (!isTokenValid()) {
    logout('token expired (pre-flight check)');
    return new Response(JSON.stringify({ error: 'Сессия истекла' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let res;
  try {
    const headers = { ...opts.headers, Authorization: `Bearer ${getToken()}` };
    res = await fetch(url, { ...opts, headers });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[authFetch] network error:', url, e.message);
    notifyGlobal('error', 'Нет соединения с сервером');
    throw e;
  }

  if (res.status === 401) {
    // eslint-disable-next-line no-console
    console.warn('[authFetch] 401 from', url);
    logout('server returned 401');
    return res;
  }

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error('[authFetch] API error:', res.status, url);
  }

  return res;
}
