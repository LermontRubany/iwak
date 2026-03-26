import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { products as seedProducts } from '../data/products';

const STORAGE_KEY = 'iwak_products';

function loadProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return seedProducts;
}

function saveProducts(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState(() => loadProducts());

  // Синхронизация между вкладками: если другая вкладка (админка или каталог)
  // записала новые данные в localStorage, обновляем state в текущей вкладке.
  // storage-событие НЕ срабатывает в той вкладке, что сама сделала запись.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const data = e.newValue ? JSON.parse(e.newValue) : seedProducts;
        setProducts(data);
      } catch {
        console.error('Invalid storage data');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addProduct = useCallback((product) => {
    setProducts((prev) => {
      const next = [...prev, { ...product, id: crypto.randomUUID?.() ?? Date.now() }];
      saveProducts(next);
      return next;
    });
  }, []);

  const updateProduct = useCallback((id, data) => {
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, ...data, id };
        // Удаляем ключи, явно установленные в undefined
        Object.keys(data).forEach((k) => {
          if (data[k] === undefined) delete updated[k];
        });
        return updated;
      });
      saveProducts(next);
      return next;
    });
  }, []);

  const deleteProduct = useCallback((id) => {
    setProducts((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveProducts(next);
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
      saveProducts(next);
      return next;
    });
  }, []);

  const bulkDelete = useCallback((ids) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.filter((p) => !idSet.has(p.id));
      saveProducts(next);
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
      saveProducts(next);
      return next;
    });
  }, []);

  const bulkSetFeatured = useCallback((ids, featured) => {
    setProducts((prev) => {
      const idSet = new Set(ids);
      const next = prev.map((p) => (idSet.has(p.id) ? { ...p, featured } : p));
      saveProducts(next);
      return next;
    });
  }, []);

  const resetToSeed = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProducts(seedProducts);
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
