/* ============================================================
   Tiancode — Website Charts & Evaluations (OpenAI Benchmark Style)
   Selector interactivo de métricas empíricas y barras horizontales
   de alta precisión estilo OpenAI Preparedness & Model Evaluation.
   ============================================================ */

export const EVAL_DATA = {
  swe: {
    title: 'SWE-bench Verified Task Resolution',
    unit: '% resolved',
    bars: [
      { name: 'Tiancode v1.0.4 (Multi-Agent Swarm)', val: '74.2%', pct: 74.2, highlight: true },
      { name: 'Cloud AI IDE (Cursor / Copilot Agent)', val: '52.6%', pct: 52.6, highlight: false },
      { name: 'Traditional Cloud Chat (ChatGPT Web)', val: '38.1%', pct: 38.1, highlight: false }
    ],
    statNum: '74.2%',
    statLabel: 'Tasa de resolución verificada en problemas reales de ingeniería de software.'
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
    statLabel: 'Latencia de arranque instantánea gracias a la arquitectura local en Bun.'
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
    statLabel: 'Ahorro promedio de tokens mediante optimizador y compresión de contexto V2.'
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
    statLabel: 'Autonomía total con inferencia GGUF en GPU local y síntesis de voz sin red.'
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

  function renderMetric(key) {
    const data = EVAL_DATA[key];
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

      // Animate width
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

  // Render initial
  renderMetric('swe');
}
