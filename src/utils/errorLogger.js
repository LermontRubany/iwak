const STORAGE_KEY = 'iwak_error_logs';
const CLEANUP_KEY = 'iwak_error_logs_cleanup_product_refresh_v1';
const MAX_LOGS = 100;

/**
 * Маппинг HTTP-статусов → понятные пользователю сообщения.
 */
const STATUS_MAP = {
  401: 'Сессия истекла',
  403: 'Доступ запрещён',
  413: 'Файл слишком большой',
  415: 'Недопустимый формат файла',
  422: 'Не удалось обработать файл',
  429: 'Слишком много запросов',
  500: 'Ошибка сервера',
  502: 'Сервер недоступен',
  503: 'Сервер перегружен',
};

/**
 * Определяет понятное сообщение об ошибке по статусу или типу ошибки.
 * @param {number|null} status — HTTP статус (null для сетевых ошибок)
 * @param {string} [rawMessage] — оригинальное сообщение ошибки
 * @returns {string} — понятное сообщение для пользователя
 */
export function friendlyErrorMessage(status, rawMessage) {
  if (status && STATUS_MAP[status]) return STATUS_MAP[status];

  // Сетевые ошибки (fetch бросает TypeError)
  if (!status || status === 0) {
    if (rawMessage?.includes('Load failed') || rawMessage?.includes('Failed to fetch') || rawMessage?.includes('NetworkError')) {
      return 'Проблема с сетью';
    }
    return 'Нет соединения с сервером';
  }

  if (status >= 500) return 'Ошибка сервера';
  if (status >= 400) return `Ошибка запроса (${status})`;

  return rawMessage || 'Неизвестная ошибка';
}

/**
 * Отправляет ошибку на сервер (fire-and-forget, только если есть токен).
 */
function sendToServer(entry) {
  try {
    const token = localStorage.getItem('iwak_admin_token');
    if (!token) return; // не авторизован — не шлём
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(entry),
    }).catch(() => {}); // fire-and-forget
  } catch {
    // ignore
  }
}

/**
 * Сохраняет запись об ошибке в localStorage + отправляет на сервер.
 * Одинаковые ошибки (url + status + message) агрегируются (count + lastSeen).
 */
export function logError({ url, method, status, message, stack }) {
  try {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const key = `${url}|${status}|${message}`;

    // Агрегация: если последняя ошибка с таким же ключом — инкрементируем
    if (logs.length > 0 && `${logs[0].url}|${logs[0].status}|${logs[0].message}` === key) {
      logs[0].count = (logs[0].count || 1) + 1;
      logs[0].lastSeen = new Date().toISOString();
    } else {
      logs.unshift({
        timestamp: new Date().toISOString(),
        url: url || null,
        method: method || null,
        status: status || null,
        message: message || null,
        stack: stack || null,
        count: 1,
      });
    }

    // Храним только последние MAX_LOGS записей
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // localStorage может быть недоступен — молча игнорируем
  }

  // Отправка на сервер (fire-and-forget)
  sendToServer({ timestamp: new Date().toISOString(), url, method, status, message });
}

/**
 * Возвращает массив сохранённых ошибок.
 */
export function getErrorLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!localStorage.getItem(CLEANUP_KEY)) {
      const cleaned = logs.filter((log) => {
        const isProductRefreshNoise =
          log?.method === 'GET' &&
          log?.status == null &&
          log?.url === '/api/products?limit=2000' &&
          String(log?.message || '').includes('Failed to fetch');
        return !isProductRefreshNoise;
      });
      localStorage.setItem(CLEANUP_KEY, '1');
      if (cleaned.length !== logs.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        return cleaned;
      }
    }
    return logs;
  } catch {
    return [];
  }
}

/**
 * Очищает историю ошибок.
 */
export function clearErrorLogs() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
