export function hexEnRgb(hex) {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function melanger(hex, ratioBlanc) {
  const c = hexEnRgb(hex);
  if (!c) return null;
  const m = (v) => Math.round(v + (255 - v) * ratioBlanc);
  const s = (v) => m(v).toString(16).padStart(2, '0');
  return `#${s(c.r)}${s(c.g)}${s(c.b)}`;
}

export function assombrir(hex, ratio) {
  const c = hexEnRgb(hex);
  if (!c) return null;
  const s = (v) => Math.round(v * (1 - ratio)).toString(16).padStart(2, '0');
  return `#${s(c.r)}${s(c.g)}${s(c.b)}`;
}

// Applique la couleur principale de l'établissement au thème (variables CSS globales).
export function appliquerThemeEtablissement(couleur) {
  if (!couleur || !hexEnRgb(couleur)) return;
  const strong = assombrir(couleur, 0.15);
  const soft = melanger(couleur, 0.88);
  document.documentElement.style.setProperty('--teal', couleur);
  document.documentElement.style.setProperty('--teal-strong', strong);
  document.documentElement.style.setProperty('--teal-soft', soft);
}

export function reinitialiserTheme() {
  document.documentElement.style.removeProperty('--teal');
  document.documentElement.style.removeProperty('--teal-strong');
  document.documentElement.style.removeProperty('--teal-soft');
}