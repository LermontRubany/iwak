
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ProductsContext = createContext(null);

// ── Хелпер: JWT-токен из localStorage ──
function getAuthHeaders() {
  const token = localStorage.getItem('iwak_admin_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...getAuthHeaders(), ...options.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Загрузка товаров (публичный, без фильтров — для полного каталога) ──
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/products?limit=2000');
      setProducts(Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  // ── Загрузка изображения → API ──
  const uploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('iwak_admin_token');
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки');
    }
    const data = await res.json();
    return data.path;
  }, []);

  // ── Полная перезагрузка ──
  const reloadProducts = useCallback(async () => {
    await fetchProducts();
  }, [fetchProducts]);

  return (
    <ProductsContext.Provider value={{
      products, loading,
      fetchProducts,
      addProduct, updateProduct, deleteProduct,
      bulkUpdatePrices, bulkDelete, bulkResetPrices, bulkSetFeatured,
      uploadImage, reloadProducts,
    }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
