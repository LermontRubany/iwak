import { useEffect, useMemo, useRef, useState } from 'react';
import { products } from '../data/products';
import ProductCard from './ProductCard';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

const MAX_SUGGESTIONS = 6;

export default function SearchOverlay({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [closing, setClosing] = useState(false);
  const inputRef = useRef(null);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setTimeout(() => inputRef.current?.focus(), 80);
      lockScroll();
    } else {
      unlockScroll();
      setTimeout(() => {
        setQuery('');
        setDebouncedQuery('');
      }, 450);
    }
    return () => { unlockScroll(); };
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const suggestions = useMemo(() => {
    const q = debouncedQuery.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!q) return [];

    const words = q.split(' ').filter((w) => w.length > 0);
    if (words.length === 0) return [];

    return products
      .filter((p) => {
        const name = (p.name || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        return words.every((w) => {
          const textMatch = name.includes(w) || brand.includes(w);
          const isNumber = /^\d+$/.test(w);
          const couldBeSize = /^[a-z]{1,3}$|^\d{1,3}$/.test(w);
          const sizeMatch = couldBeSize && p.sizes?.some((s) =>
            isNumber ? s === w : s.toLowerCase() === w
          );
          return textMatch || sizeMatch;
        });
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [debouncedQuery]);

  const handleSubmit = (e) => {
    e.preventDefault();
  };

  return (
    <div className={`search-overlay ${isOpen && !closing ? 'search-overlay--open' : ''}`}>
      <div className="search-panel">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-top-row">
            <div className={`search-field ${query ? 'search-field--active' : ''}`}>
              <label className="search-label" onClick={() => inputRef.current?.focus()}>
                ПОИСК ТОВАРОВ
              </label>
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              type="button"
              className="search-close-btn"
              onClick={handleClose}
              aria-label="Закрыть поиск"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <line x1="1" y1="1" x2="15" y2="15" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <line x1="15" y1="1" x2="1" y2="15" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </form>

        {suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map((product) => (
              <div key={product.id} className="search-suggestion-card" onClick={handleClose}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="search-backdrop" onClick={handleClose}>
        <div className="search-blob2" />
        <div className="search-blob3" />
      </div>
    </div>
  );
}
