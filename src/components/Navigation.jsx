import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

const NAV_CATEGORIES = [
  { label: 'МУЖСКОЕ', search: '?gender=mens' },
  { label: 'ЖЕНСКОЕ', search: '?gender=womens' },
  { label: 'АКСЕССУАРЫ', search: '?category=аксессуары' },
];

const secondaryLinks = [];

export default function Navigation({ isOpen, onClose }) {
  const navigate = useNavigate();
  const drawerRef = useRef(null);
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) setClosing(false);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
    return () => { unlockScroll(); };
  }, [isOpen]);

  // ESC close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closing]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !drawerRef.current) return;
    const panel = drawerRef.current;
    const focusable = panel.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();

    const trap = (e) => {
      if (e.key !== 'Tab' || !focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [isOpen]);

  const handleCatalog = (search) => {
    navigate({ pathname: '/catalog', search }, { replace: true });
    onClose();
  };

  const handleLink = (to) => {
    navigate(to);
    onClose();
  };

  return (
    <>
      {isOpen && <div className="nav-overlay" onClick={handleClose} />}
      <nav
        ref={drawerRef}
        className={`nav-drawer ${isOpen && !closing ? 'nav-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Навигация"
      >
        <button className="nav-close" onClick={handleClose} aria-label="Закрыть меню">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </button>

        <ul className="nav-main-links">
          {NAV_CATEGORIES.map((section) => (
            <li key={section.label} className="nav-section">
              <button
                className="nav-link nav-link--main"
                onClick={() => handleCatalog(section.search)}
              >
                {section.label}
              </button>
            </li>
          ))}
          <li className="nav-section">
            <button
              className="nav-link nav-link--main"
              onClick={() => handleCatalog('?sale=true')}
            >
              СКИДКИ
            </button>
          </li>
        </ul>

        <ul className="nav-secondary-links">
          {secondaryLinks.map((link) => (
            <li key={link.label}>
              <button
                className="nav-link nav-link--secondary"
                onClick={() => link.search ? handleCatalog(link.search) : handleLink(link.to)}
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
