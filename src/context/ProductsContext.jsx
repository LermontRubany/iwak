
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { notifyGlobal } from './NotificationsContext';
import { friendlyErrorMessage, logError } from '../utils/errorLogger';
import { getToken, logout, resetAuthGuard } from '../admin/authFetch';
import { demoProducts, isDemoProductsEnabled } from '../data/demoProducts';

const ProductsContext = createContext(null);

// ── Одноразовый флаг: предотвращает дублирование уведомлений при множественных 401 ──
let _sessionExpired = false;

// Вызвать при успешном логине, чтобы сбросить флаг
export function resetSessionExpired() {
  _sessionExpired = false;
  resetAuthGuard();
}

// ── Хелпер: JWT-токен из localStorage ──
function getAuthHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── Общая обработка 401 (вызывается из apiFetch и uploadImage) ──
function handleUnauthorized(url, method) {
  if (_sessionExpired) return;
  _sessionExpired = true;
  logError({ url, method, status: 401, message: 'Сессия истекла' });
  logout('apiFetch 401 from ' + url);
}

async function apiFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { ...getAuthHeaders(), ...options.headers } });
  } catch (e) {
    const msg = friendlyErrorMessage(null, e.message);
    logError({ url, method: options.method || 'GET', status: null, message: e.message, stack: e.stack });
    notifyGlobal('error', msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized(url, options.method || 'GET');
      throw new Error('Сессия истекла');
    }
    const body = await res.json().catch(() => ({}));
    const raw = body.error || `Ошибка сервера (${res.status})`;
    const msg = body.error || friendlyErrorMessage(res.status, raw);
    logError({ url, method: options.method || 'GET', status: res.status, message: raw });
    notifyGlobal('error', msg);
    throw new Error(msg);
  }
  return res.json();
}

