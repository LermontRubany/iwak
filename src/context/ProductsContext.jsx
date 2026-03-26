
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ProductsContext = createContext(null);



export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);

  // Загружаем товары из /products.json при инициализации
  useEffect(() => {
    fetch('/products.json')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => Array.isArray(data) ? setProducts(data) : setProducts([]))
      .catch(() => setProducts([]));
  }, []);


  // addProduct теперь только обновляет state (реальное сохранение — через сервер/скрипт)
  const addProduct = useCallback((product) => {
    setProducts((prev) => {
      const next = [...prev, { ...product, id: crypto.randomUUID?.() ?? Date.now() }];
      // TODO: отправить next на сервер или обновить products.json через API/скрипт
      return next;
    });
  }, []);

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
