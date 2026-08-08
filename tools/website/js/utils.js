/* ============================================================
   Tiancode — Website utils
   Helpers compartidos por los módulos (sin dependencias).
   ============================================================ */

export const LS_KEYS = { lang: 'tiancode-lang', theme: 'tiancode-theme' };

export const reducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function readLS(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
}

export function writeLS(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* almacenamiento no disponible */ }
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function fontFamily() {
  return cssVar('--font-sans') || 'sans-serif';
}

export function easeOut(p) {
  return 1 - Math.pow(1 - p, 3);
}
