/* ============================================================
   Tiancode — Website main
   Punto de entrada: inicia todos los módulos y las
   interacciones del header (tema, idioma, menú móvil y
   menú desplegable de recursos).
   ============================================================ */

import { initTheme } from './theme.js';
import { applyLang, initI18n } from './i18n.js';
import { initRouter, closeDropdown } from './router.js';
import { initAnimations } from './animations.js';
import { initCharts } from './charts.js';
import { initFaq } from './faq.js';
import { initGalaxy } from './galaxy.js';

/* ---------- Inicialización de módulos ---------- */
initTheme();
initRouter();
initGalaxy();
applyLang(); // aplica el idioma guardado y sincroniza título/gráficas
initI18n();
initAnimations();
initCharts();
initFaq();

/* ---------- Menú móvil ---------- */
const navToggle = document.getElementById('nav-toggle');
const header = document.querySelector('.site-header');

if (navToggle && header) {
  navToggle.addEventListener('click', function () {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.querySelectorAll('.main-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      header.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ---------- Menú desplegable de recursos ---------- */
const navDropdown = document.querySelector('.nav-dropdown');
const navDropdownToggle = navDropdown ? navDropdown.querySelector('.nav-dropdown-toggle') : null;

if (navDropdownToggle) {
  navDropdownToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    const open = navDropdown.classList.toggle('is-open');
    navDropdownToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
document.addEventListener('click', function (e) {
  if (navDropdown && !navDropdown.contains(e.target)) closeDropdown();
});

/* ---------- Scrollspy: resalta la sección activa en el nav ---------- */
const spySections = document.querySelectorAll('main section[id]');
const spyLinks = document.querySelectorAll('.main-nav a[href^="#"]');
if ('IntersectionObserver' in window && spySections.length && spyLinks.length) {
  const spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      spyLinks.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  spySections.forEach(function (section) { spy.observe(section); });
}

/* ---------- Copiar comando de instalación rápida en Hero ---------- */
const heroCmd = document.getElementById('hero-cmd-box');
if (heroCmd) {
  heroCmd.addEventListener('click', function () {
    const textToCopy = 'winget install Dreftian.Tiancode';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy);
    }
    heroCmd.classList.add('is-copied');
    setTimeout(function () {
      heroCmd.classList.remove('is-copied');
    }, 2200);
  });
}

/* ---------- Studio Interactivo / Showcase Tabs Switcher ---------- */
const showcaseTabBtns = document.querySelectorAll('.showcase-tab-btn');
const showcasePanels = document.querySelectorAll('.showcase-panel');

if (showcaseTabBtns.length && showcasePanels.length) {
  showcaseTabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const targetId = btn.getAttribute('data-target-panel');
      showcaseTabBtns.forEach(function (b) { b.classList.remove('is-active'); });
      showcasePanels.forEach(function (p) { p.classList.remove('is-active'); });
      btn.classList.add('is-active');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('is-active');
    });
  });
}

/* ============================================================
   Detalles Interactivos de Características (Modal / Drawer)
   ============================================================ */
