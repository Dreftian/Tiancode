/* ============================================================
   Tiancode — Radiant Cosmic Astro & TIANCODE Constellation Engine
   Inspirado en la cinemática cósmica de OpenAI (GPT-6 Astra):
   - Fondo espacial continuo a pantalla completa (#000000)
   - Trazos vectoriales luminosos con ribbons de plasma estelar
   - Miles de partículas de alta luminosidad formando TIANCODE
   - Convergencia majestuosa al abrir la página web
   - Dispersión y deformación suave hacia el espacio profundo al hacer scroll
   - Re-ensamblado automático al regresar a la parte superior
   - Destellos de difracción en cruz (+) y rotación 3D reactiva al cursor
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
  const ENTRANCE_DURATION = 2000; // ms

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
    { r: 255, g: 255, b: 255 }, // Blanco diamante estelar
    { r: 255, g: 255, b: 255 },
    { r: 215, g: 240, b: 255 }, // Azul/Cian celestial
    { r: 165, g: 243, b: 252 },
    { r: 254, g: 215, b: 170 }, // Dorado suave
    { r: 251, g: 191, b: 36 }
  ];

  // Geometría vectorial de TIANCODE
  const word = 'TIANCODE';
  const letterW = 88;
  const letterH = 130;
  const gap = 26;
  const totalW = word.length * letterW + (word.length - 1) * gap;
  const startX = -totalW / 2;

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

    // 2. Escala de TIANCODE para ajustarse armónicamente
    const maxTargetW = Math.min(width * 0.88, 1150);
    const textScale = maxTargetW / totalW;

    // Generar partículas densas sobre las líneas y arcos
    constellationStars.length = 0;
    const starSpacing = 7; // píxeles entre estrellas a lo largo de cada trazo

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

        // Estrella principal
        createConstellationStar(px, py, textScale, true);

        // Polvo estelar y estrellas de soporte para darle volumen y grosor
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

    function createConstellationStar(rawX, rawY, scale, isCore) {
      const tx = rawX * scale;
      const ty = rawY * scale;
      const tz = (Math.random() - 0.5) * 30;

      // Posición de dispersión en el espacio exterior
      const scatterAngle = Math.random() * Math.PI * 2;
      const scatterDist = Math.random() * Math.min(width, height) * 0.95 + 240;
      const sx = Math.cos(scatterAngle) * scatterDist;
      const sy = Math.sin(scatterAngle) * scatterDist;
      const sz = (Math.random() - 0.5) * 480;

      const size = isCore
        ? (Math.random() < 0.28 ? Math.random() * 2.2 + 2.8 : Math.random() * 1.5 + 1.8)
        : (Math.random() * 1.4 + 1.0);

      constellationStars.push({
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
      });
    }

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

    // 4. Estrellas Hero con destellos en cruz (+)
    heroSpikes.length = 0;
    const coreStars = constellationStars.filter(s => s.isCore);
    const stepHero = Math.max(1, Math.floor(coreStars.length / 24));
    for (let i = 0; i < coreStars.length; i += stepHero) {
      heroSpikes.push({
        particle: coreStars[i],
        spikeLen: Math.random() * 16 + 16,
        color: { r: 255, g: 255, b: 255 }
      });
    }
  }

  window.addEventListener('resize', resizeAndInit, { passive: true });
  resizeAndInit();

  // Escuchar Scroll: TIANCODE se desforma cuando el usuario baja
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

      // Reiniciar animación de convergencia de estrellas
      isInitialEntrance = true;
      entranceStartTime = performance.now();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Proyección 3D de un punto
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
    // Factor de formación efectivo: converge al abrir, se dispersa al hacer scroll
    const formationFactor = Math.max(0, assembleT * (1 - currentScrollFrac));

    // 3. Suavizado de inclinación 3D
    currentTiltX += (targetTiltX - currentTiltX) * 0.05;
    currentTiltY += (targetTiltY - currentTiltY) * 0.05;
    globalAngle += 0.0016;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    // El centro del astro se sitúa en la parte media-alta del hero inicial
    const cy = height * 0.44;
    const maxTargetW = Math.min(width * 0.88, 1150);
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
    const cosX = Math.cos(0.28 + currentTiltX);
    const sinX = Math.sin(0.28 + currentTiltX);
    const cosY = Math.cos(currentTiltY);
    const sinY = Math.sin(currentTiltY);

    // 5. Nebulosa y resplandor central
    if (formationFactor > 0.04) {
      const haloR = Math.min(width, height) * 0.52 * formationFactor;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      glow.addColorStop(0, 'rgba(255, 255, 255, ' + (0.28 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.2, 'rgba(165, 243, 252, ' + (0.16 * formationFactor).toFixed(2) + ')');
      glow.addColorStop(0.5, 'rgba(56, 189, 248, ' + (0.06 * formationFactor).toFixed(2) + ')');
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

    // 7. TRAZOS VECTORIALES LUMINOSOS DE TIANCODE (Ribbons celestiales radiantes)
    // Se dibujan con brillo cuando la palabra está formada para darle total legibilidad e impacto
    if (formationFactor > 0.05) {
      const ribbonAlpha = Math.pow(formationFactor, 2);

      function drawProjectedLine(lx1, ly1, lx2, ly2) {
        const p1 = projectPoint(lx1 * textScale, ly1 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY);
        const p2 = projectPoint(lx2 * textScale, ly2 * textScale, 0, cx, cy, cosX, sinX, cosY, sinY);

        // Capa 1: Halo exterior cian/azul
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.28 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 14 * p1.scale;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Capa 2: Resplandor medio
        ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.5 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 6 * p1.scale;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Capa 3: Núcleo blanco diamante
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

        // Capa 1: Halo exterior
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.28 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 14 * pts[0].scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Capa 2: Resplandor medio
        ctx.strokeStyle = 'rgba(186, 230, 253, ' + (0.5 * ribbonAlpha).toFixed(2) + ')';
        ctx.lineWidth = 6 * pts[0].scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Capa 3: Núcleo blanco diamante
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

    // 8. Partículas de la constelación TIANCODE
    for (let i = 0; i < constellationStars.length; i++) {
      const p = constellationStars[i];

      // Respiración viva
      const driftX = Math.cos(time * p.driftSpeed + p.driftPhase) * p.driftRadius;
      const driftY = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftRadius;

      // Interpolación entre posición de dispersión y posición formada de TIANCODE
      const lx = (p.sx + (p.tx - p.sx) * formationFactor) + (driftX * formationFactor);
      const ly = (p.sy + (p.ty - p.sy) * formationFactor) + (driftY * formationFactor);
      const lz = p.sz + (p.tz - p.sz) * formationFactor;

      const pt = projectPoint(lx, ly, lz, cx, cy, cosX, sinX, cosY, sinY);
      const twinkle = Math.sin(time * p.twinkleSpeed + p.twinklePhase) * 0.28 + 0.72;
      const alpha = p.baseAlpha * twinkle;

      if (pt.x >= 0 && pt.x <= width && pt.y >= 0 && pt.y <= height) {
        // Halo suave exterior
        ctx.fillStyle = "rgba(" + p.color.r + "," + p.color.g + "," + p.color.b + "," + (alpha * 0.45).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1.0, (p.size + 1.8) * pt.scale), 0, Math.PI * 2);
        ctx.fill();

        // Núcleo brillante
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