async function apiFetchQuiet(url, options = {}) {
  const timeoutMs = options.timeoutMs || 2500;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchOptions = { ...options };
  delete fetchOptions.timeoutMs;
  let res;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal,
      headers: { ...getAuthHeaders(), ...fetchOptions.headers },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Ошибка сервера (${res.status})`);
  return res.json();
}

// ── sessionStorage cache helpers ──
const CACHE_KEY = 'iwak_products';
const CATALOG_CACHE_KEY = 'iwak_catalog_products_v1';

function readCache() {
  try {
    const key = window.location.pathname.startsWith('/adminpanel') ? CACHE_KEY : CATALOG_CACHE_KEY;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // Валидация: все элементы должны быть объектами с id
    if (arr.some((p) => !p || typeof p !== 'object' || p.id == null)) {
      sessionStorage.removeItem(key); // сбрасываем испорченный кэш
      return null;
    }
    return arr;
  } catch { return null; }
}

function writeCache(items) {
  try {
    const key = window.location.pathname.startsWith('/adminpanel') ? CACHE_KEY : CATALOG_CACHE_KEY;
    sessionStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export function ProductsProvider({ children }) {
  const cached = readCache();
  const useDemoProducts = isDemoProductsEnabled();
  const [products, setProductsRaw] = useState(cached || (useDemoProducts ? demoProducts : []));
  const [loading, setLoading] = useState(!cached && !useDemoProducts);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Wrapper: sync sessionStorage on every state change
  const setProducts = useCallback((updater) => {
    setProductsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeCache(next);
      return next;
    });
  }, []);

  // ── Загрузка товаров (stale-while-revalidate) ──
  const fetchProducts = useCallback(async () => {
    try {
      const demoMode = isDemoProductsEnabled();
      if (demoMode && !getToken()) {
        setProducts(demoProducts);
        setLoading(false);
        return;
      }
      if (!readCache() && !demoMode) setLoading(true);
      const endpoint = window.location.pathname.startsWith('/adminpanel')
        ? '/api/products?limit=2000'
        : '/api/catalog-products?limit=2000';
      const data = demoMode
        ? await apiFetchQuiet(endpoint, { timeoutMs: 900 }).catch(() => ({ items: demoProducts }))
        : await apiFetch(endpoint);
      const raw = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      // Фильтруем невалидные элементы (защита от краша рендера)
      const items = raw.filter((p) => p && typeof p === 'object' && p.id != null);
      setProducts(demoMode && items.length === 0 ? demoProducts : items);
    } catch (err) {
      // apiFetch уже вызвал notifyGlobal — здесь только fallback на кеш
      if (!readCache()) setProducts(isDemoProductsEnabled() ? demoProducts : []);
    } finally {
      setLoading(false);
    }
  }, [setProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── Создание товара → API ──
  const addProduct = useCallback(async (product) => {
    const created = await apiFetch('/api/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
    setProducts((prev) => [created, ...prev]);
    return created;
  }, []);

  // ── Обновление товара → API ──
  const updateProduct = useCallback(async (id, data) => {
    const updated = await apiFetch(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  // ── Удаление товара → API ──
  const deleteProduct = useCallback(async (id) => {
    await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Массовое удаление → API ──
  const bulkDelete = useCallback(async (ids) => {
    await apiFetch('/api/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    const idSet = new Set(ids);
    setProducts((prev) => prev.filter((p) => !idSet.has(p.id)));
  }, []);

  // ── Массовое обновление цен → API ──
  const bulkUpdatePrices = useCallback(async (ids, priceTransform) => {
    const res = await apiFetch('/api/products/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, priceTransform }),
    });
    if (res.updated) {
      const updMap = new Map(res.updated.map((p) => [p.id, p]));
      setProducts((prev) => prev.map((p) => updMap.get(p.id) || p));
    }
  }, []);

  // ── Массовый сброс цен → API ──
  const bulkResetPrices = useCallback(async (ids) => {
    const res = await apiFetch('/api/products/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, priceTransform: { type: 'reset', value: 0 } }),
    });
    if (res.updated) {
      const updMap = new Map(res.updated.map((p) => [p.id, p]));
      setProducts((prev) => prev.map((p) => updMap.get(p.id) || p));
    }
  }, []);

  // ── Массовое обновление полей → API (универсальный, 1 запрос) ──
  const bulkUpdate = useCallback(async (ids, data) => {
    setBulkLoading(true);
    try {
      const res = await apiFetch('/api/products/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids, data }),
      });
      if (res.updated) {
        const updMap = new Map(res.updated.map((p) => [p.id, p]));
        setProducts((prev) => prev.map((p) => updMap.get(p.id) || p));
      }
    } finally {
      setBulkLoading(false);
    }
  }, []);

  // ── Массовая установка featured → API ──
  const bulkSetFeatured = useCallback(async (ids, featured) => {
    const res = await apiFetch('/api/products/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ids, data: { featured } }),
    });
    if (res.updated) {
      const updMap = new Map(res.updated.map((p) => [p.id, p]));
      setProducts((prev) => prev.map((p) => updMap.get(p.id) || p));
    }
  }, []);

  // ── Массовое обновление приоритета → API ──
  const bulkUpdatePriority = useCallback(async (ids, priority) => {
    setBulkLoading(true);
    try {
      const res = await apiFetch('/api/products/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids, data: { priority } }),
      });
      if (res.updated) {
        const updMap = new Map(res.updated.map((p) => [p.id, p]));
        setProducts((prev) => prev.map((p) => updMap.get(p.id) || p));
      }
    } finally {
      setBulkLoading(false);
    }
  }, []);

  // ── Загрузка изображения → API (с retry при ошибках) ──
  const uploadImage = useCallback(async (file) => {
    let fileToUpload = file;
    try {
      fileToUpload = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
      });
    } catch (_e) {
      // fallback: send original if compression fails
    }
    const tkn = getToken();
    const delays = [0, 800, 2000];
    let lastError;
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        const formData = new FormData();
        formData.append('image', fileToUpload);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: tkn ? { 'Authorization': `Bearer ${tkn}` } : {},
          body: formData,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const serverMsg = errBody.error || '';
          if (res.status === 401) {
            handleUnauthorized('/api/upload', 'POST');
            throw new Error('Сессия истекла');
          }
          // При 429 или 5xx — retry
          if ((res.status === 429 || res.status >= 500) && attempt < delays.length - 1) {
            lastError = new Error(serverMsg || friendlyErrorMessage(res.status));
            continue;
          }
          const userMsg = serverMsg || friendlyErrorMessage(res.status);
          logError({ url: '/api/upload', method: 'POST', status: res.status, message: serverMsg || userMsg });
          throw new Error(userMsg);
        }
        const data = await res.json();
        return data.path;
      } catch (e) {
        // Сетевая ошибка (fetch бросает TypeError)
        if (e.name === 'TypeError' || e.message === 'Load failed' || e.message === 'Failed to fetch') {
          const msg = friendlyErrorMessage(null, e.message);
          if (attempt < delays.length - 1) {
            lastError = new Error(msg);
            continue;
          }
          logError({ url: '/api/upload', method: 'POST', status: null, message: e.message, stack: e.stack });
          throw new Error(msg);
        }
        // 429/5xx retry уже обработан выше, остальные ошибки — сразу бросаем
        throw e;
      }
    }
    throw lastError || new Error('Ошибка загрузки');
  }, []);

  // ── Полная перезагрузка ──
  const reloadProducts = useCallback(async () => {
    await fetchProducts();
  }, [fetchProducts]);

  // ── Проверка admin PIN на сервере ──
  const verifyAdminPin = useCallback(async (pin) => {
    const res = await apiFetch('/api/admin/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    return res.ok === true;
  }, []);

  return (
    <ProductsContext.Provider value={{
      products, loading, bulkLoading,
      fetchProducts,
      addProduct, updateProduct, deleteProduct,
      bulkUpdate, bulkUpdatePrices, bulkDelete, bulkResetPrices, bulkSetFeatured, bulkUpdatePriority,
      uploadImage, reloadProducts, verifyAdminPin,
    }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