const FEATURES_INFO = {
  agents: {
    category: 'Arquitectura Core',
    title: 'Agentes de IA & Sub-Agentes Autónomos',
    desc: 'Tiancode ejecuta múltiples agentes en paralelo con orquestación por eventos, memoria de contexto persistente y auto-reparación de tipos y sintaxis en tiempo real.',
    codeTitle: 'CLI / Invocación de Agente',
    code: '$ tiancode --agent senior-dev --stream "Refactoriza el módulo de autenticación"',
    chips: ['AST Multi-archivo', 'Memoria durable', 'Detección de vulnerabilidades', 'TDD Loop']
  },
  models: {
    category: 'Modelos Locales',
    title: 'Modelos GGUF & LM Studio Hub',
    desc: 'Descarga y corre modelos open-source como Qwen 2.5 Coder, DeepSeek y Llama 3.3 en tu propia GPU sin conexión a internet ni consumo de saldo en la nube.',
    codeTitle: 'llama-server / Cuantizaciones',
    code: 'llama-server --model qwen2.5-coder-32b.Q4_K_M.gguf --ngl 33 --threads 8',
    chips: ['Cuantizaciones Q4_K_M y Q8_0', '100% GPU Offload', 'Hasta 68 tok/s', 'Sin telemetría']
  },
  github: {
    category: 'Control de Versiones',
    title: 'GitHub Nativo & Git Worktrees',
    desc: 'Gestiona repositorios, branches aisladas en worktrees temporales, staging, commits semánticos y sincronización de remotos sin salir del editor.',
    codeTitle: 'Git Worktrees Workflow',
    code: 'git worktree add -b feat/mcp-auth ../worktree-auth origin/dev',
    chips: ['OAuth GitHub', 'Commit Convencional', 'Push / Pull integrado', 'Worktrees aislados']
  },
  mcp: {
    category: 'Protocolo de Contexto',
    title: 'Servidores MCP & Google NotebookLM',
    desc: 'Conecta 15+ herramientas estándar de la industria: Playwright para scraping/testing web, Chrome DevTools CDP, Canva, Circle y Google NotebookLM.',
    codeTitle: 'Configuración MCP (tiancode.json)',
    code: '{\n  "mcpServers": {\n    "playwright": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-playwright"] },\n    "notebooklm": { "command": "uvx", "args": ["notebooklm-mcp"] }\n  }\n}',
    chips: ['Playwright', 'Chrome CDP', 'Google NotebookLM', 'Photoshop & Unity']
  },
  skills: {
    category: 'Metodología de Ingeniería',
    title: 'Catálogo de 52+ Skills de Ingeniería',
    desc: 'Flujos de trabajo estandarizados: Test-Driven Development, revisiones de código estático, auditorías de seguridad OWASP, optimización y planning.',
    codeTitle: 'Invocación de Skills',
    code: 'tiancode --skill test-driven-development --skill security-and-hardening',
    chips: ['TDD Red-Green', 'Auditoría OWASP', 'Performance', 'Git Worktrees']
  },
  providers: {
    category: 'Multi-Proveedor',
    title: 'Conexión Híbrida Cloud & Local',
    desc: 'Combina modelos locales GGUF con OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Google Gemini y proveedores compatibles con OpenAI API.',
    codeTitle: 'Configuración de Proveedores',
    code: '{\n  "providers": {\n    "openai": { "apiKey": "env:OPENAI_API_KEY" },\n    "anthropic": { "apiKey": "env:ANTHROPIC_API_KEY" },\n    "local": { "baseURL": "http://127.0.0.1:8080/v1" }\n  }\n}',
    chips: ['OpenAI', 'Claude 3.5 Sonnet', 'Gemini Pro', 'Localhost llama.cpp']
  },
  terminal: {
    category: 'Herramientas Integradas',
    title: 'Terminal Embebida & PTY Multiplexor',
    desc: 'Ejecuta comandos Bash, PowerShell o CMD en segundo plano con streaming en vivo, permisos de aprobación y multiplexación de sesiones.',
    codeTitle: 'Terminal interactiva',
    code: '$ bun run test:unit\n✓ 142 tests passed (412ms)',
    chips: ['PowerShell / CMD', 'Streaming en vivo', 'Control de permisos', 'Auto-recovery']
  },
  portable: {
    category: 'Distribución',
    title: 'Modo Portable Zero-Config',
    desc: 'Ejecuta Tiancode desde un pendrive o carpeta USB sin requerir privilegios de administrador ni modificar el registro del sistema de Windows.',
    codeTitle: 'Estructura Portable',
    code: 'D:\\Tiancode-portable.exe\nD:\\data\\settings.json\nD:\\data\\models\\',
    chips: ['Sin instalador', 'Sin permisos admin', 'Configuración en pendrive', '100% aislado']
  },
  more: {
    category: 'Productividad',
    title: 'Atajos de Teclado & Personalización',
    desc: 'Paleta de comandos rápida (Ctrl+K), atajos personalizables, selector de temas de alto contraste y ajustes finos para cada módulo.',
    codeTitle: 'Atajos Globales',
    code: 'Ctrl + K: Paleta de Comandos\nCtrl + P: Búsqueda rápida de archivos\nWin + Alt + T: Toggle Bandeja',
    chips: ['Paleta Ctrl+K', 'Tema Claro / Oscuro', 'Atajos Globales', 'Keybindings JSON']
  },
  plugins: {
    category: 'Ecosistema',
    title: 'Plugins NPM & Scripts de Automatización',
    desc: 'Instala extensiones directamente desde NPM: linter Biome, integración con Slack, API de Notion y protectores de entorno seguro.',
    codeTitle: 'Gestor de Plugins',
    code: '$ tiancode plugin add @biomejs/biome @octokit/rest env-guard',
    chips: ['Biome Linter', 'Octokit GitHub', 'Slack Web API', 'Env Guard']
  },
  subagents: {
    category: 'Multi-Agente',
    title: 'Orquestación de Sub-Agentes Especializados',
    desc: 'Crea subagentes con roles delimitados (Tester, Revisor, Diseñador), sistema de colores identificadores y control estricto de permisos de lectura/escritura.',
    codeTitle: 'Definición de Subagente',
    code: '{\n  "role": "Database Migrator",\n  "color": "indigo",\n  "tools": ["read_file", "run_sql"],\n  "deny": ["delete_table"]\n}',
    chips: ['8 colores', 'Permisos por herramienta', 'System prompt aislado', 'Concurrencia']
  },
  voice: {
    category: 'Voz Offline',
    title: 'Kokoro TTS & Dictado Whisper ONNX',
    desc: 'Síntesis de voz neural ultra-rápida y reconocimiento de voz 100% offline en 8 idiomas: español, inglés, francés, japonés, italiano, portugués, hindi y chino.',
    codeTitle: 'Llamada al Sintetizador',
    code: 'kokoro-tts --voice es_nicole --speed 1.05 "Tests completados exitosamente"',
    chips: ['100% Offline', 'Whisper ONNX <120ms', '8 idiomas soportados', 'Sin APIs externas']
  },
  tray: {
    category: 'Sistema Operativo',
    title: 'Bandeja del Sistema & Consumo Ultraligero',
    desc: 'Minimiza a la bandeja del sistema de Windows con consumo de memoria inferior a 18 MB y acceso instantáneo mediante atajo global configurable.',
    codeTitle: 'System Tray IPC',
    code: 'tray.setToolTip("Tiancode — 3 agentes activos");\ntray.on("click", () => win.show());',
    chips: ['< 18 MB RAM', 'Restauración instantánea', 'Notificaciones nativas', 'Atajo global']
  },
  onboarding: {
    category: 'Experiencia Inicial',
    title: 'Asistente de Onboarding Guiado',
    desc: 'Configuración inicial en 30 segundos: disclaimer ético de uso de IA, selector de tema claro/oscuro e idioma nativo antes del primer uso.',
    codeTitle: 'Configuración Inicial',
    code: '{\n  "locale": "es",\n  "theme": "dark",\n  "disclaimerAccepted": true\n}',
    chips: ['Selector de tema', 'Selector de idioma', 'Disclaimer responsable', 'Detección GPU']
  },
  identity: {
    category: 'Identidad Visual',
    title: 'Diseño Vectorial & Logo SVG',
    desc: 'Nueva identidad visual: robot icónico con 3 ojos y boca, optimizado con renderizado vectorial limpio tanto en fondo oscuro como claro.',
    codeTitle: 'Logo Vectorial',
    code: '<svg viewBox="0 0 256 256" class="tiancode-robot">...</svg>',
    chips: ['Vector SVG', 'Tema Dual', 'Iconografía moderna', 'Contraste WCAG AAA']
  }
};

