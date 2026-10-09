/* ============================================================
   Tiancode — Website main
   Punto de entrada: inicia todos los módulos y las
   interacciones del header (tema, idioma, menú móvil y
   menú desplegable de recursos).
   ============================================================ */

import { initTheme } from './theme.js?v=1.0.0-b1008';
import { applyLang, initI18n } from './i18n.js?v=1.0.0-b1008';
import { initRouter, closeDropdown } from './router.js?v=1.0.0-b1008';
import { initAnimations } from './animations.js?v=1.0.0-b1008';
import { initCharts } from './charts.js?v=1.0.0-b1008';
import { initFaq } from './faq.js?v=1.0.0-b1008';
import { initGalaxy } from './galaxy.js?v=1.0.0-b1008';
import { initUniverse } from './universe.js?v=1.0.0-b1008';

/* ---------- Inicialización de módulos ---------- */
initTheme();
initRouter();
initGalaxy();
initUniverse();
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

/* La sección activa la marca el universo (universe.js): la home no se desplaza. */

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

/* ============================================================
   Simulaciones Interactivas del Studio (#preview)
   ============================================================ */

// 1. Slider interactivo de VRAM
const vramInput = document.getElementById('vram-slider-input');
const vramVal = document.getElementById('vram-slider-val');
const vramFill = document.getElementById('vram-fill');
const vramStatusBadge = document.getElementById('vram-status-badge');
const qwenSpeed = document.getElementById('model-qwen-speed');
const deepseekSpeed = document.getElementById('model-deepseek-speed');
const llamaSpeed = document.getElementById('model-llama-speed');

if (vramInput) {
  vramInput.addEventListener('input', function () {
    const val = parseInt(vramInput.value, 10);
    const pct = Math.min(100, Math.round((val / 24) * 100));

    if (vramVal) vramVal.textContent = val + ' GB VRAM';
    if (vramFill) vramFill.style.width = pct + '%';

    if (vramStatusBadge) {
      if (val >= 10) {
        vramStatusBadge.innerHTML = (val * 0.7).toFixed(1) + ' GB / ' + val + '.0 GB VRAM (🟢 100% GPU Offload)';
        vramStatusBadge.style.color = '#10b981';
      } else {
        vramStatusBadge.innerHTML = val + '.0 GB VRAM (🟡 Offload Parcial CPU/GPU)';
        vramStatusBadge.style.color = '#f59e0b';
      }
    }

    const mult = (val / 12);
    if (qwenSpeed) qwenSpeed.textContent = '⚡ ' + (54.2 * mult).toFixed(1) + ' tokens/seg';
    if (deepseekSpeed) deepseekSpeed.textContent = '⚡ ' + (68.1 * mult).toFixed(1) + ' tokens/seg';
    if (llamaSpeed) llamaSpeed.textContent = '⚡ ' + (32.4 * mult).toFixed(1) + ' tokens/seg';
  });
}

// 2. Auto-Reparación AST (Panel 1)
const astFixBtn = document.getElementById('ast-fix-btn');
const astStatusText = document.getElementById('ast-status-text');

if (astFixBtn) {
  let fixed = false;
  astFixBtn.addEventListener('click', function () {
    fixed = !fixed;
    if (fixed) {
      astFixBtn.textContent = '✓ AST Sincronizado (Tests en verde)';
      astFixBtn.classList.remove('btn-primary');
      astFixBtn.classList.add('btn-secondary');
      if (astStatusText) {
        astStatusText.textContent = '▸ 3 archivos sincronizados · 0 vulnerabilidades restantes ✓';
        astStatusText.style.color = '#10b981';
      }
    } else {
      astFixBtn.textContent = '⚡ Simular Auto-Reparación AST';
      astFixBtn.classList.add('btn-primary');
      astFixBtn.classList.remove('btn-secondary');
      if (astStatusText) {
        astStatusText.textContent = '▸ 2 vulnerabilidades corregidas';
        astStatusText.style.color = '';
      }
    }
  });
}

// 3. Live Preview Component Click Inspector (Panel 3)
const previewBox = document.getElementById('preview-interactive-box');
const previewInner = document.getElementById('preview-render-inner');
const previewTitle = document.getElementById('preview-render-title');
const hmrCounter = document.getElementById('hmr-counter-badge');
let hmrCount = 1;

if (previewBox && previewInner) {
  previewBox.addEventListener('click', function () {
    hmrCount++;
    if (hmrCounter) hmrCounter.textContent = 'HMR ' + (hmrCount % 5 + 2) + 'ms · Update #' + hmrCount;

    const colors = [
      'var(--accent-soft)',
      'rgba(16, 185, 129, 0.15)',
      'rgba(236, 72, 153, 0.15)',
      'rgba(59, 130, 246, 0.15)'
    ];
    const borders = ['var(--accent)', '#10b981', '#ec4899', '#3b82f6'];
    const idx = hmrCount % colors.length;

    previewInner.style.background = colors[idx];
    previewInner.style.borderColor = borders[idx];
    if (previewTitle) previewTitle.textContent = 'Tiancode Live Preview (Estado #' + hmrCount + ')';
  });
}

// 4. Voz Kokoro TTS Player (Panel 5)
const voicePlayBtn = document.getElementById('voice-play-demo-btn');
const voicePlayText = document.getElementById('voice-play-demo-text');
const voiceWaveBars = document.querySelectorAll('.voice-wave-bar');

if (voicePlayBtn) {
  let isPlaying = false;
  voicePlayBtn.addEventListener('click', function () {
    if (isPlaying) return;
    isPlaying = true;

    if (voicePlayText) voicePlayText.textContent = '🔊 Reproduciendo síntesis...';
    voiceWaveBars.forEach(function (bar) {
      bar.style.animationDuration = '0.4s';
    });

    if ('speechSynthesis' in window) {
      const textToSpeak = document.getElementById('voice-speech-phrase')?.textContent || 'Refactoriza la función de autenticación y asegura compatibilidad con JWT';
      const utter = new SpeechSynthesisUtterance(textToSpeak.trim());
      utter.lang = 'es-ES';
      utter.rate = 1.05;
      utter.onend = function () {
        finishVoiceDemo();
      };
      utter.onerror = function () {
        finishVoiceDemo();
      };
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(finishVoiceDemo, 3200);
    }

    function finishVoiceDemo() {
      isPlaying = false;
      if (voicePlayText) voicePlayText.textContent = '▶ Probar Voz Kokoro';
      voiceWaveBars.forEach(function (bar) {
        bar.style.animationDuration = '1.2s';
      });
    }
  });
}

