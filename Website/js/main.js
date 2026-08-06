/* ============================================================
   Tiancode — Website main
   Punto de entrada: inicia todos los módulos y las
   interacciones del header (tema, idioma, menú móvil y
   menú desplegable de recursos).
   ============================================================ */

import { initTheme } from './theme.js';
import { applyLang, initI18n } from './i18n.js';
import { initRouter, closeDropdown } from './router.js';
import { initAnimations } from './animations.js';
import { initCharts } from './charts.js';
import { initFaq } from './faq.js';

/* ---------- Inicialización de módulos ---------- */
initTheme();
initRouter();
applyLang(); // aplica el idioma guardado y sincroniza título/gráficas
initI18n();
initAnimations();
initCharts();
initFaq();

/* ---------- Menú móvil ---------- */
const navToggle = document.getElementById('nav-toggle');
const header = document.querySelector('.site-header');

if (navToggle && header) {
  navToggle.addEventListener('click', function () {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      header.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Menú desplegable de recursos ---------- */
const navDropdown = document.querySelector('.nav-dropdown');
const navDropdownToggle = navDropdown ? navDropdown.querySelector('.nav-dropdown-toggle') : null;

if (navDropdownToggle) {
  navDropdownToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    const open = navDropdown.classList.toggle('is-open');
    navDropdownToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
document.addEventListener('click', function (e) {
  if (navDropdown && !navDropdown.contains(e.target)) closeDropdown();
});