const modal = document.getElementById('feature-modal');
const modalTitle = document.getElementById('modal-title');
const modalCategory = document.getElementById('modal-category');
const modalDesc = document.getElementById('modal-desc');
const modalCodeTitle = document.getElementById('modal-code-title');
const modalCodeContent = document.getElementById('modal-code-content');
const modalChips = document.getElementById('modal-chips');
const modalClose = document.getElementById('modal-close');

function openFeatureModal(featureId) {
  const data = FEATURES_INFO[featureId];
  if (!data || !modal) return;

  if (modalTitle) modalTitle.textContent = data.title;
  if (modalCategory) modalCategory.textContent = data.category;
  if (modalDesc) modalDesc.textContent = data.desc;
  if (modalCodeTitle) modalCodeTitle.textContent = data.codeTitle;
  if (modalCodeContent) modalCodeContent.textContent = data.code;

  if (modalChips) {
    modalChips.innerHTML = data.chips.map(function (c) {
      return '<span class="feature-modal-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' + c + '</span>';
    }).join('');
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeFeatureModal() {
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (modalClose) {
  modalClose.addEventListener('click', closeFeatureModal);
}
if (modal) {
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeFeatureModal();
  });
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
    closeFeatureModal();
  }
});

// Registrar click en todas las tarjetas de características
document.querySelectorAll('[data-feature-id]').forEach(function (card) {
  card.addEventListener('click', function (e) {
    // Si se hizo click en un enlace interno no abrir modal
    if (e.target.tagName === 'A' || e.target.closest('a')) return;
    const fId = card.getAttribute('data-feature-id');
    if (fId) openFeatureModal(fId);
  });
});

