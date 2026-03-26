import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import ProductCard from '../components/ProductCard';
import FilterPanel from '../components/FilterPanel';
import MiniPlayer from '../components/MiniPlayer';

export default function CatalogPage() {
  const { products } = useProducts();
  // ...реализация фильтрации и отображения каталога...
  return (
    <div className="catalog-page">
      <FilterPanel />
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      <MiniPlayer />
    </div>
  );
}
