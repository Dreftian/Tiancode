/* ============================================================
   Tiancode — Website script (JS vanilla, sin dependencias)
   - Idioma ES/EN con localStorage y atributos data-i18n
   - Tema claro/oscuro con CSS custom properties
   - Loader con spinner SVG
   - Animaciones de entrada con IntersectionObserver
   - Gráficas animadas en canvas (barras + donut)
   - Contadores animados y partículas en el hero
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. Traducciones (ES / EN) ---------- */
  const I18N = {
    es: {
      'page.title': 'Tiancode — Asistente de IA para programar en Windows',
      'page.description': 'Tiancode es la app de escritorio con IA para programar: agentes, skills de ingeniería y modelos locales GGUF, todo en tu terminal.',
      'loader.text': 'Cargando Tiancode…',
      'nav.features': 'Características',
      'nav.how': 'Cómo funciona',
      'nav.stats': 'Estadísticas',
      'nav.skills': 'Skills',
      'nav.download': 'Descargar',
      'theme.aria': 'Cambiar tema claro/oscuro',
      'lang.aria': 'Cambiar idioma',
      'nav.aria': 'Abrir menú de navegación',
      'hero.badge': 'Nuevo · v2.0 disponible',
      'hero.tagline': 'Tu asistente de IA para programar, directo en tu terminal.',
      'hero.sub': 'Agentes de IA, 24+ skills de ingeniería de software y modelos locales GGUF — una app de escritorio rápida y enfocada para Windows.',
      'hero.ctaDownload': 'Descargar para Windows',
      'hero.ctaFeatures': 'Ver características',
      'hero.note': 'Instalador y versión portable · Windows 10 y 11',
      'features.title': 'Todo lo que necesitas para programar con IA',
      'features.sub': 'Una app de escritorio compacta y potente, diseñada para el flujo de trabajo real de desarrolladores.',
      'f.agents.title': 'Agentes de IA',
      'f.agents.desc': 'Chat de programación con múltiples agentes y sub-agentes que colaboran, codean y depuran contigo.',
      'f.models.title': 'Modelos locales GGUF',
      'f.models.desc': 'Descarga y ejecuta modelos de IA locales desde HuggingFace, al estilo LM Studio. Sin nube, sin límites.',
      'f.skills.title': '24+ skills de ingeniería',
      'f.skills.desc': 'Interviews de requisitos, TDD, code review, seguridad, performance y CI/CD listos para usar.',
      'f.providers.title': 'Multi-proveedor',
      'f.providers.desc': 'Conecta OpenAI, Anthropic y otros proveedores — o combínalos con modelos locales.',
      'f.terminal.title': 'Terminal integrada',
      'f.terminal.desc': 'Ejecuta comandos, aplica cambios y ve resultados sin salir de la conversación.',
      'f.portable.title': 'Modo portable',
      'f.portable.desc': 'Lleva Tiancode en un USB: sin instalación, configurado y listo en cualquier PC Windows.',
      'f.more.title': 'Y mucho más',
      'f.more.desc': 'Atajos de teclado personalizables, tema claro y oscuro, autocompletado y ajustes finos para cada skill.',
      'mock.line1': '$ tiancode --agent senior-dev',
      'mock.line2': '▸ Analizando repositorio… 12.400 archivos en 3.2s',
      'mock.line3': '▸ Detectadas 2 vulnerabilidades en auth.js',
      'mock.line4': '▸ Fix aplicado · tests TDD en verde ✓',
      'how.title': 'Cómo funciona',
      'how.sub': 'De cero a tu primer agente en menos de cinco minutos.',
      's1.title': 'Descarga e instala',
      's1.desc': 'Consigue el instalador o la versión portable para Windows 10 y 11.',
      's2.title': 'Elige tu modelo',
      's2.desc': 'Conecta tu proveedor de IA favorito o descarga un modelo local GGUF.',
      's3.title': 'Programa con agentes',
      's3.desc': 'Conversa con tus agentes: analizan, escriben y revisan código por ti.',
      's4.title': 'Ajusta y escala',
      's4.desc': 'Activa skills, crea sub-agentes personalizados y define tus atajos.',
      'stats.title': 'Cifras que importan',
      'stats.sub': 'La comunidad de Tiancode crece rápido. Datos ilustrativos.',
      'stats.c1': 'Descargas',
      'stats.c2': 'Modelos GGUF compatibles',
      'stats.c3': 'Skills de ingeniería',
      'stats.c4': 'Países',
      'stats.chartBars': 'Descargas mensuales (miles)',
      'stats.chartDonut': 'Uso por proveedor de IA',
      'stats.donutCenter': '12.4k',
      'stats.donutCenterLabel': 'usuarios activos',
      'skills.title': 'Skills destacadas',
      'skills.sub': 'Un catálogo creciente de skills de ingeniería, activables una a una.',
      'sk.1': 'Entrevistas de requisitos',
      'sk.2': 'Test-Driven Development (TDD)',
      'sk.3': 'Code Review',
      'sk.4': 'Auditoría de seguridad',
      'sk.5': 'Optimización de rendimiento',
      'sk.6': 'Pipelines CI/CD',
      'sk.7': 'Refactorización',
      'sk.8': 'Depuración asistida',
      'sk.9': 'Documentación técnica',
      'sk.10': 'Diseño de arquitectura',
      'sk.11': 'Análisis de código estático',
      'sk.12': 'Migración de proyectos',
      'cta.title': 'Empieza a programar con IA hoy',
      'cta.sub': 'Gratis para uso personal. Rápido de instalar, fácil de configurar.',
      'cta.button': 'Descargar Tiancode',
      'cta.note': 'Windows 10 y 11 · 64 bits · ~120 MB',
      'footer.tagline': 'El asistente de IA para programar, hecho para Windows.',
      'footer.product': 'Producto',
      'footer.resources': 'Recursos',
      'footer.legal': 'Legal',
      'footer.l1': 'Descargar',
      'footer.l2': 'Novedades',
      'footer.l3': 'Modo portable',
      'footer.l4': 'Documentación',
      'footer.l5': 'Guía de inicio',
      'footer.l6': 'Preguntas frecuentes',
      'footer.l7': 'Privacidad',
      'footer.l8': 'Términos',
      'footer.l9': 'Licencia',
      'footer.rights': '© 2026 Tiancode. Todos los derechos reservados.'
    },

    en: {
      'page.title': 'Tiancode — AI coding assistant for Windows',
      'page.description': 'Tiancode is the desktop AI app for coding: agents, software engineering skills, and local GGUF models — all in your terminal.',
      'loader.text': 'Loading Tiancode…',
      'nav.features': 'Features',
      'nav.how': 'How it works',
      'nav.stats': 'Stats',
      'nav.skills': 'Skills',
      'nav.download': 'Download',
      'theme.aria': 'Toggle light/dark theme',
      'lang.aria': 'Switch language',
      'nav.aria': 'Open navigation menu',
      'hero.badge': 'New · v2.0 available',
      'hero.tagline': 'Your AI coding assistant, right in your terminal.',
      'hero.sub': 'AI agents, 24+ software engineering skills and local GGUF models — a fast, focused desktop app for Windows.',
      'hero.ctaDownload': 'Download for Windows',
      'hero.ctaFeatures': 'See features',
      'hero.note': 'Installer and portable build · Windows 10 and 11',
      'features.title': 'Everything you need to code with AI',
      'features.sub': 'A compact, powerful desktop app designed for the real developer workflow.',
      'f.agents.title': 'AI agents',
      'f.agents.desc': 'Coding chat with multiple agents and sub-agents that collaborate, code, and debug with you.',
      'f.models.title': 'Local GGUF models',
      'f.models.desc': 'Download and run local AI models from HuggingFace, LM Studio style. No cloud, no limits.',
      'f.skills.title': '24+ engineering skills',
      'f.skills.desc': 'Requirements interviews, TDD, code review, security, performance, and CI/CD — ready to use.',
      'f.providers.title': 'Multi-provider',
      'f.providers.desc': 'Connect OpenAI, Anthropic, and other providers — or combine them with local models.',
      'f.terminal.title': 'Integrated terminal',
      'f.terminal.desc': 'Run commands, apply changes, and see results without leaving the conversation.',
      'f.portable.title': 'Portable mode',
      'f.portable.desc': 'Carry Tiancode on a USB stick: no install, configured and ready on any Windows PC.',
      'f.more.title': 'And much more',
      'f.more.desc': 'Customizable keyboard shortcuts, light and dark themes, autocomplete, and fine-grained skill settings.',
      'mock.line1': '$ tiancode --agent senior-dev',
      'mock.line2': '▸ Analyzing repository… 12,400 files in 3.2s',
      'mock.line3': '▸ Found 2 vulnerabilities in auth.js',
      'mock.line4': '▸ Fix applied · TDD tests green ✓',
      'how.title': 'How it works',
      'how.sub': 'From zero to your first agent in under five minutes.',
      's1.title': 'Download and install',
      's1.desc': 'Get the installer or the portable build for Windows 10 and 11.',
      's2.title': 'Pick your model',
      's2.desc': 'Connect your favorite AI provider or download a local GGUF model.',
      's3.title': 'Code with agents',
      's3.desc': 'Chat with your agents: they analyze, write, and review code for you.',
      's4.title': 'Tune and scale',
      's4.desc': 'Enable skills, create custom sub-agents, and define your shortcuts.',
      'stats.title': 'Numbers that matter',
      'stats.sub': 'The Tiancode community is growing fast. Illustrative data.',
      'stats.c1': 'Downloads',
      'stats.c2': 'Compatible GGUF models',
      'stats.c3': 'Engineering skills',
      'stats.c4': 'Countries',
      'stats.chartBars': 'Monthly downloads (thousands)',
      'stats.chartDonut': 'Usage by AI provider',
      'stats.donutCenter': '12.4k',
      'stats.donutCenterLabel': 'active users',
      'skills.title': 'Featured skills',
      'skills.sub': 'A growing catalog of engineering skills, enabled one by one.',
      'sk.1': 'Requirements interviews',
      'sk.2': 'Test-Driven Development (TDD)',
      'sk.3': 'Code Review',
      'sk.4': 'Security auditing',
      'sk.5': 'Performance tuning',
      'sk.6': 'CI/CD pipelines',
      'sk.7': 'Refactoring',
      'sk.8': 'Assisted debugging',
      'sk.9': 'Technical documentation',
      'sk.10': 'Architecture design',
      'sk.11': 'Static code analysis',
      'sk.12': 'Project migration',
      'cta.title': 'Start coding with AI today',
      'cta.sub': 'Free for personal use. Quick to install, easy to configure.',
      'cta.button': 'Download Tiancode',
      'cta.note': 'Windows 10 and 11 · 64-bit · ~120 MB',
      'footer.tagline': 'The AI coding assistant, built for Windows.',
      'footer.product': 'Product',
      'footer.resources': 'Resources',
      'footer.legal': 'Legal',
      'footer.l1': 'Download',
      'footer.l2': 'Changelog',
      'footer.l3': 'Portable mode',
      'footer.l4': 'Documentation',
      'footer.l5': 'Getting started',
      'footer.l6': 'FAQ',
      'footer.l7': 'Privacy',
      'footer.l8': 'Terms',
      'footer.l9': 'License',
      'footer.rights': '© 2026 Tiancode. All rights reserved.'
    }
  };

  /* Datos de las gráficas (etiquetas por idioma) */
  const CHART_DATA = {
    es: {
      months: ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'],
      bars: [18, 24, 21, 32, 41, 48],
      donut: [
        { label: 'OpenAI', value: 38, color: '#6366f1' },
        { label: 'Anthropic', value: 27, color: '#06b6d4' },
        { label: 'Local (GGUF)', value: 22, color: '#10b981' },
        { label: 'Otros', value: 13, color: '#64748b' }
      ]
    },
    en: {
      months: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      bars: [18, 24, 21, 32, 41, 48],
      donut: [
        { label: 'OpenAI', value: 38, color: '#6366f1' },
        { label: 'Anthropic', value: 27, color: '#06b6d4' },
        { label: 'Local (GGUF)', value: 22, color: '#10b981' },
        { label: 'Others', value: 13, color: '#64748b' }
      ]
    }
  };

  const LS_KEYS = { lang: 'tiancode-lang', theme: 'tiancode-theme' };

  /* ---------- 2. Utilidades ---------- */
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = function () { return I18N[lang]; };
  const easeOut = function (p) { return 1 - Math.pow(1 - p, 3); };

  function readLS(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* almacenamiento no disponible */ }
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function fontFamily() {
    return cssVar('--font-sans') || 'sans-serif';
  }

  /* ---------- 3. Estado inicial ---------- */
  const rootEl = document.documentElement;
  let lang = readLS(LS_KEYS.lang, 'es');
  if (lang !== 'es' && lang !== 'en') lang = 'es';

  const storedTheme = readLS(LS_KEYS.theme, '');
  let theme = storedTheme ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  rootEl.dataset.theme = theme;

  const themeToggle = document.getElementById('theme-toggle');
  const langToggle = document.getElementById('lang-toggle');
  const navToggle = document.getElementById('nav-toggle');
  const header = document.querySelector('.site-header');
  const loader = document.getElementById('loader');

  /* ---------- 4. Tema claro/oscuro ---------- */
  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');

  themeToggle.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    rootEl.dataset.theme = theme;
    writeLS(LS_KEYS.theme, theme);
    themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    if (chartsDone) drawCharts(); // repinta con los colores del nuevo tema
  });

  /* ---------- 5. Idioma ES/EN ---------- */
  function applyLang(newLang) {
    lang = newLang;
    writeLS(LS_KEYS.lang, lang);
    rootEl.lang = lang;
    document.title = t()['page.title'];

    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t()['page.description']);

    // Traduce textos planos
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      if (t()[key] !== undefined) el.textContent = t()[key];
    });
    // Traduce atributos aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-aria');
      if (t()[key] !== undefined) el.setAttribute('aria-label', t()[key]);
    });

    // El botón muestra el idioma al que se puede cambiar
    langToggle.textContent = lang === 'es' ? 'EN' : 'ES';

    buildDonutLegend();
    if (chartsDone) drawCharts(); // repinta etiquetas de las gráficas
  }

  langToggle.addEventListener('click', function () {
    applyLang(lang === 'es' ? 'en' : 'es');
  });

  /* ---------- 6. Menú móvil ---------- */
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

  /* ---------- 7. Loader (aparece ~1.2s) ---------- */
  function hideLoader() {
    if (loader.classList.contains('is-hidden')) return;
    loader.classList.add('is-hidden');
    setTimeout(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 600);
  }
  setTimeout(hideLoader, reducedMotion ? 300 : 1200);

  /* ---------- 8. Animaciones de entrada (scroll) ---------- */
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

  /* ---------- 9. Gráficas en canvas ---------- */
  const barCanvas = document.getElementById('bar-chart');
  const donutCanvas = document.getElementById('donut-chart');
  const donutLegend = document.getElementById('donut-legend');
  let chartsDone = false;

  // Ajusta el canvas a su tamaño real (soporte HiDPI)
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  // Gráfico de barras animado (progreso 0 → 1)
  function drawBarChart(progress) {
    const data = CHART_DATA[lang];
    const { ctx, w, h } = setupCanvas(barCanvas);
    const maxV = 50;
    const padL = 38, padR = 10, padT = 14, padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const font = fontFamily();

    // Líneas de la cuadrícula + etiquetas del eje Y
    ctx.font = '11px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = i * 10;
      const y = padT + plotH - (v / maxV) * plotH;
      ctx.strokeStyle = cssVar('--grid');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillStyle = cssVar('--text-3');
      ctx.fillText(String(v) + 'k', padL - 8, y);
    }

    // Barras con crecimiento escalonado
    const slot = plotW / data.bars.length;
    const barW = Math.min(44, slot * 0.52);
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, cssVar('--accent'));
    grad.addColorStop(1, cssVar('--accent-2'));

    data.bars.forEach(function (value, i) {
      const p = Math.min(1, Math.max(0, progress * 1.25 - i * 0.06));
      const barH = (value / maxV) * plotH * easeOut(p);
      const x = padL + i * slot + (slot - barW) / 2;
      const y = padT + plotH - barH;

      ctx.fillStyle = grad;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]);
      } else {
        ctx.rect(x, y, barW, barH);
      }
      ctx.fill();

      // Valor encima de la barra (cuando está casi completa)
      ctx.textAlign = 'center';
      if (p > 0.98) {
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = cssVar('--text');
        ctx.font = '600 12px ' + font;
        ctx.fillText(String(value) + 'k', x + barW / 2, y - 6);
      }
      // Mes bajo la barra
      ctx.textBaseline = 'top';
      ctx.fillStyle = cssVar('--text-3');
      ctx.font = '11px ' + font;
      ctx.fillText(data.months[i], x + barW / 2, h - padB + 9);
    });
  }

  // Donut animado (progreso 0 → 1)
  function drawDonut(progress) {
    const data = CHART_DATA[lang].donut;
    const { ctx, w, h } = setupCanvas(donutCanvas);
    const total = data.reduce(function (s, d) { return s + d.value; }, 0);
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 16;
    const lineW = Math.max(16, r * 0.34);
    const font = fontFamily();

    // Anillo de fondo
    ctx.lineWidth = lineW;
    ctx.strokeStyle = cssVar('--grid');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Segmentos que se "despliegan" según el progreso
    const sweep = easeOut(progress) * Math.PI * 2;
    let acc = 0;
    data.forEach(function (seg) {
      const gap = 0.035;
      const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2 + gap;
      acc += seg.value;
      const a1 = -Math.PI / 2 + (acc / total) * Math.PI * 2 - gap;
      const end = Math.min(a1, -Math.PI / 2 + sweep);
      if (end > a0) {
        ctx.strokeStyle = seg.color;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, end);
        ctx.stroke();
      }
    });

    // Texto central
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cssVar('--text');
    ctx.font = '700 24px ' + font;
    ctx.fillText(t()['stats.donutCenter'], cx, cy - 11);
    ctx.fillStyle = cssVar('--text-3');
    ctx.font = '11px ' + font;
    ctx.fillText(t()['stats.donutCenterLabel'], cx, cy + 15);
  }

  function drawCharts() {
    drawBarChart(1);
    drawDonut(1);
  }

  function buildDonutLegend() {
    if (!donutLegend) return;
    donutLegend.innerHTML = '';
    CHART_DATA[lang].donut.forEach(function (seg) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = seg.color;
      const text = document.createElement('span');
      text.textContent = seg.label + ' · ' + seg.value + '%';
      li.appendChild(dot);
      li.appendChild(text);
      donutLegend.appendChild(li);
    });
  }

  function animateCharts() {
    const start = performance.now();
    const dur = reducedMotion ? 1 : 1100;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      drawBarChart(p);
      drawDonut(p);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- 10. Contadores animados ---------- */
  function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      const target = parseFloat(el.getAttribute('data-count'));
      const suffix = el.getAttribute('data-suffix') || '';
      const dur = reducedMotion ? 1 : 1200;
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * easeOut(p)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------- 11. Activar gráficas al hacer scroll ---------- */
  const chartsSection = document.getElementById('stats-charts');
  if ('IntersectionObserver' in window && chartsSection) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !chartsDone) {
          chartsDone = true;
          animateCounters();
          animateCharts();
          io.disconnect();
        }
      });
    }, { threshold: 0.25 });
    io.observe(chartsSection);
  } else {
    chartsDone = true;
    animateCounters();
    drawCharts();
  }

  /* ---------- 12. Partículas del hero (canvas) ---------- */
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

  function resizeParticles() {
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
  startParticles();

  /* ---------- 13. Resize (con debounce) ---------- */
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      startParticles();
      if (chartsDone) drawCharts();
    }, 200);
  });

  /* ---------- 14. Inicialización ---------- */
  buildDonutLegend();
  applyLang(lang);
})();
