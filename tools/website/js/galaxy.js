/* ============================================================
   Tiancode — Cosmic Intelligence Galaxy (Astra 6 Motion Model)
   Animación cósmica híbrida:
   - Render hiperrealista de la espiral estelar (Astra 6) en rotación continua
   - Campo estelar procedural con titileo en Canvas 2D
   - Paralaje e inclinación tridimensional con el cursor del ratón
   - Botón de repetición con impulso estelar de alta velocidad (↻)
   ============================================================ */

export function initGalaxy() {
  const motionContainer = document.getElementById('cosmic-galaxy-motion');
  const canvas = document.getElementById('cosmic-galaxy-canvas');
  const replayBtn = document.getElementById('cosmic-replay-btn');
  const stage = document.getElementById('galaxy-hero');

  if (!stage) return;

  // 1. Interacción del Botón de Repetición (↻)
  if (replayBtn && motionContainer) {
    replayBtn.addEventListener('click', function () {
      replayBtn.classList.add('is-spinning');
      motionContainer.classList.add('is-accelerating');

      setTimeout(() => {
        replayBtn.classList.remove('is-spinning');
        motionContainer.classList.remove('is-accelerating');
      }, 1500);
    });
  }

  // 2. Campo Estelar Procedural en Canvas
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let isVisible = true;
  let animId = null;

  // Inclinación 3D por movimiento del ratón
  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;

  const NUM_BG_STARS = 180;
  const bgStars = [];
  const PALETTE = [
    { r: 255, g: 255, b: 255 },
    { r: 215, g: 235, b: 255 },
    { r: 254, g: 215, b: 170 },
    { r: 165, g: 243, b: 252 }
  ];

  function initStars() {
    bgStars.length = 0;
    for (let i = 0; i < NUM_BG_STARS; i++) {
      bgStars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.5 + 0.4,
        alpha: Math.random() * 0.7 + 0.2,
        twinkleSpeed: Math.random() * 0.025 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)]
      });
    }
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = rect.width || window.innerWidth;
    height = rect.height || 640;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  initStars();

  // Seguimiento suave del ratón para inclinación 3D del modelo y las estrellas
  stage.addEventListener('mousemove', function (e) {
    const rect = stage.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    targetTiltX = ny * -12; // grados inclinación X
    targetTiltY = nx * 14;  // grados inclinación Y
  });

  stage.addEventListener('mouseleave', function () {
    targetTiltX = 0;
    targetTiltY = 0;
  });

  // Render loop
  function render(time) {
    if (!isVisible) {
      animId = requestAnimationFrame(render);
      return;
    }

    // Suavizado inercial de la inclinación 3D
    currentTiltX += (targetTiltX - currentTiltX) * 0.06;
    currentTiltY += (targetTiltY - currentTiltY) * 0.06;

    if (motionContainer) {
      motionContainer.style.transform = `perspective(1000px) rotateX(${currentTiltX.toFixed(2)}deg) rotateY(${currentTiltY.toFixed(2)}deg)`;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    // Dibujar estrellas titilantes de fondo
    for (let i = 0; i < bgStars.length; i++) {
      const s = bgStars[i];
      const twinkle = Math.sin(time * s.twinkleSpeed + s.twinklePhase) * 0.35 + 0.65;
      const alpha = s.alpha * twinkle;

      // Desplazamiento sutil por paralaje
      const px = s.x * width + (currentTiltY * 0.8);
      const py = s.y * height + (currentTiltX * 0.8);

      if (px >= 0 && px <= width && py >= 0 && py <= height) {
        ctx.fillStyle = `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    animId = requestAnimationFrame(render);
  }

  // Pausar si no está en pantalla
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
