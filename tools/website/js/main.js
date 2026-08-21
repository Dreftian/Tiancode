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

/* ---------- Scrollspy: resalta la sección activa en el nav ---------- */
const spySections = document.querySelectorAll('main section[id]');
const spyLinks = document.querySelectorAll('.main-nav a[href^="#"]');
if ('IntersectionObserver' in window && spySections.length && spyLinks.length) {
  const spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      spyLinks.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  spySections.forEach(function (section) { spy.observe(section); });
}

/* ---------- Copiar comando de instalación rápida en Hero ---------- */
const heroCmd = document.getElementById('hero-cmd-box');
if (heroCmd) {
  heroCmd.addEventListener('click', function () {
    const textToCopy = 'winget install Dreftian.Tiancode';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy);
    }
    heroCmd.classList.add('is-copied');
    setTimeout(function () {
      heroCmd.classList.remove('is-copied');
    }, 2200);
  });
}

/* ---------- Studio Interactivo / Showcase Tabs Switcher ---------- */
const showcaseTabBtns = document.querySelectorAll('.showcase-tab-btn');
const showcasePanels = document.querySelectorAll('.showcase-panel');

if (showcaseTabBtns.length && showcasePanels.length) {
  showcaseTabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const targetId = btn.getAttribute('data-target-panel');
      showcaseTabBtns.forEach(function (b) { b.classList.remove('is-active'); });
      showcasePanels.forEach(function (p) { p.classList.remove('is-active'); });
      btn.classList.add('is-active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('is-active');
    });
  });
}

