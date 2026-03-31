
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { notifyGlobal } from './NotificationsContext';

const ProductsContext = createContext(null);

// ── Хелпер: JWT-токен из localStorage ──
function getAuthHeaders() {
  const token = localStorage.getItem('iwak_admin_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function apiFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { ...getAuthHeaders(), ...options.headers } });
  } catch {
    notifyGlobal('error', 'Нет соединения с сервером');
    throw new Error('Нет соединения с сервером');
  }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('iwak_admin_token');
      notifyGlobal('error', 'Сессия истекла — требуется повторный вход');
      // Программный редирект без reload
      setTimeout(() => { window.location.href = '/adminpanel'; }, 100);
      throw new Error('Сессия истекла');
    }
    const body = await res.json().catch(() => ({}));
    const msg = body.error || `Ошибка сервера (${res.status})`;
    notifyGlobal('error', msg);
    throw new Error(msg);
  }
  return res.json();
}

// ── sessionStorage cache helpers ──
const CACHE_KEY = 'iwak_products';

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch { return null; }
}

function writeCache(items) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {}
}

export function ProductsProvider({ children }) {
  const cached = readCache();
  const [products, setProductsRaw] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
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
      if (!readCache()) setLoading(true);
      const data = await apiFetch('/api/products?limit=2000');
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
      setProducts(items);
    } catch (err) {
      // apiFetch уже вызвал notifyGlobal — здесь только fallback на кеш
      if (!readCache()) setProducts([]);
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
    const token = localStorage.getItem('iwak_admin_token');
    const delays = [0, 500, 1500];
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
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = err.error || `Ошибка загрузки (${res.status})`;
          // При 429 — retry, при других ошибках — сразу бросаем
          if (res.status !== 429) throw new Error(msg);
          lastError = new Error(msg);
          continue;
        }
        const data = await res.json();
        return data.path;
      } catch (e) {
        if (e.message?.includes('429') && attempt < delays.length - 1) {
          lastError = e;
          continue;
        }
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
