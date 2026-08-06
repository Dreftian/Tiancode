/* ============================================================
   Tiancode — Website charts
   Gráficas animadas en canvas (barras + donut), leyenda y
   activación al hacer scroll. Escucha cambios de tema/idioma.
   ============================================================ */

import { CHART_DATA, getLang, t } from './i18n.js';
import { animateCounters, resizeParticles } from './animations.js';
import { cssVar, easeOut, fontFamily, reducedMotion } from './utils.js';

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
  if (!barCanvas) return;
  const data = CHART_DATA[getLang()];
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
  if (!donutCanvas) return;
  const data = CHART_DATA[getLang()].donut;
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
  ctx.fillText(t('stats.donutCenter'), cx, cy - 11);
  ctx.fillStyle = cssVar('--text-3');
  ctx.font = '11px ' + font;
  ctx.fillText(t('stats.donutCenterLabel'), cx, cy + 15);
}

function drawCharts() {
  drawBarChart(1);
  drawDonut(1);
}

function buildDonutLegend() {
  if (!donutLegend) return;
  donutLegend.innerHTML = '';
  CHART_DATA[getLang()].donut.forEach(function (seg) {
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

export function initCharts() {
  // Activar gráficas al hacer scroll hasta la sección de estadísticas
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

  // Repinta al cambiar de idioma o de tema
  document.addEventListener('tiancode:langchange', function () {
    buildDonutLegend();
    if (chartsDone) drawCharts();
  });
  document.addEventListener('tiancode:themechange', function () {
    if (chartsDone) drawCharts();
  });

  // Resize (con debounce): partículas + repintado
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeParticles();
      if (chartsDone) drawCharts();
    }, 200);
  });
}
