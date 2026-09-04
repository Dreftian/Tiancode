/* ============================================================
   Tiancode — Natural Cosmic Astro & Constellation Engine
   Inspirado en el escenario de partículas de OpenAI:
   - Fondo espacial natural 100% integrado (sin recortes ni bordes)
   - Miles de partículas estelares formando el astro con las letras TIANCODE
   - Brazos espirales cósmicos envolventes en rotación 3D continua
   - Estrellas de difracción en cruz (+) en los vértices del astro
   - Campo estelar profundo y respiración orgánica
   - Interacción de inclinación 3D con el cursor y pulso de supernova (↻)
   ============================================================ */

export function initGalaxy() {
  const canvas = document.getElementById('cosmic-galaxy-canvas');
  const stage = document.getElementById('galaxy-hero');
  const replayBtn = document.getElementById('cosmic-replay-btn');

  if (!canvas || !stage) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let isVisible = true;
  let animId = null;

  // Modos y animación
  let isSupernova = false;
  let supernovaProgress = 0;
  let globalAngle = 0;

  // Inclinación 3D por movimiento del ratón
  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;

  // Paleta de temperaturas estelares
  const STAR_COLORS = [
    { r: 255, g: 255, b: 255 }, // Blanco diamante (65%)
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 255, b: 255 },
    { r: 200, g: 235, b: 255 }, // Azul/Cian estelar (20%)
    { r: 165, g: 243, b: 252 },
    { r: 254, g: 215, b: 170 }, // Ámbar/Dorado cálido (15%)
    { r: 251, g: 191, b: 36 }
  ];

  // Colecciones de partículas
  const constellationParticles = [];
  const spiralParticles = [];
  const bgStars = [];
  const heroSpikeStars = [];

  // Muestrear puntos que forman el texto "TIANCODE"
  function sampleTextCoordinates(text, targetWidth, targetHeight) {
    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return [];

    const scale = 2;
    offscreen.width = Math.floor(targetWidth * scale);
    offscreen.height = Math.floor(targetHeight * scale);

    offCtx.scale(scale, scale);
    offCtx.fillStyle = '#ffffff';
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';

    // Tipografía proporcional al ancho del contenedor
    const fontSize = Math.min(targetWidth * 0.12, targetHeight * 0.28, 120);
    offCtx.font = "800 " + fontSize + "px 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    // Si el navegador soporta letterSpacing
    try {
      offCtx.letterSpacing = (fontSize * 0.08) + 'px';
    } catch (e) {}

    offCtx.fillText(text, targetWidth / 2, targetHeight / 2);

    const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data;
    const rawPoints = [];
    const step = 4; // Densidad de muestreo de partículas

    for (let y = 0; y < offscreen.height; y += step) {
      for (let x = 0; x < offscreen.width; x += step) {
        const idx = (y * offscreen.width + x) * 4;
        const alpha = imgData[idx + 3];
        if (alpha > 128) {
          rawPoints.push({
            x: (x / scale) - targetWidth / 2,
            y: (y / scale) - targetHeight / 2,
            brightness: alpha / 255
          });
        }
      }
    }

    return rawPoints;
  }

  function initScene() {
    const rect = stage.getBoundingClientRect();
    width = rect.width || window.innerWidth;
    height = rect.height || 680;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);

    // 1. Estrellas de fondo profundo
    bgStars.length = 0;
    const NUM_BG = Math.floor(width * 0.22);
    for (let i = 0; i < NUM_BG; i++) {
      bgStars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.006,
        twinklePhase: Math.random() * Math.PI * 2,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
      });
    }

    // 2. Muestrear los puntos de la constelación "TIANCODE"
    const textPoints = sampleTextCoordinates('TIANCODE', width, height);

    constellationParticles.length = 0;
    for (let i = 0; i < textPoints.length; i++) {
      const pt = textPoints[i];
      const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
      const size = Math.random() < 0.8 ? Math.random() * 1.5 + 0.6 : Math.random() * 2.8 + 1.2;

      // Posición inicial de dispersión o galaxia
      const scatterAngle = Math.random() * Math.PI * 2;
      const scatterDist = Math.random() * Math.min(width, height) * 0.8;

      constellationParticles.push({
        // Destino en las letras de TIANCODE
        targetX: pt.x,
        targetY: pt.y,
        targetZ: (Math.random() - 0.5) * 40,

        // Coordenadas actuales
        x: pt.x,
        y: pt.y,
        z: (Math.random() - 0.5) * 40,

        // Coordenadas de dispersión para el modo supernova
        scatterX: Math.cos(scatterAngle) * scatterDist,
        scatterY: Math.sin(scatterAngle) * scatterDist,
        scatterZ: (Math.random() - 0.5) * 300,

        size,
        baseAlpha: Math.random() * 0.4 + 0.6,
        color,
        twinkleSpeed: Math.random() * 0.03 + 0.015,
        twinklePhase: Math.random() * Math.PI * 2,
        driftPhase: Math.random() * Math.PI * 2,
        driftSpeed: Math.random() * 0.02 + 0.01,
        driftRadius: Math.random() * 1.8 + 0.4
      });
    }

    // 3. Brazos espirales cósmicos (el astro que envuelve y orbita a TIANCODE)
    spiralParticles.length = 0;
    const NUM_SPIRAL = 1200;
    const ARMS = 2;
    const maxRadius = Math.min(width, height) * 0.58;

    for (let i = 0; i < NUM_SPIRAL; i++) {
      const r = Math.pow(Math.random(), 1.6);
      const arm = i % ARMS;
      const offset = (arm * 2 * Math.PI) / ARMS;
      const theta = r * 4.2 + offset;
      const spread = (Math.random() - 0.5) * 0.5 * (0.3 + r * 0.7);
      const angle = theta + spread;

      spiralParticles.push({
        radius: r * maxRadius,
        baseAngle: angle,
        z: (Math.random() - 0.5) * (0.2 + (1 - r) * 0.4) * maxRadius * 0.25,
        size: Math.random() * 1.6 + 0.5,
        alpha: Math.random() * 0.5 + 0.35,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2
      });
    }

    // 4. Estrellas Hero con destellos de difracción en cruz (+)
    heroSpikeStars.length = 0;
    const stepHero = Math.max(1, Math.floor(constellationParticles.length / 16));
    for (let i = 0; i < constellationParticles.length; i += stepHero) {
      const p = constellationParticles[i];
      heroSpikeStars.push({
        particle: p,
        spikeLength: Math.random() * 12 + 14,
        color: Math.random() < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 200, g: 240, b: 255 }
      });
    }
  }

  // Escuchar redimensionamiento
  window.addEventListener('resize', initScene, { passive: true });
  initScene();

  // Seguimiento suave del ratón para inclinación 3D del espacio
  stage.addEventListener('mousemove', function (e) {
    const rect = stage.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    targetTiltX = ny * -0.16; // inclinación vertical
    targetTiltY = nx * 0.20;  // inclinación horizontal
  });

  stage.addEventListener('mouseleave', function () {
    targetTiltX = 0;
    targetTiltY = 0;
  });

  // Botón de repetición / impulso supernova (↻)
  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      triggerSupernova();
    });
  }

  function triggerSupernova() {
    if (replayBtn) {
      replayBtn.classList.add('is-spinning');
      setTimeout(() => replayBtn.classList.remove('is-spinning'), 800);
    }
    isSupernova = true;
    supernovaProgress = 0;
  }

  // Render loop continuo
  function render(time) {
    if (!isVisible) {
      animId = requestAnimationFrame(render);
      return;
    }

    // Amortiguación de inclinación 3D
    currentTiltX += (targetTiltX - currentTiltX) * 0.05;
    currentTiltY += (targetTiltY - currentTiltY) * 0.05;
    globalAngle += 0.0018;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Control de pulso supernova al pulsar replay
    let animProgress = 0;
    if (isSupernova) {
      supernovaProgress += 0.024;
      if (supernovaProgress >= 1) {
        isSupernova = false;
        supernovaProgress = 0;
      } else {
        // Dispersión suave y reconvergencia gravitacional
        animProgress = Math.sin(supernovaProgress * Math.PI);
      }
    }

    ctx.globalCompositeOperation = 'lighter';

    // 1. Dibujar estrellas de fondo profundo
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
    const cosX = Math.cos(0.35 + currentTiltX);
    const sinX = Math.sin(0.35 + currentTiltX);
    const cosY = Math.cos(currentTiltY);
    const sinY = Math.sin(currentTiltY);

    // 2. Resplandor y halo central del astro (Nebulosa de fondo)
    const haloRadius = Math.min(width, height) * 0.45;
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloRadius);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
    glowGrad.addColorStop(0.18, 'rgba(215, 235, 255, 0.10)');
    glowGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.04)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Renderizar los brazos espirales cósmicos que envuelven el astro
    for (let i = 0; i < spiralParticles.length; i++) {
      const sp = spiralParticles[i];
      const curAngle = sp.baseAngle + globalAngle * 1.4;

      const lx = Math.cos(curAngle) * sp.radius;
      const ly = Math.sin(curAngle) * sp.radius;
      const lz = sp.z;

      // Proyección 3D
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

    // 4. Renderizar las partículas que forman las letras de "TIANCODE"
    for (let i = 0; i < constellationParticles.length; i++) {
      const p = constellationParticles[i];

      // Respiración y micro-órbita viva de cada estrella dentro de su letra
      const driftX = Math.cos(time * p.driftSpeed + p.driftPhase) * p.driftRadius;
      const driftY = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftRadius;

      // Interpolación si hay pulso supernova
      let lx = p.targetX + driftX;
      let ly = p.targetY + driftY;
      let lz = p.targetZ;

      if (animProgress > 0) {
        lx += (p.scatterX - p.targetX) * animProgress;
        ly += (p.scatterY - p.targetY) * animProgress;
        lz += (p.scatterZ - p.targetZ) * animProgress;
      }

      // Proyección 3D
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

    // 5. Renderizar destellos de difracción en cruz (+) sobre estrellas principales del astro
    for (let i = 0; i < heroSpikeStars.length; i++) {
      const h = heroSpikeStars[i];
      const p = h.particle;

      const lx = p.targetX;
      const ly = p.targetY;
      const lz = p.targetZ;

      const px3d = lx * cosY - lz * sinY;
      const py3d = ly * cosX - (lx * sinY + lz * cosY) * sinX;
      const pz3d = ly * sinX + (lx * sinY + lz * cosY) * cosX;

      const scale = 1 / (1 + pz3d / 1000);
      const px = cx + px3d * scale;
      const py = cy + py3d * scale;

      const twinkle = Math.sin(time * 0.016 + i * 1.4) * 0.35 + 0.75;
      const spikeLen = h.spikeLength * scale * twinkle;
      const alpha = (0.75 * twinkle).toFixed(2);

      if (px >= 20 && px <= width - 20 && py >= 20 && py <= height - 20) {
        // Halo central
        ctx.fillStyle = "rgba(" + h.color.r + "," + h.color.g + "," + h.color.b + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(px, py, p.size * scale * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Cruz (+)
        ctx.strokeStyle = "rgba(" + h.color.r + "," + h.color.g + "," + h.color.b + "," + (alpha * 0.7).toFixed(2) + ")";
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

    ctx.globalCompositeOperation = 'source-over';
    animId = requestAnimationFrame(render);
  }

  // Pausar render cuando está fuera de la pantalla
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.05 });
    observer.observe(stage);
  }

  animId = requestAnimationFrame(render);
}
