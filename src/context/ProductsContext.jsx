

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);

  // Функция для загрузки товаров с API
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  }, []);

  // Загружаем товары при инициализации
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Добавление товара через API
  const addProduct = useCallback(async (product) => {
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    await fetchProducts();
  }, [fetchProducts]);

  const updateProduct = useCallback((id, data) => {
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, ...data, id };
        Object.keys(data).forEach((k) => {
          if (data[k] === undefined) delete updated[k];
        });
        return updated;
      });
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const deleteProduct = useCallback((id) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const bulkUpdatePrices = useCallback((ids, transformFn) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((p) => {
        if (!idSet.has(p.id)) return p;
        const newPrice = Math.round(transformFn(p.price));
        if (newPrice === p.price) return p;
        return { ...p, originalPrice: p.originalPrice ?? p.price, price: newPrice };
      });
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const bulkDelete = useCallback((ids) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.filter((p) => !idSet.has(p.id));
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const bulkResetPrices = useCallback((ids) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((p) => {
        if (!idSet.has(p.id) || !p.originalPrice) return p;
        const { originalPrice, ...rest } = p;
        return { ...rest, price: originalPrice };
      });
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const bulkSetFeatured = useCallback((ids, featured) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((p) => (idSet.has(p.id) ? { ...p, featured } : p));
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

  const resetToSeed = useCallback(() => {
    // TODO: сбросить products.json на дефолтный набор через сервер/скрипт
    setProducts([]);
  }, []);

  return (
    <ProductsContext.Provider value={{ products, addProduct, updateProduct, deleteProduct, bulkUpdatePrices, bulkDelete, bulkResetPrices, bulkSetFeatured, resetToSeed }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
