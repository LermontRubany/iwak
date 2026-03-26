// ...existing code from src/context/ProductsContext.jsx...

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);

  // Загрузка товаров с API
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Добавить товар
  const addProduct = useCallback(async (product) => {
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    await fetchProducts();
  }, [fetchProducts]);

  // Обновить товар
  const updateProduct = useCallback(async (id, product) => {
    await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
    await fetchProducts();
  }, [fetchProducts]);

  // Удалить товар
  const deleteProduct = useCallback(async (id) => {
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    await fetchProducts();
  }, [fetchProducts]);

  // Загрузить изображение
  const uploadImage = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Ошибка загрузки файла');
    const data = await res.json();
    return data.path; // путь к файлу на сервере
  }, []);

  const value = {
    products,
    fetchProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    uploadImage,
  };

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  return useContext(ProductsContext);
}
