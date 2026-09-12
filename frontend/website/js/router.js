/* ============================================================
   Tiancode — Website router
   SPA con hash routing: 9 páginas internas (#/licencia,
   #/terminos, #/privacidad, #/docs, #/guia, #/faq,
   #/novedades, #/portable, #/descarga) + anclas internas.
   ============================================================ */

import { t } from './i18n.js';
import { reducedMotion } from './utils.js';

const PAGE_IDS = ['licencia', 'terminos', 'privacidad', 'docs', 'guia', 'faq', 'novedades', 'portable', 'descarga'];
const PAGE_TITLES = {
  licencia: 'lic.title',
  terminos: 'terms.title',
  privacidad: 'priv.title',
  docs: 'docs.title',
  guia: 'guide.title',
  faq: 'faq.title',
  novedades: 'news.title',
  portable: 'port.title',
  descarga: 'dl.title'
};

// Devuelve el nombre de la página activa según location.hash (o null)
function pageName() {
  const hash = window.location.hash;
  if (hash.slice(0, 2) !== '#/') return null;
  const name = hash.slice(2).split(/[?#]/)[0];
  return PAGE_IDS.indexOf(name) !== -1 ? name : null;
}

// Título de la pestaña según la página activa
export function syncTitle() {
  const name = pageName();
  const key = name ? PAGE_TITLES[name] : null;
  document.title = key ? t(key) + ' — Tiancode' : t('page.title');
}

export function closeDropdown() {
  const navDropdown = document.querySelector('.nav-dropdown');
  if (!navDropdown) return;
  navDropdown.classList.remove('is-open');
  const toggle = navDropdown.querySelector('.nav-dropdown-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

// Sube al tope sin animación (ignora scroll-behavior: smooth)
function scrollTopInstant() {
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  html.style.scrollBehavior = prev;
}

export function route() {
  const name = pageName();
  document.querySelectorAll('.page').forEach(function (el) {
    el.classList.toggle('page--active', el.id === 'page-' + name);
  });
  document.body.classList.toggle('page-open', name !== null);
  closeDropdown();
  if (name !== null) {
    scrollTopInstant();
  } else {
    // Vuelve a la home; si el hash apunta a una sección, desplaza hasta ella
    const hash = window.location.hash;
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    document.dispatchEvent(new CustomEvent('tiancode:home'));
  }
  syncTitle();
}

export function initRouter() {
  window.addEventListener('hashchange', route);
  // El router también sincroniza el título al cambiar de idioma
  document.addEventListener('tiancode:langchange', syncTitle);

  /* Anclas internas dentro de las páginas (TOC, etc.): los enlaces
     #/… van al router; los enlaces a elementos dentro de una página
     se resuelven con scroll suave sin salir de la ruta de la página. */
  document.addEventListener('click', function (e) {
    const link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el || !el.closest('.page')) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (window.history.replaceState) {
      window.history.replaceState(null, '', '#/' + el.closest('.page').id.replace('page-', ''));
    }
  });
}
