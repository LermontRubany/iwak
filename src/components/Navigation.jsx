import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

const NAV_CATEGORIES = [
  { label: 'МУЖСКОЕ', search: '?gender=mens' },
  { label: 'ЖЕНСКОЕ', search: '?gender=womens' },
  { label: 'АКСЕССУАРЫ', search: '?category=аксессуары' },
  { label: 'СКИДКИ', search: '?sale=true' },
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
    }, 220);
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
      {isOpen && <div className={`nav-overlay ${closing ? 'nav-overlay--closing' : ''}`} onClick={handleClose} />}
      <nav
        ref={drawerRef}
        className={`nav-drawer ${isOpen && !closing ? 'nav-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Навигация"
      >
        <ul className="nav-main-links">
          {NAV_CATEGORIES.map((section) => (
            <li key={section.label} className="nav-section">
              <button
                className="nav-link nav-link--main"
                onClick={() => handleCatalog(section.search)}
              >
                <span className="nav-link__label">{section.label}</span>
                <span className="nav-link__arrow" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>

        {secondaryLinks.length > 0 && (
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
        )}

      </nav>
    </>
  );
}
