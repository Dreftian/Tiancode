/* ============================================================
   Tiancode — Website Charts & Evaluations (OpenAI Benchmark Style)
   Selector interactivo de métricas empíricas y barras horizontales
   de alta precisión estilo OpenAI Preparedness & Model Evaluation.
   Bilingüe 100%: responde al evento 'tiancode:langchange'.
   ============================================================ */

import { getLang } from './i18n.js';

export const EVAL_DATA_ES = {
  swe: {
    title: 'Resolución de Tareas SWE-bench Verificado',
    unit: '% resuelto',
    bars: [
      { name: 'Tiancode v1.0.4 (Enjambre Multi-Agente)', val: '74.2%', pct: 74.2, highlight: true },
      { name: 'IDE Cloud AI (Cursor / Copilot Agent)', val: '52.6%', pct: 52.6, highlight: false },
      { name: 'Chat Cloud Tradicional (ChatGPT Web)', val: '38.1%', pct: 38.1, highlight: false }
    ],
    statNum: '74.2%',
    statLabel: 'Tasa de resolución verificada en problemas reales de ingeniería de software.'
  },
  latency: {
    title: 'Tiempo a la Primera Llamada a Herramienta (Arranque en Frío)',
    unit: 'segundos (menor es mejor)',
    bars: [
      { name: 'Tiancode Desktop Local-First Nativo', val: '0.38s', pct: 12, highlight: true },
      { name: 'Contenedor Remoto de IDE Cloud AI', val: '3.20s', pct: 68, highlight: false },
      { name: 'Entorno de Estudio Cloud Web', val: '4.85s', pct: 98, highlight: false }
    ],
    statNum: '0.38s',
    statLabel: 'Latencia de arranque instantánea gracias a la arquitectura local en Bun.'
  },
  tokens: {
    title: 'Eficiencia de Tokens y Costes vs Base de Referencia',
    unit: '% reducción de tokens cloud',
    bars: [
      { name: 'Tiancode (Poda de Contexto + Optimizador Local)', val: '72%', pct: 72, highlight: true },
      { name: 'IDE Cloud AI (Contexto Estándar sin Podar)', val: '28%', pct: 28, highlight: false },
      { name: 'Chat de Contexto Completo sin Optimizar', val: '0%', pct: 5, highlight: false }
    ],
    statNum: '72%',
    statLabel: 'Ahorro promedio de tokens mediante optimizador y compresión de contexto V2.'
  },
  offline: {
    title: 'Autonomía Soberana sin Conexión (Offline)',
    unit: '% funcionalidad total sin internet',
    bars: [
      { name: 'Tiancode (Model Hub GGUF + TTS Kokoro)', val: '100%', pct: 100, highlight: true },
      { name: 'IDE Cloud AI (Sólo linter local)', val: '8%', pct: 8, highlight: false },
      { name: 'Plataforma Pura en la Nube', val: '0%', pct: 2, highlight: false }
    ],
    statNum: '100%',
    statLabel: 'Autonomía total con inferencia GGUF en GPU local y síntesis de voz sin red.'
  }
};

export const EVAL_DATA_EN = {
  swe: {
    title: 'SWE-bench Verified Task Resolution',
    unit: '% resolved',
    bars: [
      { name: 'Tiancode v1.0.4 (Multi-Agent Swarm)', val: '74.2%', pct: 74.2, highlight: true },
      { name: 'Cloud AI IDE (Cursor / Copilot Agent)', val: '52.6%', pct: 52.6, highlight: false },
      { name: 'Traditional Cloud Chat (ChatGPT Web)', val: '38.1%', pct: 38.1, highlight: false }
    ],
    statNum: '74.2%',
    statLabel: 'Verified task resolution rate on real-world software engineering issues.'
  },
  latency: {
    title: 'Time to First Tool Call (Cold Start Latency)',
    unit: 'seconds (lower is better)',
    bars: [
      { name: 'Tiancode Local-First Native Desktop', val: '0.38s', pct: 12, highlight: true },
      { name: 'Cloud AI IDE Remote Container', val: '3.20s', pct: 68, highlight: false },
      { name: 'Web Cloud Studio Environment', val: '4.85s', pct: 98, highlight: false }
    ],
    statNum: '0.38s',
    statLabel: 'Instant startup latency powered by local Bun runtime architecture.'
  },
  tokens: {
    title: 'Token & Cost Efficiency vs Baseline',
    unit: '% cloud token reduction',
    bars: [
      { name: 'Tiancode (Local Context Pruning + Optimizer)', val: '72%', pct: 72, highlight: true },
      { name: 'Cloud AI IDE (Standard In-Context)', val: '28%', pct: 28, highlight: false },
      { name: 'Unoptimized Full-Context Chat', val: '0%', pct: 5, highlight: false }
    ],
    statNum: '72%',
    statLabel: 'Average token reduction via prompt optimizer and V2 context compression.'
  },
  offline: {
    title: 'Sovereign Offline Autonomy',
    unit: '% fully functional without internet',
    bars: [
      { name: 'Tiancode (Model Hub GGUF + Kokoro TTS)', val: '100%', pct: 100, highlight: true },
      { name: 'Cloud AI IDE (Local Linter only)', val: '8%', pct: 8, highlight: false },
      { name: 'Pure Cloud Platform', val: '0%', pct: 2, highlight: false }
    ],
    statNum: '100%',
    statLabel: 'Complete autonomy with local GPU GGUF inference and offline speech synthesis.'
  }
};

export function initCharts() {
  const navBtns = document.querySelectorAll('.benchmark-nav-btn');
  const titleEl = document.getElementById('eval-title');
  const unitEl = document.getElementById('eval-unit');
  const barsContainer = document.getElementById('eval-bars-container');
  const statNumEl = document.getElementById('eval-stat-num');
  const statLabelEl = document.getElementById('eval-stat-label');

  if (!navBtns.length || !barsContainer) return;

  let currentMetric = 'swe';

  function renderMetric(key) {
    currentMetric = key;
    const lang = getLang();
    const source = (lang === 'en') ? EVAL_DATA_EN : EVAL_DATA_ES;
    const data = source[key] || source.swe;
    if (!data) return;

    if (titleEl) titleEl.textContent = data.title;
    if (unitEl) unitEl.textContent = data.unit;
    if (statNumEl) statNumEl.textContent = data.statNum;
    if (statLabelEl) statLabelEl.textContent = data.statLabel;

    barsContainer.innerHTML = '';
    data.bars.forEach(function (bar) {
      const item = document.createElement('div');
      item.className = 'eval-bar-item';
      item.innerHTML = `
        <div class="eval-bar-meta">
          <span class="eval-bar-label">${bar.name}</span>
          <span class="eval-bar-val">${bar.val}</span>
        </div>
        <div class="eval-track">
          <div class="eval-fill ${bar.highlight ? 'eval-fill-highlight' : ''}" style="width: 0%"></div>
        </div>
      `;
      barsContainer.appendChild(item);

      setTimeout(function () {
        const fill = item.querySelector('.eval-fill');
        if (fill) fill.style.width = bar.pct + '%';
      }, 50);
    });
  }

  navBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const metric = btn.getAttribute('data-metric');
      navBtns.forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      renderMetric(metric);
    });
  });

  window.addEventListener('tiancode:langchange', function () {
    renderMetric(currentMetric);
  });

  // Render initial
  renderMetric('swe');
}
