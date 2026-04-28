let lockCount = 0;
let scrollY = 0;
let previousBodyStyles = null;
let previousHtmlOverflow = '';

export function lockScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (lockCount > 0) {
    lockCount += 1;
    return;
  }

  scrollY = window.scrollY || window.pageYOffset || 0;
  previousHtmlOverflow = document.documentElement.style.overflow;
  previousBodyStyles = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    width: document.body.style.width,
  };

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  lockCount = 1;
}

export function unlockScroll() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;

  document.documentElement.style.overflow = previousHtmlOverflow;

  if (previousBodyStyles) {
    document.body.style.overflow = previousBodyStyles.overflow;
    document.body.style.position = previousBodyStyles.position;
    document.body.style.top = previousBodyStyles.top;
    document.body.style.left = previousBodyStyles.left;
    document.body.style.right = previousBodyStyles.right;
    document.body.style.width = previousBodyStyles.width;
  } else {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
  }

  window.scrollTo(0, scrollY);
  scrollY = 0;
  previousBodyStyles = null;
  previousHtmlOverflow = '';
}
