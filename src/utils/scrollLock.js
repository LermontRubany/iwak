let lockCount = 0;

export function lockScroll() {
  if (lockCount > 0) {
    lockCount += 1;
    return;
  }
  document.body.style.overflow = 'hidden';
  lockCount = 1;
}

export function unlockScroll() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  document.body.style.overflow = '';
}
