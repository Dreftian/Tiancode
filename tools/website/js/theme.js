/* ============================================================
   Tiancode — Website theme
   Tema claro/oscuro con CSS custom properties y localStorage.
   Emite 'tiancode:themechange' para que las gráficas repinten.
   ============================================================ */

import { LS_KEYS, readLS, writeLS } from './utils.js';

export function initTheme() {
  const rootEl = document.documentElement;
  const storedTheme = readLS(LS_KEYS.theme, '');
  let theme = storedTheme ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  rootEl.dataset.theme = theme;

  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');

  themeToggle.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    rootEl.dataset.theme = theme;
    writeLS(LS_KEYS.theme, theme);
    themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    document.dispatchEvent(new CustomEvent('tiancode:themechange'));
  });
}