/* ============================================================
   Skills Inspector Interactivo (#skills)
   ============================================================ */
const SKILLS_INFO = {
  'Entrevistas de requisitos': {
    name: 'Entrevistas de Requisitos (Grill-Me)',
    desc: 'Formula preguntas dirigidas y clarifica casos de borde antes de escribir una sola línea de código, evitando retrabajos.',
    cmd: 'tiancode --skill grill-me --prompt "Diseña el flujo de autenticación con OAuth2"'
  },
  'Test-Driven Development (TDD)': {
    name: 'Test-Driven Development (TDD)',
    desc: 'Aplica el ciclo estricto Red-Green-Refactor escribiendo primero los tests fallidos antes de tocar el código de producción.',
    cmd: 'tiancode --skill test-driven-development --run "Crea suite de tests para SessionStore"'
  },
  'Code Review': {
    name: 'Code Review & Calidad Estática',
    desc: 'Inspecciona diffs en busca de code smells, tipados inseguros, redundancias y violaciones de Clean Code.',
    cmd: 'tiancode --skill code-review-and-quality --diff HEAD~1'
  },
  'Auditoría de seguridad': {
    name: 'Auditoría de Seguridad & Hardening',
    desc: 'Verifica vulnerabilidades OWASP Top 10, sanitización de inputs, protección CSRF/XSS y manejo seguro de variables de entorno.',
    cmd: 'tiancode --skill security-and-hardening --scan ./src'
  },
  'Optimización de rendimiento': {
    name: 'Optimización de Rendimiento',
    desc: 'Identifica cuellos de botella en CPU, memory leaks en Node/Bun y optimizaciones de render en React/DOM.',
    cmd: 'tiancode --skill performance-optimization --target ./src/server.ts'
  },
  'Pipelines CI/CD': {
    name: 'Pipelines CI/CD & GitHub Actions',
    desc: 'Genera flujos automatizados de validación, typecheck, linting y publicación multiplataforma para Windows y Linux.',
    cmd: 'tiancode --skill ci-cd-workflows --generate github-actions'
  },
  'Refactorización': {
    name: 'Refactorización Segura',
    desc: 'Reestructura código legado a TypeScript moderno con Effect Schema y tipados estrictos sin romper contratos existentes.',
    cmd: 'tiancode --skill refactoring --target ./legacy/auth.js'
  },
  'Depuración asistida': {
    name: 'Depuración Asistida & Stack Traces',
    desc: 'Analiza trazas de error en tiempo de ejecución, reproduce el bug con un test aislado y genera el fix verificado.',
    cmd: 'tiancode --skill debugging --trace ./error.log'
  },
  'Documentación técnica': {
    name: 'Documentación Técnica & OpenAPI',
    desc: 'Genera diagramas Mermaid, especificaciones OpenAPI 3.1 y guías de arquitectura actualizadas automáticamente.',
    cmd: 'tiancode --skill documentation-and-specs --output ./docs'
  },
  'Diseño de arquitectura': {
    name: 'Diseño de Arquitectura & Schemas',
    desc: 'Define capas desacopladas, esquemas Drizzle ORM, contratos de mensajería IPC y topologías de microservicios.',
    cmd: 'tiancode --skill system-architecture --plan "Arquitectura V2 Multi-Session"'
  },
  'Planning y desglose de tareas': {
    name: 'Planning & Desglose de Tareas',
    desc: 'Divide proyectos grandes en pasos atómicos verificables con dependencias ordenadas y criterios de aceptación claros.',
    cmd: 'tiancode --skill planning-and-task-breakdown --task "Migración a Effect 3.0"'
  },
  'Diseño de frontend': {
    name: 'Diseño de Frontend & UI/UX',
    desc: 'Crea interfaces responsivas con CSS moderno, glassmorphism, micro-animaciones y accesibilidad WCAG AAA.',
    cmd: 'tiancode --skill frontend-design --component "SettingsModal"'
  },
  'Git worktrees y control de versiones': {
    name: 'Git Worktrees Aislados',
    desc: 'Crea árboles de trabajo paralelos para probar cambios experimentales sin ensuciar la rama principal.',
    cmd: 'tiancode --skill using-git-worktrees --branch "experiment/webgpu"'
  },
  'Verificación antes de terminar': {
    name: 'Verificación Exhaustiva',
    desc: 'Ejecuta typecheck estricto, suite de pruebas unitarias y validación de cobertura antes de declarar completada la tarea.',
    cmd: 'tiancode --skill verification-before-completion --check-all'
  }
};

