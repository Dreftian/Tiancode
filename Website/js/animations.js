/* ============================================================
   Tiancode — Website animations
   Loader, animaciones de entrada (IntersectionObserver),
   partículas del hero y contadores animados.
   ============================================================ */

import { reducedMotion } from './utils.js';

/* ---------- Loader (aparece ~1.2s) ---------- */
function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader || loader.classList.contains('is-hidden')) return;
  loader.classList.add('is-hidden');
  setTimeout(function () {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  }, 600);
}

/* ---------- Animaciones de entrada (scroll) ---------- */
function initReveal() {
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }
}

/* ---------- Partículas del hero (canvas) ---------- */
const particlesCanvas = document.getElementById('particles');
const particlesCtx = particlesCanvas ? particlesCanvas.getContext('2d') : null;
let parts = [];
let rafId = null;
let cssW = 0;
let cssH = 0;

function initParticles() {
  const count = Math.max(24, Math.min(60, Math.floor(cssW / 22)));
  parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: Math.random() * cssW,
      y: Math.random() * cssH,
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.12 - Math.random() * 0.3,
      alpha: 0.12 + Math.random() * 0.38
    });
  }
}

export function resizeParticles() {
  if (!particlesCanvas) return;
  const hero = document.getElementById('hero');
  const rect = hero.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cssW = rect.width;
  cssH = rect.height;
  particlesCanvas.width = Math.round(cssW * dpr);
  particlesCanvas.height = Math.round(cssH * dpr);
  initParticles();
}

function tickParticles() {
  if (!particlesCtx) return;
  const dpr = window.devicePixelRatio || 1;
  particlesCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  particlesCtx.clearRect(0, 0, cssW, cssH);
  parts.forEach(function (p) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y < -8) { p.y = cssH + 8; p.x = Math.random() * cssW; }
    if (p.x < -8) p.x = cssW + 8;
    if (p.x > cssW + 8) p.x = -8;
    particlesCtx.beginPath();
    particlesCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    particlesCtx.fillStyle = 'rgba(129, 140, 248, ' + p.alpha.toFixed(2) + ')';
    particlesCtx.fill();
  });
  rafId = requestAnimationFrame(tickParticles);
}

function startParticles() {
  if (!particlesCtx || reducedMotion) return;
  resizeParticles();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tickParticles);
}

/* ---------- Contadores animados ---------- */
export function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(function (el) {
    const target = parseFloat(el.getAttribute('data-count'));
    const suffix = el.getAttribute('data-suffix') || '';
    const dur = reducedMotion ? 1 : 1200;
    const start = performance.now();
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const easeOut = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * easeOut) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

export function initAnimations() {
  setTimeout(hideLoader, reducedMotion ? 300 : 1200);
  initReveal();
  startParticles();
  // Reinicia las partículas al volver a la home
  document.addEventListener('tiancode:home', function () {
    requestAnimationFrame(startParticles);
  });
}
