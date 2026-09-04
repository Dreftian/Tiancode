/* ============================================================
   Tiancode — Cosmic Intelligence Galaxy (Astra 6 Model Visualizer)
   Simulación procedural en Canvas 2D optimizada a 60 FPS:
   - Núcleo galáctico hiperbrillante con corona estelar
   - Brazos espirales logarítmicos tridimensionales
   - Estrellas de diversas temperaturas con destellos de difracción (+)
   - Campo estelar profundo con titileo
   - Inclinación y rotación 3D con paralaje del cursor
   - Botón de repetición / impulso estelar (↻)
   ============================================================ */

export function initGalaxy() {
  const canvas = document.getElementById('cosmic-galaxy-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const container = canvas.parentElement;
  const replayBtn = document.getElementById('cosmic-replay-btn');

  let width = 0;
  let height = 0;
  let dpr = 1;

  // Parámetros de la galaxia
  const NUM_STARS = 2800;
  const NUM_BG_STARS = 280;
  const NUM_HERO_STARS = 16;
  const ARMS = 2;
  const ARM_SPREAD = 0.55;
  const ROTATION_SPEED_BASE = 0.0022;

  let rotationAngle = 0;
  let rotationSpeed = ROTATION_SPEED_BASE;
  let targetRotationSpeed = ROTATION_SPEED_BASE;
  let isAccelerating = false;

  // Interacción del ratón para inclinación 3D
  let tiltX = 0;
  let tiltY = 0;
  let targetTiltX = 0;
  let targetTiltY = 0;

  // Control de visibilidad
  let isVisible = true;
  let animId = null;

  // Paleta de colores cósmicos
  const COLOR_PALETTE = [
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 255, b: 255 },
    { r: 195, g: 230, b: 255 },
    { r: 165, g: 215, b: 255 },
    { r: 254, g: 215, b: 170 },
    { r: 251, g: 191, b: 36 }
  ];

  const stars = [];
  const bgStars = [];
  const heroStars = [];

  function generateStars() {
    stars.length = 0;
    bgStars.length = 0;
    heroStars.length = 0;

    // 1. Estrellas de fondo lejanas
    for (let i = 0; i < NUM_BG_STARS; i++) {
      bgStars.push({
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 2.2,
        size: Math.random() * 1.3 + 0.3,
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
        color: COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
      });
    }

    // 2. Estrellas espirales de la galaxia
    for (let i = 0; i < NUM_STARS; i++) {
      const r = Math.pow(Math.random(), 1.8);
      const armIndex = i % ARMS;
      const armOffset = (armIndex * (2 * Math.PI)) / ARMS;
      const theta = r * 3.8 + armOffset;

      const spread = (Math.random() - 0.5) * ARM_SPREAD * (0.2 + r * 0.8);
      const angle = theta + spread;

      const diskThickness = Math.max(0.04, (1 - r) * 0.25);
      const z = (Math.random() - 0.5) * diskThickness;

      const size = Math.random() < 0.85 ? Math.random() * 1.4 + 0.4 : Math.random() * 2.4 + 1.2;
      const alpha = Math.random() * 0.6 + 0.4;
      const color = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];

      stars.push({
        r,
        baseAngle: angle,
        z,
        size,
        baseAlpha: alpha,
        alpha,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
        color
      });
    }

    // 3. Estrellas Hero con destellos de difracción en cruz (+)
    for (let i = 0; i < NUM_HERO_STARS; i++) {
      const armIndex = i % ARMS;
      const armOffset = (armIndex * (2 * Math.PI)) / ARMS;
      const r = 0.25 + Math.random() * 0.55;
      const theta = r * 3.8 + armOffset + (Math.random() - 0.5) * 0.25;

      heroStars.push({
        r,
        baseAngle: theta,
        z: (Math.random() - 0.5) * 0.08,
        size: Math.random() * 2.2 + 2.0,
        spikeLength: Math.random() * 14 + 16,
        alpha: Math.random() * 0.3 + 0.7,
        color: i % 3 === 0 ? { r: 254, g: 215, b: 170 } : { r: 220, g: 240, b: 255 }
      });
    }
  }

  function resize() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    width = rect.width || window.innerWidth;
    height = rect.height || 620;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  generateStars();

  if (container) {
    container.addEventListener('mousemove', function (e) {
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetTiltX = ny * 0.18;
      targetTiltY = -nx * 0.22;
    });

    container.addEventListener('mouseleave', function () {
      targetTiltX = 0;
      targetTiltY = 0;
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', function () {
      triggerReplayPulse();
    });
  }

  function triggerReplayPulse() {
    if (replayBtn) {
      replayBtn.classList.add('is-spinning');
      setTimeout(() => replayBtn.classList.remove('is-spinning'), 800);
    }
    targetRotationSpeed = ROTATION_SPEED_BASE * 4.5;
    isAccelerating = true;
    setTimeout(() => {
      targetRotationSpeed = ROTATION_SPEED_BASE;
      isAccelerating = false;
    }, 1200);
  }

  function render(time) {
    if (!isVisible) {
      animId = requestAnimationFrame(render);
      return;
    }

    tiltX += (targetTiltX - tiltX) * 0.05;
    tiltY += (targetTiltY - tiltY) * 0.05;
    rotationSpeed += (targetRotationSpeed - rotationSpeed) * 0.04;
    rotationAngle += rotationSpeed;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.min(width, height) * 0.44;

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bgStars.length; i++) {
      const bg = bgStars[i];
      const twinkle = Math.sin(time * bg.twinkleSpeed + bg.twinklePhase) * 0.35 + 0.65;
      const alpha = bg.alpha * twinkle;

      const px = cx + bg.x * (width * 0.52);
      const py = cy + bg.y * (height * 0.52);

      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = "rgba(" + bg.color.r + "," + bg.color.g + "," + bg.color.b + "," + alpha + ")";
        ctx.beginPath();
        ctx.arc(px, py, bg.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const basePitch = 0.48 + tiltX;
    const yaw = tiltY;

    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 0.42);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    coreGrad.addColorStop(0.08, 'rgba(255, 248, 220, 0.75)');
    coreGrad.addColorStop(0.22, 'rgba(215, 235, 255, 0.35)');
    coreGrad.addColorStop(0.5, 'rgba(147, 197, 253, 0.12)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Math.cos(basePitch));
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, maxRadius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const currentAngle = s.baseAngle + rotationAngle;
      const radius = s.r * maxRadius;

      const lx = Math.cos(currentAngle) * radius;
      const ly = Math.sin(currentAngle) * radius;
      const lz = s.z * maxRadius;

      const cosP = Math.cos(basePitch);
      const sinP = Math.sin(basePitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      const projX = lx * cosY - lz * sinY;
      const tempY = ly * cosP - (lx * sinY + lz * cosY) * sinP;
      const depth = ly * sinP + (lx * sinY + lz * cosY) * cosP;

      const scale = 1 / (1 + depth / 1200);
      const px = cx + projX * scale;
      const py = cy + tempY * scale;

      const twinkle = Math.sin(time * s.twinkleSpeed + s.twinklePhase) * 0.25 + 0.75;
      const alpha = s.alpha * twinkle * (0.4 + (1 - depth / 800) * 0.6);

      if (alpha > 0.05 && px >= -20 && px <= width + 20 && py >= -20 && py <= height + 20) {
        ctx.fillStyle = "rgba(" + s.color.r + "," + s.color.g + "," + s.color.b + "," + Math.min(1, alpha) + ")";
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, s.size * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < heroStars.length; i++) {
      const h = heroStars[i];
      const currentAngle = h.baseAngle + rotationAngle;
      const radius = h.r * maxRadius;

      const lx = Math.cos(currentAngle) * radius;
      const ly = Math.sin(currentAngle) * radius;
      const lz = h.z * maxRadius;

      const cosP = Math.cos(basePitch);
      const sinP = Math.sin(basePitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      const projX = lx * cosY - lz * sinY;
      const tempY = ly * cosP - (lx * sinY + lz * cosY) * sinP;
      const depth = ly * sinP + (lx * sinY + lz * cosY) * cosP;

      const scale = 1 / (1 + depth / 1200);
      const px = cx + projX * scale;
      const py = cy + tempY * scale;

      const twinkle = Math.sin(time * 0.015 + i * 1.3) * 0.3 + 0.85;
      const alpha = h.alpha * twinkle;

      if (px >= 10 && px <= width - 10 && py >= 10 && py <= height - 10) {
        ctx.fillStyle = "rgba(" + h.color.r + "," + h.color.g + "," + h.color.b + "," + (alpha * 0.9) + ")";
        ctx.beginPath();
        ctx.arc(px, py, h.size * scale, 0, Math.PI * 2);
        ctx.fill();

        const spikeLen = h.spikeLength * scale * twinkle;
        ctx.strokeStyle = "rgba(" + h.color.r + "," + h.color.g + "," + h.color.b + "," + (alpha * 0.6) + ")";
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

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
      });
    }, { threshold: 0.05 });
    observer.observe(container);
  }

  animId = requestAnimationFrame(render);
}
