import { useRef, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollManager() {
  const { pathname } = useLocation();
  const positions = useRef({});
  const prevPath = useRef(pathname);

  useLayoutEffect(() => {
    // Save scroll position of the page we're leaving
    if (prevPath.current !== pathname) {
      positions.current[prevPath.current] = window.scrollY;
      prevPath.current = pathname;
    }

    // Restore or reset
    const saved = positions.current[pathname];
    window.scrollTo(0, saved ?? 0);
  }, [pathname]);

  return null;
}
