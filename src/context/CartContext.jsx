import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';

const CartContext = createContext(null);

const initialState = {
  items: [],
};

const STORAGE_KEY = 'iwak_cart';

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) return parsed;
    }
  } catch { /* ignore */ }
  return initialState;
}

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(
        (i) => i.id === action.payload.id && i.size === action.payload.size
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.id === action.payload.id && i.size === action.payload.size
              ? { ...i, qty: i.qty + 1 }
              : i
          ),
        };
      }
      return { ...state, items: [...state.items, { ...action.payload, qty: 1 }] };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(
          (i) => !(i.id === action.payload.id && i.size === action.payload.size)
        ),
      };
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.payload.id && i.size === action.payload.size
            ? { ...i, qty: Math.max(1, action.payload.qty) }
            : i
        ),
      };
    case 'CLEAR_CART':
      return initialState;
    case 'MERGE_ITEMS': {
      // Добавляем только те товары, которых ещё нет (id+size)
      const toAdd = action.payload.filter(
        (newItem) => !state.items.some(
          (i) => i.id === newItem.id && i.size === newItem.size
        )
      );
      if (toAdd.length === 0) return state;
      return { ...state, items: [...state.items, ...toAdd.map((i) => ({ ...i, qty: 1 }))] };
    }
    case 'REPLACE':
      return action.payload;
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, null, loadCart);

  // Сохраняем в localStorage при каждом изменении
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Кросс-вкладочная синхронизация (как в ProductsContext)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const data = e.newValue ? JSON.parse(e.newValue) : initialState;
        if (Array.isArray(data.items)) {
          dispatch({ type: 'REPLACE', payload: data });
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback((product, size) =>
    dispatch({ type: 'ADD_ITEM', payload: { ...product, size } }), []);
  const removeItem = useCallback((id, size) =>
    dispatch({ type: 'REMOVE_ITEM', payload: { id, size } }), []);
  const updateQty = useCallback((id, size, qty) =>
    dispatch({ type: 'UPDATE_QTY', payload: { id, size, qty } }), []);
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR_CART' }), []);
  const mergeItems = useCallback((items) =>
    dispatch({ type: 'MERGE_ITEMS', payload: items }), []);

  const totalCount = state.items.reduce((acc, i) => acc + i.qty, 0);
  const totalPrice = state.items.reduce((acc, i) => acc + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items: state.items, addItem, removeItem, updateQty, clearCart, mergeItems, totalCount, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
