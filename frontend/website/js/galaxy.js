/* ============================================================
   TIANCODE — Motor Astral Cósmico GPT-6 Astra con Emblema del Gato
   Lienzo de estrellas 3D en pantalla completa, convergencia
   del emblema del gato Tiancode + letras 'TIANCODE', cintas
   de luz celestial, destellos en cruz (+) y dispersión reactiva al scroll.
   ============================================================ */

const PALETTE = [
  { r: 255, g: 255, b: 255 }, // Diamante puro
  { r: 224, g: 242, b: 254 }, // Hielo estelar
  { r: 186, g: 230, b: 253 }, // Cian etéreo
  { r: 125, g: 211, b: 252 }, // Azul celeste
  { r: 56,  g: 189, b: 248 }, // Azul radiante Astra
  { r: 254, g: 240, b: 138 }  // Oro estelar sutil
];

// Polígonos vectoriales del emblemático gato Tiancode (ojos, sonrisa y colmillos)
const CAT_POLYGONS = [{"eye": true, "pts": [[-70.2, -60.1], [-70.2, -56.4], [-65.2, -40.1], [-56.4, -23.9], [-48.3, -13.3], [-46.5, -12.1], [-45.8, -30.2], [-39.6, -51.4], [-30.2, -28.9], [-19.6, -13.3], [-15.3, -9.6], [-0.3, -49.5], [14.0, -18.9], [19.6, -11.5], [28.4, -24.6], [35.2, -38.9], [39.6, -51.4], [45.8, -32.0], [47.7, -11.5], [54.6, -19.6], [59.6, -27.7], [66.4, -42.6], [70.2, -56.4], [70.2, -60.1], [57.7, -55.7], [40.2, -52.0], [21.5, -50.1], [-8.4, -49.5], [-30.9, -50.7], [-43.3, -52.6], [-59.6, -56.4]]}, {"eye": true, "pts": [[106.3, -161.1], [100.7, -151.2], [93.2, -141.2], [82.6, -131.2], [60.8, -114.4], [42.1, -95.6], [28.4, -77.6], [25.9, -73.2], [26.5, -70.1], [30.2, -68.8], [47.7, -68.8], [60.2, -71.3], [77.6, -78.8], [83.9, -83.2], [92.6, -91.9], [100.1, -104.4], [105.7, -123.7], [108.2, -146.8]]}, {"eye": true, "pts": [[-106.3, -161.1], [-107.6, -156.8], [-107.6, -136.8], [-105.7, -123.7], [-100.7, -106.3], [-96.3, -97.5], [-90.7, -90.0], [-77.0, -78.8], [-57.7, -70.7], [-48.3, -68.8], [-30.9, -68.8], [-25.9, -70.7], [-25.3, -72.0], [-29.0, -78.8], [-44.0, -98.1], [-57.7, -111.9], [-83.9, -132.4], [-95.7, -144.3]]}, {"eye": false, "pts": [[40.2, -42.6], [39.0, -42.0], [29.0, -21.4], [20.9, -9.6], [21.5, -7.1], [27.1, 0.4], [43.3, -5.2], [45.2, -8.3], [45.2, -25.2]]}, {"eye": false, "pts": [[0.3, -42.6], [-6.5, -27.1], [-11.5, -12.1], [-12.2, -5.2], [-10.9, -2.7], [-4.1, 4.1], [8.4, 4.1], [24.6, 1.0], [12.8, -17.1]]}, {"eye": false, "pts": [[-39.0, -43.3], [-42.1, -37.0], [-44.0, -27.7], [-44.0, -13.3], [-41.5, -5.2], [-27.1, 0.4], [-9.0, 3.5], [-31.5, -27.1]]}, {"eye": false, "pts": [[73.3, -59.5], [70.8, -48.9], [63.9, -31.4], [57.1, -19.6], [48.3, -7.7], [52.7, -9.0], [70.2, -18.3], [85.1, -28.9], [94.5, -37.7], [88.9, -45.8], [79.5, -55.1]]}, {"eye": false, "pts": [[-86.4, -48.3], [-93.9, -37.0], [-83.3, -27.7], [-69.5, -18.3], [-50.8, -8.3], [-46.5, -7.1], [-56.4, -20.2], [-64.5, -33.9], [-73.3, -59.5]]}, {"eye": false, "pts": [[-17.8, -64.5], [-17.8, -63.2], [-13.4, -59.5], [-2.8, -55.1], [7.8, -56.4], [14.7, -60.1], [18.4, -63.8], [15.3, -66.3], [7.8, -68.2], [-7.8, -68.2]]}, {"eye": false, "pts": [[93.2, -71.3], [74.5, -62.0], [82.6, -55.7], [92.0, -45.8], [95.7, -39.5], [97.0, -39.5], [100.1, -43.3], [100.7, -52.0], [97.6, -65.7], [95.7, -70.1]]}, {"eye": false, "pts": [[97.6, -72.0], [102.0, -60.7], [102.6, -45.8], [110.7, -54.5], [116.9, -65.1], [107.6, -70.1]]}, {"eye": false, "pts": [[-94.5, -72.0], [-98.2, -63.8], [-100.1, -55.1], [-100.1, -43.3], [-97.0, -39.5], [-95.7, -39.5], [-89.5, -48.3], [-74.5, -62.0]]}, {"eye": false, "pts": [[-97.6, -72.0], [-108.8, -69.5], [-116.9, -64.5], [-108.8, -52.6], [-102.6, -45.8], [-102.6, -56.4]]}, {"eye": false, "pts": [[97.0, -74.4], [103.8, -73.2], [118.2, -67.6], [117.6, -79.4], [114.4, -88.2]]}, {"eye": false, "pts": [[-118.2, -67.6], [-105.7, -72.6], [-97.0, -74.4], [-113.8, -88.8], [-116.9, -81.3]]}, {"eye": false, "pts": [[125.0, -98.8], [123.2, -98.8], [116.3, -90.7], [120.0, -80.1], [120.7, -70.1], [126.9, -80.1], [131.3, -90.0]]}, {"eye": false, "pts": [[-124.4, -98.8], [-128.8, -94.4], [-130.6, -91.3], [-130.6, -88.8], [-120.7, -69.5], [-120.0, -78.8], [-116.3, -91.3], [-123.2, -98.8]]}, {"eye": false, "pts": [[-140.0, -116.2], [-135.6, -100.6], [-131.9, -93.2], [-130.6, -96.3], [-125.0, -100.6], [-125.0, -102.5], [-138.8, -116.2]]}, {"eye": false, "pts": [[140.0, -116.2], [134.4, -111.9], [125.7, -100.6], [132.5, -93.2]]}];