const skillChips = document.querySelectorAll('.skills-list .skill-chip');
const skillInspector = document.getElementById('skill-inspector');
const skillInspectorName = document.getElementById('skill-inspector-name');
const skillInspectorDesc = document.getElementById('skill-inspector-desc');
const skillInspectorCmd = document.getElementById('skill-inspector-cmd');

if (skillChips.length && skillInspector) {
  skillChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      skillChips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');

      const chipText = chip.textContent.trim();
      const info = SKILLS_INFO[chipText] || {
        name: chipText,
        desc: 'Skill de ingeniería especializada integrada en el motor de Tiancode con soporte multi-modelo.',
        cmd: 'tiancode --skill ' + chipText.toLowerCase().replace(/[^a-z0-9]/g, '-') + ' --run'
      };

      if (skillInspectorName) skillInspectorName.textContent = info.name;
      if (skillInspectorDesc) skillInspectorDesc.textContent = info.desc;
      if (skillInspectorCmd) skillInspectorCmd.textContent = info.cmd;

      skillInspector.style.display = 'flex';
      skillInspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

/* ============================================================
   Simulaciones Interactivas del Studio (#preview)
   ============================================================ */

// 1. Slider interactivo de VRAM
const vramInput = document.getElementById('vram-slider-input');
const vramVal = document.getElementById('vram-slider-val');
const vramFill = document.getElementById('vram-fill');
const vramStatusBadge = document.getElementById('vram-status-badge');
const qwenSpeed = document.getElementById('model-qwen-speed');
const deepseekSpeed = document.getElementById('model-deepseek-speed');
const llamaSpeed = document.getElementById('model-llama-speed');

if (vramInput) {
  vramInput.addEventListener('input', function () {
    const val = parseInt(vramInput.value, 10);
    const pct = Math.min(100, Math.round((val / 24) * 100));

    if (vramVal) vramVal.textContent = val + ' GB VRAM';
    if (vramFill) vramFill.style.width = pct + '%';

    if (vramStatusBadge) {
      if (val >= 10) {
        vramStatusBadge.innerHTML = (val * 0.7).toFixed(1) + ' GB / ' + val + '.0 GB VRAM (🟢 100% GPU Offload)';
        vramStatusBadge.style.color = '#10b981';
      } else {
        vramStatusBadge.innerHTML = val + '.0 GB VRAM (🟡 Offload Parcial CPU/GPU)';
        vramStatusBadge.style.color = '#f59e0b';
      }
    }

    const mult = (val / 12);
    if (qwenSpeed) qwenSpeed.textContent = '⚡ ' + (54.2 * mult).toFixed(1) + ' tokens/seg';
    if (deepseekSpeed) deepseekSpeed.textContent = '⚡ ' + (68.1 * mult).toFixed(1) + ' tokens/seg';
    if (llamaSpeed) llamaSpeed.textContent = '⚡ ' + (32.4 * mult).toFixed(1) + ' tokens/seg';
  });
}

// 2. Auto-Reparación AST (Panel 1)
const astFixBtn = document.getElementById('ast-fix-btn');
const astStatusText = document.getElementById('ast-status-text');

if (astFixBtn) {
  let fixed = false;
  astFixBtn.addEventListener('click', function () {
    fixed = !fixed;
    if (fixed) {
      astFixBtn.textContent = '✓ AST Sincronizado (Tests en verde)';
      astFixBtn.classList.remove('btn-primary');
      astFixBtn.classList.add('btn-secondary');
      if (astStatusText) {
        astStatusText.textContent = '▸ 3 archivos sincronizados · 0 vulnerabilidades restantes ✓';
        astStatusText.style.color = '#10b981';
      }
    } else {
      astFixBtn.textContent = '⚡ Simular Auto-Reparación AST';
      astFixBtn.classList.add('btn-primary');
      astFixBtn.classList.remove('btn-secondary');
      if (astStatusText) {
        astStatusText.textContent = '▸ 2 vulnerabilidades corregidas';
        astStatusText.style.color = '';
      }
    }
  });
}

// 3. Live Preview Component Click Inspector (Panel 3)
const previewBox = document.getElementById('preview-interactive-box');
const previewInner = document.getElementById('preview-render-inner');
const previewTitle = document.getElementById('preview-render-title');
const hmrCounter = document.getElementById('hmr-counter-badge');
let hmrCount = 1;

if (previewBox && previewInner) {
  previewBox.addEventListener('click', function () {
    hmrCount++;
    if (hmrCounter) hmrCounter.textContent = 'HMR ' + (hmrCount % 5 + 2) + 'ms · Update #' + hmrCount;

    const colors = [
      'var(--accent-soft)',
      'rgba(16, 185, 129, 0.15)',
      'rgba(236, 72, 153, 0.15)',
      'rgba(59, 130, 246, 0.15)'
    ];
    const borders = ['var(--accent)', '#10b981', '#ec4899', '#3b82f6'];
    const idx = hmrCount % colors.length;

    previewInner.style.background = colors[idx];
    previewInner.style.borderColor = borders[idx];
    if (previewTitle) previewTitle.textContent = 'Tiancode Live Preview (Estado #' + hmrCount + ')';
  });
}

// 4. Voz Kokoro TTS Player (Panel 5)
const voicePlayBtn = document.getElementById('voice-play-demo-btn');
const voicePlayText = document.getElementById('voice-play-demo-text');
const voiceWaveBars = document.querySelectorAll('.voice-wave-bar');

if (voicePlayBtn) {
  let isPlaying = false;
  voicePlayBtn.addEventListener('click', function () {
    if (isPlaying) return;
    isPlaying = true;

    if (voicePlayText) voicePlayText.textContent = '🔊 Reproduciendo síntesis...';
    voiceWaveBars.forEach(function (bar) {
      bar.style.animationDuration = '0.4s';
    });

    if ('speechSynthesis' in window) {
      const textToSpeak = document.getElementById('voice-speech-phrase')?.textContent || 'Refactoriza la función de autenticación y asegura compatibilidad con JWT';
      const utter = new SpeechSynthesisUtterance(textToSpeak.trim());
      utter.lang = 'es-ES';
      utter.rate = 1.05;
      utter.onend = function () {
        finishVoiceDemo();
      };
      utter.onerror = function () {
        finishVoiceDemo();
      };
      window.speechSynthesis.speak(utter);
    } else {
      setTimeout(finishVoiceDemo, 3200);
    }

    function finishVoiceDemo() {
      isPlaying = false;
      if (voicePlayText) voicePlayText.textContent = '▶ Probar Voz Kokoro';
      voiceWaveBars.forEach(function (bar) {
        bar.style.animationDuration = '1.2s';
      });
    }
  });
}


