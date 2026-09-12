/* ============================================================
   Tiancode — Website animations
   Loader, animaciones de entrada (IntersectionObserver),
   partículas del hero y contadores animados.
   ============================================================ */

import { reducedMotion, easeOut } from './utils.js';

/* ---------- Loader (monograma + progreso ~0.7s) ---------- */
const LOADER_MS = 700;
const LOADER_TARGET = 90; // 0→90% durante la carga; 100% al ocultarse

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader || loader.classList.contains('is-hidden')) return;
  const fill = loader.querySelector('.loader-fill');
  const pct = loader.querySelector('.loader-pct');
  if (fill) fill.style.width = '100%';
  if (pct) pct.textContent = '100%';
  loader.classList.add('is-hidden');
  setTimeout(function () {
    if (loader.parentNode) loader.parentNode.removeChild(loader);
  }, 600);
}

function animateLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  const fill = loader.querySelector('.loader-fill');
  const pct = loader.querySelector('.loader-pct');
  if (reducedMotion) {
    if (fill) fill.style.width = '100%';
    if (pct) pct.textContent = '100%';
    setTimeout(hideLoader, 300);
    return;
  }
  // Si el fallback inline ya avanzó el progreso (módulo lento), continuar
  // desde ahí en vez de reiniciar en 0%.
  const current = pct ? parseFloat(pct.textContent) : 0;
  const from = Math.min(Math.max(current / LOADER_TARGET, 0), 1);
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, from + (1 - from) * ((now - start) / LOADER_MS));
    const eased = easeOut(p);
    if (fill) fill.style.width = (eased * LOADER_TARGET).toFixed(1) + '%';
    if (pct) pct.textContent = Math.round(eased * LOADER_TARGET) + '%';
    if (p < 1) requestAnimationFrame(step);
    else setTimeout(hideLoader, 120);
  }
  requestAnimationFrame(step);
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

  // Proximity connection lines
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const dx = parts[i].x - parts[j].x;
      const dy = parts[i].y - parts[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 88) {
        const lineAlpha = (1 - dist / 88) * 0.16;
        particlesCtx.beginPath();
        particlesCtx.moveTo(parts[i].x, parts[i].y);
        particlesCtx.lineTo(parts[j].x, parts[j].y);
        particlesCtx.strokeStyle = 'rgba(99, 102, 241, ' + lineAlpha.toFixed(3) + ')';
        particlesCtx.lineWidth = 0.8;
        particlesCtx.stroke();
      }
    }
  }

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

/* ---------- 3D Mouse Tilt interactivo (Hero & Cards) ---------- */
function init3DTilt() {
  if (reducedMotion) return;
  const heroVisual = document.querySelector('.hero-visual');
  const heroWindow = document.querySelector('.hero-window');
  const heroSection = document.getElementById('hero');

  if (heroSection && heroWindow) {
    let mouseX = 0, mouseY = 0;
    let currRx = 0, currRy = 0;
    let isHovering = false;

    heroSection.addEventListener('mousemove', function (e) {
      const rect = heroSection.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseX = x;
      mouseY = y;
      isHovering = true;

      const winRect = heroWindow.getBoundingClientRect();
      const gx = ((e.clientX - winRect.left) / winRect.width) * 100;
      const gy = ((e.clientY - winRect.top) / winRect.height) * 100;
      heroWindow.style.setProperty('--glare-x', gx.toFixed(1) + '%');
      heroWindow.style.setProperty('--glare-y', gy.toFixed(1) + '%');
    });

    heroSection.addEventListener('mouseleave', function () {
      isHovering = false;
      mouseX = 0;
      mouseY = 0;
    });

    function tiltLoop() {
      const targetRx = isHovering ? -mouseY * 16 : 0;
      const targetRy = isHovering ? mouseX * 18 : 0;
      currRx += (targetRx - currRx) * 0.1;
      currRy += (targetRy - currRy) * 0.1;

      heroWindow.style.setProperty('--tilt-rx', currRx.toFixed(2) + 'deg');
      heroWindow.style.setProperty('--tilt-ry', currRy.toFixed(2) + 'deg');
      requestAnimationFrame(tiltLoop);
    }
    requestAnimationFrame(tiltLoop);
  }

  // 3D Card Hover Tilt
  document.querySelectorAll('.feature-card, .new-card, .showcase-window').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const rx = -y * 6;
      const ry = x * 6;
      card.style.transform = 'perspective(800px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-5px)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.transform = '';
    });
  });
}

/* ---------- Parallax sutil del hero (scroll) ---------- */
function initParallax() {
  if (reducedMotion) return;
  const hero = document.getElementById('hero');
  const heroBg = hero ? hero.querySelector('.hero-bg') : null;
  const heroInner = hero ? hero.querySelector('.hero-inner') : null;
  if (!heroBg || !heroInner) return;
  let ticking = false;
  function update() {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const progress = Math.min(Math.max(-rect.top, 0), window.innerHeight);
    heroBg.style.transform = 'translate3d(0,' + (progress * 0.12).toFixed(1) + 'px,0)';
    heroInner.style.transform = 'translate3d(0,' + (progress * 0.05).toFixed(1) + 'px,0)';
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
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
  animateLoader();
  initReveal();
  startParticles();
  initParallax();
  init3DTilt();
  document.addEventListener('tiancode:home', function () {
    requestAnimationFrame(startParticles);
  });
}