export function initGalaxy() {
  const canvas = document.getElementById('cosmic-galaxy-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const replayBtn = document.getElementById('cosmic-replay');

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let animId = null;

  // Estado de interactividad e inclinación 3D
  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;
  let globalAngle = 0;

  // Control de scroll: dispersa el emblema y las letras en el espacio profundo
  let scrollFrac = 0;
  let currentScrollFrac = 0;

  // Animación de entrada inicial suave
  let assembleT = 0;
  let isInitialEntrance = true;
  let entranceStartTime = performance.now();
  const ENTRANCE_DURATION = 2000; // 2 segundos de convergencia majestuosa

  // Geometría de las letras TIANCODE (situadas bajo el logo del gato)
  const word = 'TIANCODE';
  const letterW = 85;
  const gap = 35;
  const totalW = word.length * letterW + (word.length - 1) * gap; // 925
  const startX = -totalW / 2;
  const oy = 51.5; // Comienzo de las letras en Y (debajo del gato)
  const letterH = 110;

  const lines = [];
  const arcs = [];

  function addLine(x1, y1, x2, y2) {
    lines.push({ x1, y1, x2, y2 });
  }

  function addArc(cx, cy, rx, ry, startAngle, endAngle) {
    arcs.push({ cx, cy, rx, ry, startAngle, endAngle });
  }

  for (let idx = 0; idx < word.length; idx++) {
    const char = word[idx];
    const ox = startX + idx * (letterW + gap);

    switch (char) {
      case 'T':
        addLine(ox, oy, ox + letterW, oy);
        addLine(ox + letterW * 0.5, oy, ox + letterW * 0.5, oy + letterH);
        break;
      case 'I':
        addLine(ox + letterW * 0.2, oy, ox + letterW * 0.8, oy);
        addLine(ox + letterW * 0.5, oy, ox + letterW * 0.5, oy + letterH);
        addLine(ox + letterW * 0.2, oy + letterH, ox + letterW * 0.8, oy + letterH);
        break;
      case 'A':
        addLine(ox, oy + letterH, ox + letterW * 0.5, oy);
        addLine(ox + letterW * 0.5, oy, ox + letterW, oy + letterH);
        addLine(ox + letterW * 0.22, oy + letterH * 0.62, ox + letterW * 0.78, oy + letterH * 0.62);
        break;
      case 'N':
        addLine(ox, oy + letterH, ox, oy);
        addLine(ox, oy, ox + letterW, oy + letterH);
        addLine(ox + letterW, oy + letterH, ox + letterW, oy);
        break;
      case 'C':
        addArc(ox + letterW * 0.5, oy + letterH * 0.5, letterW * 0.48, letterH * 0.48, 0.75, Math.PI * 2 - 0.75);
        break;
      case 'O':
        addArc(ox + letterW * 0.5, oy + letterH * 0.5, letterW * 0.48, letterH * 0.48, 0, Math.PI * 2);
        break;
      case 'D':
        addLine(ox, oy, ox, oy + letterH);
        addLine(ox, oy, ox + letterW * 0.38, oy);
        addLine(ox, oy + letterH, ox + letterW * 0.38, oy + letterH);
        addArc(ox + letterW * 0.38, oy + letterH * 0.5, letterW * 0.52, letterH * 0.5, -Math.PI / 2, Math.PI / 2);
        break;
      case 'E':
        addLine(ox, oy, ox, oy + letterH);
        addLine(ox, oy, ox + letterW * 0.88, oy);
        addLine(ox, oy + letterH * 0.5, ox + letterW * 0.72, oy + letterH * 0.5);
        addLine(ox, oy + letterH, ox + letterW * 0.88, oy + letterH);
        break;
    }
  }

  // Colecciones de partículas
  const bgStars = [];
  const constellationStars = [];
  const spiralStars = [];
  const heroSpikes = [];

  function resizeAndInit() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Estrellas de fondo espacial profundo
    bgStars.length = 0;
    const NUM_BG = Math.min(420, Math.floor(width * 0.3));
    for (let i = 0; i < NUM_BG; i++) {
      bgStars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.6 + 0.4,
        alpha: Math.random() * 0.6 + 0.3,
        twinkleSpeed: Math.random() * 0.025 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }

    // 2. Escala y centrado armónico del emblema completo
    const maxTargetW = Math.min(width * 0.86, 1100);
    const textScale = maxTargetW / totalW;

    constellationStars.length = 0;

    function createConstellationStar(rawX, rawY, scale, isCore) {
      const tx = rawX * scale;
      const ty = rawY * scale;
      const tz = (Math.random() - 0.5) * 30;

      const scatterAngle = Math.random() * Math.PI * 2;
      const scatterDist = Math.random() * Math.min(width, height) * 0.95 + 240;
      const sx = Math.cos(scatterAngle) * scatterDist;
      const sy = Math.sin(scatterAngle) * scatterDist;
      const sz = (Math.random() - 0.5) * 480;

      const size = isCore
        ? (Math.random() < 0.28 ? Math.random() * 2.2 + 2.8 : Math.random() * 1.5 + 1.8)
        : (Math.random() * 1.4 + 1.0);

      const star = {
        tx, ty, tz,
        sx, sy, sz,
        size,
        isCore,
        baseAlpha: isCore ? (Math.random() * 0.25 + 0.75) : (Math.random() * 0.3 + 0.45),
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        twinkleSpeed: Math.random() * 0.035 + 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: Math.random() * 0.02 + 0.01,
        driftRadius: Math.random() * 2.0 + 0.5
      };

      constellationStars.push(star);
      return star;
    }

    // Generar partículas estelares para el gato Tiancode
    CAT_POLYGONS.forEach(function (poly) {
      const pts = poly.pts;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.hypot(dx, dy);
        const steps = Math.max(3, Math.floor(len / 6.0));
        const nx = -dy / (len || 1);
        const ny = dx / (len || 1);

        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const px = p1[0] + dx * t;
          const py = p1[1] + dy * t;
          createConstellationStar(px, py, textScale, true);

          if (Math.random() < 0.65) {
            const offset = (Math.random() - 0.5) * 6.0;
            createConstellationStar(px + nx * offset, py + ny * offset, textScale, false);
          }
        }
      }

      // Estrellas de relleno interior en los ojos para que resplandezcan intensamente
      if (poly.eye) {
        let minX = 9999, maxX = -9999, minY = 9999, maxY = -9999;
        pts.forEach(p => {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        });
        for (let k = 0; k < 28; k++) {
          const rx = minX + Math.random() * (maxX - minX);
          const ry = minY + Math.random() * (maxY - minY);
          createConstellationStar(rx, ry, textScale, false);
        }
      }
    });

    // Generar partículas estelares para las letras TIANCODE
    const starSpacing = 7;
    lines.forEach(function (line) {
      const dx = line.x2 - line.x1;
      const dy = line.y2 - line.y1;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(8, Math.floor(len / starSpacing));
      const nx = -dy / (len || 1);
      const ny = dx / (len || 1);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = line.x1 + dx * t;
        const py = line.y1 + dy * t;
        createConstellationStar(px, py, textScale, true);

        if (Math.random() < 0.75) {
          const offset = (Math.random() - 0.5) * 7.0;
          createConstellationStar(px + nx * offset, py + ny * offset, textScale, false);
        }
      }
    });

    arcs.forEach(function (arc) {
      const arcLen = Math.abs(arc.endAngle - arc.startAngle) * ((arc.rx + arc.ry) / 2);
      const steps = Math.max(12, Math.floor(arcLen / starSpacing));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = arc.startAngle + (arc.endAngle - arc.startAngle) * t;
        const px = arc.cx + Math.cos(angle) * arc.rx;
        const py = arc.cy + Math.sin(angle) * arc.ry;
        createConstellationStar(px, py, textScale, true);

        if (Math.random() < 0.75) {
          const rJitter = (Math.random() - 0.5) * 7.0;
          createConstellationStar(
            arc.cx + Math.cos(angle) * (arc.rx + rJitter),
            arc.cy + Math.sin(angle) * (arc.ry + rJitter),
            textScale,
            false
          );
        }
      }
    });

    // 3. Brazos espirales cósmicos
    spiralStars.length = 0;
    const NUM_SPIRAL = 850;
    const ARMS = 2;
    const maxR = Math.min(width, height) * 0.56;

    for (let i = 0; i < NUM_SPIRAL; i++) {
      const r = Math.pow(Math.random(), 1.6);
      const arm = i % ARMS;
      const offset = (arm * 2 * Math.PI) / ARMS;
      const theta = r * 4.2 + offset;
      const spread = (Math.random() - 0.5) * 0.5 * (0.3 + r * 0.7);
      const angle = theta + spread;

      spiralStars.push({
        radius: r * maxR,
        baseAngle: angle,
        z: (Math.random() - 0.5) * maxR * 0.22,
        size: Math.random() * 1.6 + 0.6,
        alpha: Math.random() * 0.5 + 0.3,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }

    // 4. Estrellas Hero con destellos de difracción en cruz (+)
    heroSpikes.length = 0;

    // Vértices clave del gato (puntas de orejas/cejas y extremos de la sonrisa)
    const keyCatTips = [
      { x: -106.3, y: -161.1, len: 26 },
      { x: 106.3,  y: -161.1, len: 26 },
      { x: -140.0, y: -116.2, len: 22 },
      { x: 140.0,  y: -116.2, len: 22 },
      { x: -25.9,  y: -70.7,  len: 18 },
      { x: 25.9,   y: -73.2,  len: 18 }
    ];

    keyCatTips.forEach(tip => {
      const s = createConstellationStar(tip.x, tip.y, textScale, true);
      heroSpikes.push({
        particle: s,
        spikeLen: tip.len,
        color: { r: 255, g: 255, b: 255 }
      });
    });

    const coreStars = constellationStars.filter(s => s.isCore);
    const stepHero = Math.max(1, Math.floor(coreStars.length / 28));
    for (let i = 0; i < coreStars.length; i += stepHero) {
      heroSpikes.push({
        particle: coreStars[i],
        spikeLen: Math.random() * 16 + 14,
        color: { r: 255, g: 255, b: 255 }
      });
    }
  }

  window.addEventListener('resize', resizeAndInit, { passive: true });
  resizeAndInit();

  // Escuchar Scroll: se desforma suavemente cuando el usuario baja
  window.addEventListener('scroll', function () {
    const sy = window.scrollY || document.documentElement.scrollTop;
    scrollFrac = Math.min(1, Math.max(0, sy / 420));
  }, { passive: true });

  // Seguimiento suave del cursor del ratón
  window.addEventListener('mousemove', function (e) {
    const nx = (e.clientX / width) * 2 - 1;
    const ny = (e.clientY / height) * 2 - 1;
    targetTiltX = ny * -0.14;
    targetTiltY = nx * 0.18;
  }, { passive: true });

  // Botón de repetición (↻)
  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      replayBtn.classList.add('is-spinning');
      setTimeout(() => replayBtn.classList.remove('is-spinning'), 800);

      isInitialEntrance = true;
      entranceStartTime = performance.now();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Proyección 3D en perspectiva
  function projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY) {
    const px3d = lx * cosY - lz * sinY;
    const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX;
    const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX;

    const scale = 1 / (1 + pz3d / 1000);
    return {
      x: cx + px3d * scale,
      y: cy + py3d * scale,
      scale: scale
    };
  }

  // Bucle de renderizado continuo a 60 FPS
  function render(time) {
    // 1. Animación de convergencia inicial al abrir la web
    if (isInitialEntrance) {
      const elapsed = time - entranceStartTime;
      const p = Math.min(1, elapsed / ENTRANCE_DURATION);
      assembleT = 1 - Math.pow(1 - p, 3);
      if (p >= 1) isInitialEntrance = false;
    } else {
      assembleT = 1;
    }

    // 2. Amortiguación de deformación por scroll
    currentScrollFrac += (scrollFrac - currentScrollFrac) * 0.08;
    const formationFactor = Math.max(0, assembleT * (1 - currentScrollFrac));

    // 3. Suavizado de inclinación 3D
    currentTiltX += (targetTiltX - currentTiltX) * 0.05;
    currentTiltY += (targetTiltY - currentTiltY) * 0.05;
    globalAngle += 0.0016;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.44;
    const maxTargetW = Math.min(width * 0.86, 1100);
    const textScale = maxTargetW / totalW;

    // 4. Dibujar estrellas del fondo profundo
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bgStars.length; i++) {
      const s = bgStars[i];
      const twinkle = Math.sin(time * s.twinkleSpeed + s.twinklePhase) * 0.35 + 0.65;
      const alpha = s.alpha * twinkle;

      ctx.fillStyle = "rgba(" + s.color.r + "," + s.color.g + "," + s.color.b + "," + alpha.toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parámetros de proyección 3D
    const cosX = Math.cos(0.26 + currentTiltX);
    const sinX = Math.sin(0.26 + currentTiltX);
    const cosY = Math.cos(currentTiltY);
    const sinY = Math.sin(currentTiltY);

    // 5. Nebulosa y resplandor central de halo cósmico
    if (formationFactor > 0.04) {
      const haloR = Math.min(width, height) * 0.54 * formationFactor;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      glow.addColorStop(0, 'rgba(255, 255, 255, ' + (0.30 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.22, 'rgba(165, 243, 252, ' + (0.18 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.52, 'rgba(56, 189, 248, ' + (0.07 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Brazos espirales cósmicos
    for (let i = 0; i < spiralStars.length; i++) {
      const sp = spiralStars[i];
      const curAngle = sp.baseAngle + globalAngle * 1.3;

      const lx = Math.cos(curAngle) * sp.radius;
      const ly = Math.sin(curAngle) * sp.radius;
      const lz = sp.z;

      const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY);
      const twinkle = Math.sin(time * sp.twinkleSpeed + sp.twinklePhase) * 0.3 + 0.7;
      const alpha = sp.alpha * twinkle * Math.max(0.2, pt.scale);

      if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
        ctx.fillStyle = "rgba(" + sp.color.r + "," + sp.color.g + "," + sp.color.b + "," + alpha.toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, sp.size * pt.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 7. EMBLEMA DEL GATO Y TRAZOS DE TIANCODE (Cintas y formas luminosas)
    if (formationFactor > 0.05) {
      const ribbonAlpha = Math.pow(formationFactor, 2);

      // A. Formas sólidas luminosas del gato (ojos blancos radiantes y dientes)
      CAT_POLYGONS.forEach(function (poly) {
        const pts = poly.pts.map(function (p) {
          return projectPoint(p[0] * textScale, p[1] * textScale, 0, cx, cy, cosX, sinX, cosY, sinY);
        });
        if (pts.length < 3) return;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.closePath();

        if (poly.eye) {
          ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.92 * ribbonAlpha).toFixed(2) + ')';
        } else {
          ctx.fillStyle = 'rgba(215, 242, 255, ' + (0.65 * ribbonAlpha).toFixed(2) + ')';
        }
        ctx.fill();

        // Cintas celestes alrededor de cada polígono del gato
        // Halo exterior
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.32 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 10 * pts[0].scale;
        ctx.stroke();

        // Resplandor medio
        ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.6 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 4.5 * pts[0].scale;
        ctx.stroke();

        // Núcleo blanco diamante
        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.92 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 1.8 * pts[0].scale;
        ctx.stroke();
      });

      // B. Cintas celestiales de las letras TIANCODE
      function drawProjectedLine(lx1, ly1, lx2, ly2) {
        const p1 = projectPoint(lx1 * textScale, ly1 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY);
        const p2 = projectPoint(lx2 * textScale, ly2 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY);

        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.28 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 14 * p1.scale;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.5 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 6 * p1.scale;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.85 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 2 * p1.scale;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      function drawProjectedArc(acx, acy, arx, ary, sa, ea) {
        const steps = 28;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const a = sa + (ea - sa) * t;
          const lx = (acx + Math.cos(a) * arx) * textScale;
          const ly = (acy + Math.sin(a) * ary) * textScale;
          pts.push(projectPoint(lx, ly, 0, cx, cy, cosX, sinX, cosY, sinY));
        }

        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.28 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 14 * pts[0].scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.5 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 6 * pts[0].scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.85 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 2 * pts[0].scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }

      lines.forEach(l => drawProjectedLine(l.x1, l.y1, l.x2, l.y2));
      arcs.forEach(a => drawProjectedArc(a.cx, a.cy, a.rx, a.ry, a.startAngle, a.endAngle));
    }

    // 8. Partículas de la constelación (Gato + TIANCODE)
    for (let i = 0; i < constellationStars.length; i++) {
      const p = constellationStars[i];

      const driftX = Math.cos(time * p.driftSpeed + p.driftPhase) * p.driftRadius;
      const driftY = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftRadius;

      const lx = (p.sx + (p.tx - p.sx) * formationFactor) + (driftX * formationFactor);
      const ly = (p.sy + (p.ty - p.sy) * formationFactor) + (driftY * formationFactor);
      const lz = p.sz + (p.tz - p.sz) * formationFactor;

      const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY);
      const twinkle = Math.sin(time * p.twinkleSpeed + p.twinklePhase) * 0.28 + 0.72;
      const alpha = p.baseAlpha * twinkle;

      if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
        ctx.fillStyle = "rgba(" + p.color.r + "," + p.color.g + "," + p.color.b + "," + (alpha * 0.45).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1.0, (p.size + 1.8) * pt.scale), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, " + Math.min(1, alpha * 1.2).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.6, p.size * pt.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Destellos de difracción en cruz (+) en los vértices principales
    if (formationFactor > 0.35) {
      for (let i = 0; i < heroSpikes.length; i++) {
        const h = heroSpikes[i];
        const p = h.particle;

        const lx = p.sx + (p.tx - p.sx) * formationFactor;
        const ly = p.sy + (p.ty - p.sy) * formationFactor;
        const lz = p.sz + (p.tz - p.sz) * formationFactor;

        const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY);
        const twinkle = Math.sin(time * 0.018 + i * 1.5) * 0.35 + 0.75;
        const spikeLen = h.spikeLen * pt.scale * twinkle * formationFactor;
        const alpha = (0.95 * twinkle * formationFactor).toFixed(2);

        if (pt.x >= 15 && pt.x <= width - 15 && pt.y >= 15 && pt.y <= height - 15) {
          ctx.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (p.size + 1.0) * pt.scale, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, " + (alpha * 0.85).toFixed(2) + ")";
          ctx.lineWidth = 1.2;

          ctx.beginPath();
          ctx.moveTo(pt.x - spikeLen, pt.y);
          ctx.lineTo(pt.x + spikeLen, pt.y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y - spikeLen);
          ctx.lineTo(pt.x, pt.y + spikeLen);
          ctx.stroke();
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);
}
