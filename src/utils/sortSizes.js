const TEXT_ORDER = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', '4xl', '5xl'];

export default function sortSizes(sizes) {
  if (!sizes || sizes.length <= 1) return sizes || [];
  return [...sizes].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    const aNum = !isNaN(na) && a !== '', bNum = !isNaN(nb) && b !== '';
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    const ai = TEXT_ORDER.indexOf(a.toLowerCase());
    const bi = TEXT_ORDER.indexOf(b.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}
