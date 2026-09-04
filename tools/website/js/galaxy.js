/* ============================================================
   Tiancode — Full-Page Astral Background & TIANCODE Constellation Engine
   - Fondo astral espacial fijo para TODA la página web
   - Animación de entrada: las estrellas convergen y forman TIANCODE
   - Scroll reactivo: al hacer scroll hacia abajo, TIANCODE se desforma
     y se dispersa en el fondo espacial profundo
   - Al volver al tope, TIANCODE se vuelve a formar automáticamente
   - Rotación cósmica 3D, estrellas con destellos en cruz (+) y nebulosa
   ============================================================ */

export function initGalaxy() {
  const canvas = document.getElementById('cosmic-galaxy-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const replayBtn = document.getElementById('cosmic-replay-btn');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let animId = null;

  // Estados de animación
  let assembleT = 0; // 0 = disperso en el espacio, 1 = formado en TIANCODE
  let isInitialEntrance = true;
  let entranceStartTime = performance.now();
  const ENTRANCE_DURATION = 2200; // ms

  // Scroll interactivo para dispersar TIANCODE
  let scrollFrac = 0; // 0 = en el hero, 1 = scrolleado hacia abajo
  let currentScrollFrac = 0;

  // Inclinación 3D con cursor
  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;
  let globalAngle = 0;

  // Paleta de estrellas cósmicas
  const PALETTE = [
    { r: 255, g: 255, b: 255 }, // Blanco diamante
    { r: 255, g: 255, b: 255 },
    { r: 215, g: 240, b: 255 }, // Azul/Cian estelar
    { r: 165, g: 243, b: 252 },
    { r: 254, g: 215, b: 170 }, // Ámbar cálido
    { r: 251, g: 191, b: 36 }
  ];

  // Colecciones de partículas
  const bgStars = [];
  const constellationStars = [];
  const spiralStars = [];
  const heroSpikes = [];

  // Generador vectorial determinista de las letras T - I - A - N - C - O - D - E
  function buildConstellationPoints() {
    const word = 'TIANCODE';
    const letterW = 76;
    const letterH = 104;
    const gap = 22;
    const totalW = word.length * letterW + (word.length - 1) * gap;
    const startX = -totalW / 2;

    const rawPoints = [];
    const density = 32;

    function addPoint(x, y, isCore = true) {
      rawPoints.push({ x, y, isCore });
    }

    function addLine(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const steps = Math.max(8, Math.floor((len / 100) * density));
      const nx = -dy / (len || 1);
      const ny = dx / (len || 1);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        // Estrella núcleo
        addPoint(px, py, true);
        // Polvo estelar acompañante para darle grosor y luminosidad celestial
        if (Math.random() < 0.65) {
          const offset = (Math.random() - 0.5) * 5.5;
          addPoint(px + nx * offset, py + ny * offset, false);
        }
      }
    }

    function addArc(cx, cy, rx, ry, startAngle, endAngle) {
      const arcLen = Math.abs(endAngle - startAngle) * ((rx + ry) / 2);
      const steps = Math.max(12, Math.floor((arcLen / 100) * density * 1.3));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + (endAngle - startAngle) * t;
        const px = cx + Math.cos(angle) * rx;
        const py = cy + Math.sin(angle) * ry;
        addPoint(px, py, true);
        if (Math.random() < 0.65) {
          const rJitter = (Math.random() - 0.5) * 5.5;
          addPoint(cx + Math.cos(angle) * (rx + rJitter), cy + Math.sin(angle) * (ry + rJitter), false);
        }
      }
    }

    for (let idx = 0; idx < word.length; idx++) {
      const char = word[idx];
      const ox = startX + idx * (letterW + gap);
      const oy = -letterH / 2;

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
          addLine(ox, oy, ox + letterW * 0.85, oy);
          addLine(ox, oy + letterH * 0.5, ox + letterW * 0.7, oy + letterH * 0.5);
          addLine(ox, oy + letterH, ox + letterW * 0.85, oy + letterH);
          break;
      }
    }

    return { rawPoints, totalW, letterH };
  }

  function resizeAndInit() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);

    // 1. Estrellas de fondo espacial (cubren TODA la ventana en fixed)
    bgStars.length = 0;
    const NUM_BG = Math.min(380, Math.floor(width * 0.28));
    for (let i = 0; i < NUM_BG; i++) {
      bgStars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.65 + 0.25,
        twinkleSpeed: Math.random() * 0.02 + 0.006,
        twinklePhase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }

    // 2. Constelación TIANCODE
    const { rawPoints, totalW } = buildConstellationPoints();
    constellationStars.length = 0;

    // Escala de TIANCODE para que quepa armoniosamente en pantalla
    const maxTargetW = Math.min(width * 0.86, 1100);
    const textScale = maxTargetW / totalW;

    for (let i = 0; i < rawPoints.length; i++) {
      const pt = rawPoints[i];
      const tx = pt.x * textScale;
      const ty = pt.y * textScale;
      const tz = (Math.random() - 0.5) * 32;

      // Posición dispersa en el espacio exterior (hacia donde se dispersan en scroll)
      const scatterAngle = Math.random() * Math.PI * 2;
      const scatterDist = Math.random() * Math.min(width, height) * 0.9 + 220;
      const sx = Math.cos(scatterAngle) * scatterDist;
      const sy = Math.sin(scatterAngle) * scatterDist;
      const sz = (Math.random() - 0.5) * 450;

      const size = pt.isCore
        ? (Math.random() < 0.25 ? Math.random() * 2.8 + 1.8 : Math.random() * 1.6 + 1.0)
        : (Math.random() * 1.2 + 0.5);

      constellationStars.push({
        tx, ty, tz,
        sx, sy, sz,
        x: sx, y: sy, z: sz,
        size,
        isCore: pt.isCore,
        baseAlpha: pt.isCore ? (Math.random() * 0.3 + 0.7) : (Math.random() * 0.35 + 0.4),
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        twinkleSpeed: Math.random() * 0.03 + 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: Math.random() * 0.02 + 0.01,
        driftRadius: Math.random() * 1.8 + 0.4
      });
    }

    // 3. Brazos espirales del astro galáctico
    spiralStars.length = 0;
    const NUM_SPIRAL = 900;
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
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.5 + 0.35,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }

    // 4. Estrellas Hero con destellos en cruz (+)
    heroSpikes.length = 0;
    const coreStars = constellationStars.filter(s => s.isCore);
    const stepHero = Math.max(1, Math.floor(coreStars.length / 20));
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

  // Escuchar Scroll: TIANCODE se desforma cuando el usuario baja
  window.addEventListener('scroll', function () {
    const sy = window.scrollY || document.documentElement.scrollTop;
    // Se desforma gradualmente entre 0px y 420px de scroll
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

      // Reiniciar animación de convergencia de estrellas
      isInitialEntrance = true;
      entranceStartTime = performance.now();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Bucle de renderizado a 60 FPS
  function render(time) {
    // 1. Animación de convergencia inicial al abrir la web
    if (isInitialEntrance) {
      const elapsed = time - entranceStartTime;
      const p = Math.min(1, elapsed / ENTRANCE_DURATION);
      // Easing cúbico de desaceleración suave
      assembleT = 1 - Math.pow(1 - p, 3);
      if (p >= 1) isInitialEntrance = false;
    } else {
      assembleT = 1;
    }

    // 2. Amortiguación de deformación por scroll
    currentScrollFrac += (scrollFrac - currentScrollFrac) * 0.08;
    // Factor de formación efectivo: converge al abrir, se dispersa al hacer scroll
    const formationFactor = Math.max(0, assembleT * (1 - currentScrollFrac));

    // 3. Suavizado de inclinación 3D
    currentTiltX += (targetTiltX - currentTiltX) * 0.05;
    currentTiltY += (targetTiltY - currentTiltY) * 0.05;
    globalAngle += 0.0016;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    // El centro del astro se sitúa en la parte media del hero inicial
    const cy = height * 0.44;

    ctx.globalCompositeOperation = 'lighter';

    // 4. Dibujar estrellas del fondo profundo (visibles en toda la página)
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
    const cosX = Math.cos(0.32 + currentTiltX);
    const sinX = Math.sin(0.32 + currentTiltX);
    const cosY = Math.cos(currentTiltY);
    const sinY = Math.sin(currentTiltY);

    // 5. Nebulosa y resplandor central (se desvanece suavemente al hacer scroll)
    if (formationFactor > 0.04) {
      const haloR = Math.min(width, height) * 0.48 * formationFactor;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      glow.addColorStop(0, 'rgba(255, 255, 255, ' + (0.24 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.22, 'rgba(200, 235, 255, ' + (0.14 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.55, 'rgba(56, 189, 248, ' + (0.05 * formationFactor).toFixed(2) + ')');
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

      const px3d = lx * cosY - lz * sinY;
      const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX;
      const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX;

      const scale = 1 / (1 + pz3d / 1200);
      const px = cx + px3d * scale;
      const py = cy + py3d * scale;

      const twinkle = Math.sin(time * sp.twinkleSpeed + sp.twinklePhase) * 0.3 + 0.7;
      const alpha = sp.alpha * twinkle * Math.max(0.2, scale);

      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = "rgba(" + sp.color.r + "," + sp.color.g + "," + sp.color.b + "," + alpha.toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(px, py, sp.size * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 7. Partículas de la constelación TIANCODE
    // Convergen en TIANCODE cuando formationFactor = 1; se dispersan al espacio cuando formationFactor = 0
    for (let i = 0; i < constellationStars.length; i++) {
      const p = constellationStars[i];

      // Respiración viva
      const driftX = Math.cos(time * p.driftSpeed + p.driftPhase) * p.driftRadius;
      const driftY = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftRadius;

      // Interpolación entre posición de dispersión y posición formada de TIANCODE
      const lx = (p.sx + (p.tx - p.sx) * formationFactor) + (driftX * formationFactor);
      const ly = (p.sy + (p.ty - p.sy) * formationFactor) + (driftY * formationFactor);
      const lz = p.sz + (p.tz - p.sz) * formationFactor;

      const px3d = lx * cosY - lz * sinY;
      const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX;
      const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX;

      const scale = 1 / (1 + pz3d / 1000);
      const px = cx + px3d * scale;
      const py = cy + py3d * scale;

      const twinkle = Math.sin(time * p.twinkleSpeed + p.twinklePhase) * 0.28 + 0.72;
      const alpha = p.baseAlpha * twinkle;

      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = "rgba(" + p.color.r + "," + p.color.g + "," + p.color.b + "," + Math.min(1, alpha).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, p.size * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 8. Destellos en cruz (+) en los vértices de TIANCODE (visibles cuando la palabra está formada)
    if (formationFactor > 0.35) {
      for (let i = 0; i < heroSpikes.length; i++) {
        const h = heroSpikes[i];
        const p = h.particle;

        const lx = p.sx + (p.tx - p.sx) * formationFactor;
        const ly = p.sy + (p.ty - p.sy) * formationFactor;
        const lz = p.sz + (p.tz - p.sz) * formationFactor;

        const px3d = lx * cosY - lz * sinY;
        const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX;
        const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX;

        const scale = 1 / (1 + pz3d / 1000);
        const px = cx + px3d * scale;
        const py = cy + py3d * scale;

        const twinkle = Math.sin(time * 0.018 + i * 1.5) * 0.35 + 0.75;
        const spikeLen = h.spikeLen * scale * twinkle * formationFactor;
        const alpha = (0.85 * twinkle * formationFactor).toFixed(2);

        if (px >= 10 && px <= width - 10 && py >= 10 && py <= height - 10) {
          ctx.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
          ctx.beginPath();
          ctx.arc(px, py, p.size * scale * 1.3, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(255, 255, 255, " + (alpha * 0.75).toFixed(2) + ")";
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.moveTo(px - spikeLen, py);
          ctx.lineTo(px + spikeLen, py);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(px, py - spikeLen);
          ctx.lineTo(px, py + spikeLen);
          ctx.stroke();
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);
}
