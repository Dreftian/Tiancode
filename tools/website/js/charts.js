/* ============================================================
   Tiancode — Website charts (Robust rendering)
   Gráficas en canvas HiDPI (barras + donut), leyenda reactiva
   y renderizado inmediato garantizado sin pantallas negras.
   ============================================================ */

import { CHART_DATA, getLang, t } from './i18n.js';
import { animateCounters, resizeParticles } from './animations.js';
import { cssVar, easeOut, fontFamily, reducedMotion } from './utils.js';

let chartsDone = false;

function getCanvas(id) {
  return document.getElementById(id);
}

// Ajusta el canvas a su tamaño real (soporte HiDPI con fallbacks)
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(240, Math.round(rect.width || canvas.parentElement?.clientWidth || 360));
  const height = Math.max(200, Math.round(rect.height || 240));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: width, h: height };
}

// Gráfico de barras animado (progreso 0 → 1)
function drawBarChart(progress) {
  const barCanvas = getCanvas('bar-chart');
  if (!barCanvas) return;
  const data = CHART_DATA[getLang()] || CHART_DATA.es;
  const { ctx, w, h } = setupCanvas(barCanvas);
  const maxV = 50;
  const padL = 36, padR = 12, padT = 16, padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const font = fontFamily();
  const gridColor = cssVar('--grid') || 'rgba(255, 255, 255, 0.08)';
  const text3Color = cssVar('--text-3') || '#8b93a7';
  const textColor = cssVar('--text') || '#f1f2f7';
  const accentColor = cssVar('--accent') || '#6366f1';
  const accent2Color = cssVar('--accent-2') || '#22d3ee';

  // Líneas de la cuadrícula + etiquetas del eje Y
  ctx.font = '11px ' + font;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const v = i * 10;
    const y = padT + plotH - (v / maxV) * plotH;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillStyle = text3Color;
    ctx.fillText(String(v) + 'k', padL - 8, y);
  }

  // Barras con crecimiento escalonado
  const slot = plotW / data.bars.length;
  const barW = Math.min(38, slot * 0.55);
  const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  grad.addColorStop(0, accentColor);
  grad.addColorStop(1, accent2Color);

  data.bars.forEach(function (value, i) {
    const p = Math.min(1, Math.max(0, progress * 1.2 - i * 0.05));
    const barH = Math.max(4, (value / maxV) * plotH * easeOut(p));
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

    // Valor encima de la barra
    ctx.textAlign = 'center';
    if (p > 0.9) {
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = textColor;
      ctx.font = '600 11.5px ' + font;
      ctx.fillText(String(value) + 'k', x + barW / 2, y - 4);
    }
    // Mes bajo la barra
    ctx.textBaseline = 'top';
    ctx.fillStyle = text3Color;
    ctx.font = '11px ' + font;
    ctx.fillText(data.months[i], x + barW / 2, h - padB + 8);
  });
}

// Donut animado (progreso 0 → 1)
function drawDonut(progress) {
  const donutCanvas = getCanvas('donut-chart');
  if (!donutCanvas) return;
  const data = (CHART_DATA[getLang()] || CHART_DATA.es).donut;
  const { ctx, w, h } = setupCanvas(donutCanvas);
  const total = data.reduce(function (s, d) { return s + d.value; }, 0);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 16;
  const lineW = Math.max(14, r * 0.32);
  const font = fontFamily();
  const gridColor = cssVar('--grid') || 'rgba(255, 255, 255, 0.08)';
  const textColor = cssVar('--text') || '#f1f2f7';
  const text3Color = cssVar('--text-3') || '#8b93a7';

  // Anillo de fondo
  ctx.lineWidth = lineW;
  ctx.strokeStyle = gridColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Segmentos que se despliegan
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
  ctx.fillStyle = textColor;
  ctx.font = '700 22px ' + font;
  ctx.fillText('100%', cx, cy - 10);
  ctx.fillStyle = text3Color;
  ctx.font = '11px ' + font;
  ctx.fillText('Local + Cloud', cx, cy + 12);
}

export function drawCharts() {
  drawBarChart(1);
  drawDonut(1);
}

export function buildDonutLegend() {
  const donutLegend = document.getElementById('donut-legend');
  if (!donutLegend) return;
  donutLegend.innerHTML = '';
  const data = (CHART_DATA[getLang()] || CHART_DATA.es).donut;
  data.forEach(function (seg) {
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
  const dur = reducedMotion ? 1 : 900;
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    drawBarChart(p);
    drawDonut(p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function initCharts() {
  buildDonutLegend();
  drawCharts();
  setTimeout(drawCharts, 50);
  setTimeout(drawCharts, 300);

  const chartsSection = document.getElementById('stats-charts') || document.getElementById('stats');
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
    }, { threshold: 0.05 });
    io.observe(chartsSection);
  } else {
    chartsDone = true;
    animateCounters();
    drawCharts();
  }

  // Si después de 1 segundo los contadores no se animaron, ejecutarlos de respaldo
  setTimeout(function () {
    if (!chartsDone) {
      chartsDone = true;
      animateCounters();
      drawCharts();
    }
  }, 1000);

  document.addEventListener('tiancode:langchange', function () {
    buildDonutLegend();
    drawCharts();
  });
  document.addEventListener('tiancode:themechange', function () {
    drawCharts();
  });

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeParticles();
      drawCharts();
    }, 150);
  });
}
