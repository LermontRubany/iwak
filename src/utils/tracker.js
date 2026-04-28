const SESSION_KEY = 'iwak_sid';
const FLUSH_MS = 10000;
const BATCH_SIZE = 5;

let buffer = [];
let timer = null;

function getSessionId() {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function flush() {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
    keepalive: true,
  }).catch(() => {});
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_MS);
}

export function track(type, data = {}) {
  buffer.push({ type, data, sessionId: getSessionId() });
  if (buffer.length >= BATCH_SIZE) {
    if (timer) { clearTimeout(timer); timer = null; }
    flush();
  } else {
    scheduleFlush();
  }
}

// Flush remaining events when user leaves/hides the page
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
