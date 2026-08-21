/* ============================================================
   Tiancode — Website main (DeepSeek Harness & SkillUI Integration)
   ============================================================ */

import { initTheme } from './theme.js';
import { applyLang, initI18n } from './i18n.js';
import { initRouter, closeDropdown } from './router.js';
import { initAnimations } from './animations.js';
import { initCharts } from './charts.js';
import { initFaq } from './faq.js';

/* ---------- Inicialización de módulos ---------- */
initTheme();
initRouter();
applyLang();
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

/* ---------- Copy botón de comando terminal ---------- */
const quickCmd = document.getElementById('quick-install-cmd');
if (quickCmd) {
  quickCmd.addEventListener('click', function () {
    const code = quickCmd.querySelector('code');
    if (code) {
      navigator.clipboard?.writeText(code.textContent.trim()).then(function () {
        const orig = code.textContent;
        code.textContent = '¡Copiado al portapapeles!';
        setTimeout(function () { code.textContent = orig; }, 2000);
      });
    }
  });
}

/* ---------- Tab switcher de la vista previa interactiva ---------- */
const showcaseTabs = document.querySelectorAll('.showcase-tab-btn');
const showcasePanels = document.querySelectorAll('.showcase-panel');

showcaseTabs.forEach(function (btn) {
  btn.addEventListener('click', function () {
    const target = btn.getAttribute('data-target');
    showcaseTabs.forEach(function (b) { b.classList.toggle('active', b === btn); });
    showcasePanels.forEach(function (panel) {
      const match = panel.id === target;
      panel.classList.toggle('active', match);
      panel.style.display = match ? 'block' : 'none';
    });
  });
});

/* ---------- Interactive Explorer File Switcher (Showcase) ---------- */
const apanelFiles = document.querySelectorAll('.apanel-file[data-file]');
const codePaneHead = document.querySelector('.code-pane-head');
const codePaneBody = document.querySelector('.code-pane-body');
const chatPane = document.querySelector('.chat');

const FILE_CONTENTS = {
  'auth.ts': {
    head: '<span>src/auth.ts</span><span>TypeScript</span>',
    code: `<span class="hc-k">import</span> { db } <span class="hc-k">from</span> <span class="hc-s">"./db"</span>

<span class="hc-k">export async function</span> <span class="hc-f">verifySession</span>(token: <span class="hc-t">string</span>) {
  <span class="hc-k">const</span> session = <span class="hc-k">await</span> db.query.session.findFirst({
    where: (t, { eq }) => eq(t.token, token)
  })
  <span class="hc-k">if</span> (!session || session.expiresAt &lt; Date.now()) {
    <span class="hc-k">return null</span>
  }
  <span class="hc-k">return</span> session.user
}`,
    chat: `<div class="bubble bubble--user">Analiza las dependencias de auth.ts y crea los tests correspondientes.</div>
<div class="bubble bubble--agent">✓ Inspeccionado árbol AST (2 imports, 1 función exportada). Creando suite de pruebas unitarias:</div>
<div class="bubble bubble--agent" style="font-family: var(--font-mono); font-size: 11.5px; background: var(--term-bg); color: var(--accent-cyan);">
  $ bun test auth.test.ts<br>
  ✓ verifySession() valid token [2ms]<br>
  ✓ verifySession() expired token [1ms]<br>
  <strong>2 pass, 0 fail</strong>
</div>`
  },
  'db.ts': {
    head: '<span>src/db.ts</span><span>TypeScript (Drizzle + SQLite)</span>',
    code: `<span class="hc-k">import</span> { drizzle } <span class="hc-k">from</span> <span class="hc-s">"drizzle-orm/bun-sqlite"</span>
<span class="hc-k">import</span> { Database } <span class="hc-k">from</span> <span class="hc-s">"bun:sqlite"</span>
<span class="hc-k">import</span> * <span class="hc-k">as</span> schema <span class="hc-k">from</span> <span class="hc-s">"./schema"</span>

<span class="hc-k">const</span> sqlite = <span class="hc-k">new</span> <span class="hc-t">Database</span>(<span class="hc-s">"tiancode.db"</span>)
<span class="hc-k">export const</span> db = <span class="hc-f">drizzle</span>(sqlite, { schema })

<span class="hc-k">export async function</span> <span class="hc-f">migrate</span>() {
  <span class="hc-c">// SQLite con nombres snake_case para persistencia local</span>
  <span class="hc-k">return</span> db.run(<span class="hc-s">"PRAGMA journal_mode = WAL;"</span>)
}`,
    chat: `<div class="bubble bubble--user">Configura la base de datos local SQLite con WAL mode y migra el schema.</div>
<div class="bubble bubble--agent">✓ Conexión establecida en <code>tiancode.db</code>. Esquema sincronizado con Drizzle ORM:</div>
<div class="bubble bubble--agent" style="font-family: var(--font-mono); font-size: 11.5px; background: var(--term-bg); color: var(--accent-cyan);">
  $ bun run db:migrate<br>
  ✓ PRAGMA journal_mode = WAL [0.4ms]<br>
  ✓ Tablas creadas: session, model_cache, prompt_history<br>
  <strong>Migración local completada ✓</strong>
</div>`
  },
  'router.ts': {
    head: '<span>src/router.ts</span><span>TypeScript (Hono API)</span>',
    code: `<span class="hc-k">import</span> { Hono } <span class="hc-k">from</span> <span class="hc-s">"hono"</span>
<span class="hc-k">import</span> { verifySession } <span class="hc-k">from</span> <span class="hc-s">"./auth"</span>

<span class="hc-k">export const</span> router = <span class="hc-k">new</span> <span class="hc-t">Hono</span>()

router.get(<span class="hc-s">"/v1/session"</span>, <span class="hc-k">async</span> (c) => {
  <span class="hc-k">const</span> token = c.req.header(<span class="hc-s">"Authorization"</span>)?.replace(<span class="hc-s">"Bearer "</span>, <span class="hc-s">""</span>)
  <span class="hc-k">if</span> (!token) <span class="hc-k">return</span> c.json({ error: <span class="hc-s">"Unauthorized"</span> }, 401)
  <span class="hc-k">const</span> user = <span class="hc-k">await</span> <span class="hc-f">verifySession</span>(token)
  <span class="hc-k">if</span> (!user) <span class="hc-k">return</span> c.json({ error: <span class="hc-s">"Session expired"</span> }, 401)
  <span class="hc-k">return</span> c.json({ user, status: <span class="hc-s">"active"</span> })
})`,
    chat: `<div class="bubble bubble--user">Crea un endpoint seguro /v1/session con Hono y autenticación por token.</div>
<div class="bubble bubble--agent">✓ Ruta OpenAPI generada con validación de cabecera Bearer y verificación contra SQLite:</div>
<div class="bubble bubble--agent" style="font-family: var(--font-mono); font-size: 11.5px; background: var(--term-bg); color: var(--accent-cyan);">
  $ curl -i http://localhost:3000/v1/session<br>
  HTTP/1.1 200 OK<br>
  Content-Type: application/json<br>
  <strong>Response Latency: 0.6ms (Loopback IPC)</strong>
</div>`
  }
};

apanelFiles.forEach(function (fileEl) {
  fileEl.addEventListener('click', function () {
    const file = fileEl.getAttribute('data-file');
    if (!file || !FILE_CONTENTS[file]) return;

    apanelFiles.forEach(function (f) { f.classList.remove('is-open'); });
    fileEl.classList.add('is-open');

    if (codePaneHead) codePaneHead.innerHTML = FILE_CONTENTS[file].head;
    if (codePaneBody) {
      codePaneBody.style.opacity = '0';
      setTimeout(function () {
        codePaneBody.innerHTML = FILE_CONTENTS[file].code;
        codePaneBody.style.opacity = '1';
      }, 120);
    }
    if (chatPane) {
      chatPane.style.opacity = '0';
      setTimeout(function () {
        chatPane.innerHTML = FILE_CONTENTS[file].chat;
        chatPane.style.opacity = '1';
      }, 120);
    }
  });
});

/* ---------- DeepSeek Harness Runtime Mode Switcher ---------- */
const harnessModeBtns = document.querySelectorAll('.harness-mode-btn');
const harnessTrajBody = document.querySelector('.harness-body');

const HARNESS_PRESETS = {
  standard: [
    { tag: 'THINKING', tagClass: 'traj-tag--think', text: 'Analizando el espacio de nombres de la API y contratos de tipos. Descomponiendo el plan en 3 fases atómicas con validación TDD...' },
    { tag: 'TOOL_CALL', tagClass: 'traj-tag--tool', text: '<code>read_file(path="backend/core/src/graph.ts")</code> → <strong>248 lines read (0 ms IPC latency)</strong>' },
    { tag: 'TOOL_CALL', tagClass: 'traj-tag--tool', text: '<code>replace_file_content(path="backend/core/src/graph.ts", lines=12..48)</code> → <strong>Patch applied without conflict</strong>' },
    { tag: 'VERIFICATION', tagClass: 'traj-tag--verify', text: '<code>bun typecheck</code> exited with <strong>0 errors</strong> · Trajectory step committed to append-only transcript.' }
  ],
  code: [
    { tag: 'CODE_GEN', tagClass: 'traj-tag--tool', text: 'Generando componente accesible con CSS tokens nativos y soporte para keyboard navigation...' },
    { tag: 'TOOL_CALL', tagClass: 'traj-tag--tool', text: '<code>write_to_file(path="frontend/app/src/components/button-v2.tsx")</code> → <strong>File created</strong>' },
    { tag: 'LINT_CHECK', tagClass: 'traj-tag--verify', text: '<code>oxlint</code> → <strong>Clean (0 warnings, 0 syntax errors)</strong>' }
  ],
  architect: [
    { tag: 'SYSTEM_DESIGN', tagClass: 'traj-tag--think', text: 'Mapeando grafo de dependencias cíclicas: Schema → Protocol → Core → Server. Aplicando desacoplamiento Effect...' },
    { tag: 'TOOL_CALL', tagClass: 'traj-tag--tool', text: '<code>grep_search(query="import.*from.*server", path="backend/client")</code> → <strong>0 cross-layer leaks</strong>' },
    { tag: 'CONTRACT_VALID', tagClass: 'traj-tag--verify', text: 'Contratos OpenAPI & Effect Schema sincronizados sin regresiones.' }
  ],
  minimal: [
    { tag: 'FAST_LOOKUP', tagClass: 'traj-tag--tool', text: 'Búsqueda ultrarrápida en memoria local (0 tokens de contexto desperdiciados).' },
    { tag: 'OUTPUT', tagClass: 'traj-tag--verify', text: 'Respuesta sintetizada en <strong>12ms</strong>.' }
  ]
};

harnessModeBtns.forEach(function (btn) {
  btn.addEventListener('click', function () {
    const mode = btn.getAttribute('data-mode');
    harnessModeBtns.forEach(function (b) { b.classList.toggle('active', b === btn); });
    if (harnessTrajBody && HARNESS_PRESETS[mode]) {
      harnessTrajBody.innerHTML = HARNESS_PRESETS[mode].map(function (step) {
        return `<div class="harness-traj-step">
          <span class="traj-tag ${step.tagClass}">${step.tag}</span>
          <div class="traj-content">${step.text}</div>
        </div>`;
      }).join('');
    }
  });
});

/* ---------- SkillUI Claude Skills Directory (Filtros, Búsqueda y Modales) ---------- */
const skillTabs = document.querySelectorAll('.skillui-tab-btn');
const skillCards = document.querySelectorAll('.skillui-card');
const skillSearch = document.getElementById('skillui-search');

function filterSkillCards() {
  const activeTab = document.querySelector('.skillui-tab-btn.active');
  const activeFilter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
  const query = skillSearch ? skillSearch.value.trim().toLowerCase() : '';

  skillCards.forEach(function (card) {
    const category = card.getAttribute('data-category') || '';
    const text = card.textContent.toLowerCase();
    const matchesFilter = activeFilter === 'all' || category.includes(activeFilter);
    const matchesSearch = !query || text.includes(query);
    card.style.display = matchesFilter && matchesSearch ? 'flex' : 'none';
  });
}

skillTabs.forEach(function (btn) {
  btn.addEventListener('click', function () {
    skillTabs.forEach(function (b) { b.classList.toggle('active', b === btn); });
    filterSkillCards();
  });
});

if (skillSearch) {
  skillSearch.addEventListener('input', filterSkillCards);
}

/* Copiar Prompt de Skill */
const copyBtns = document.querySelectorAll('.skillui-btn-copy');
copyBtns.forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    const skillName = btn.getAttribute('data-skill');
    const promptSnippet = `Activa y ejecuta la skill especializada: \`${skillName}\` siguiendo estrictamente sus directivas de arquitectura, calidad y verificación de código.`;
    navigator.clipboard?.writeText(promptSnippet).then(function () {
      const span = btn.querySelector('span');
      if (span) {
        const orig = span.textContent;
        span.textContent = '¡Copiado!';
        setTimeout(function () { span.textContent = orig; }, 1800);
      }
    });
  });
});

/* Modal de Skill Preview */
const modalOverlay = document.getElementById('skill-modal-overlay');
const modalTitle = document.getElementById('skill-modal-title');
const modalBody = document.getElementById('skill-modal-body');
const modalClose = document.getElementById('skill-modal-close');
const modalCloseBtn = document.getElementById('skill-modal-close-btn');
const modalCopyBtn = document.getElementById('skill-modal-copy-btn');

let currentModalSkill = '';

const SKILL_DETAILS = {
  'claude-design-system-extractor': {
    title: 'claude-design-system-extractor (SkillUI Ultra)',
    desc: 'Motor de ingeniería inversa para Claude Code & Tiancode. Extrae automáticamente paletas cromáticas HSL, tipografías con tracking proporcional, espaciados en múltiplos de 4px/8px, curvas de animación cubic-bezier y sombras volumétricas para volcarlos en CLAUDE.md y DESIGN.md.',
    instructions: '1. Coloca el skill en skills/claude-design-system-extractor.md\n2. Ejecuta: "Extrae el sistema de diseño de esta interfaz a tokens CSS"\n3. El agente generará DESIGN.md y CLAUDE.md sin alucinaciones.'
  },
  'claude-frontend-engineer': {
    title: 'claude-frontend-engineer',
    desc: 'Ingeniería de interfaces con accesibilidad WCAG AAA, semantic HTML5, layouts CSS Grid fluidos y micro-interacciones responsivas sin parpadeos.',
    instructions: '1. Invoca con @claude-frontend-engineer\n2. Define componentes modulares reutilizables con Vanilla CSS o Tailwind v4.\n3. Verifica contraste, focus rings y responsividad.'
  },
  'claude-code-architect': {
    title: 'claude-code-architect',
    desc: 'Descomposición de sistemas distribuidos, tipado estricto con discriminated unions en TypeScript, desacoplamiento por capas y refactorización atómica.',
    instructions: '1. Mantiene flujo unidireccional (Schema → Protocol → Core → Server → Client).\n2. Cero regresiones: verificación con suites de pruebas antes y después.'
  },
  'claude-react-nextjs-expert': {
    title: 'claude-react-nextjs-expert',
    desc: 'Arquitectura React 19 & Next.js App Router: RSC, Streaming SSR con Suspense, Server Actions con optimismo y empaquetado tree-shaken.',
    instructions: '1. Separa componentes de servidor y cliente ("use client").\n2. Optimiza mutaciones con useOptimistic y useActionState.'
  },
  'claude-testing-and-verification': {
    title: 'claude-testing-and-verification',
    desc: 'Test-Driven Development (TDD), Vitest, Playwright browser automation y suites deterministas sin flakiness.',
    instructions: '1. Escribe tests contra comportamientos reales sin abusar de mocks frágiles.\n2. Ejecuta bun test / playwright antes de declarar cualquier tarea terminada.'
  },
  'claude-performance-optimizer': {
    title: 'claude-performance-optimizer',
    desc: 'Optimización de Core Web Vitals (LCP < 1.2s, INP < 50ms, CLS = 0), virtualización de listas y profiling de memoria.',
    instructions: '1. Prunea árboles de DOM pesados con windowing.\n2. Aprovecha Prompt Caching de Claude 3.5/3.7 para reducir latencia un 90%.'
  },
  'claude-security-auditor': {
    title: 'claude-security-auditor',
    desc: 'Auditoría estricta OWASP Top 10, sanitización de inputs, protección de secrets en disco y aislamiento de IPC.',
    instructions: '1. Nunca hardcodea API keys ni tokens en el repositorio.\n2. Aisla llamadas del sistema a interfaces loopback autenticadas.'
  },
  'claude-context-engineer': {
    title: 'claude-context-engineer',
    desc: 'Ingeniería de contexto: compresión de historial de chat, anclaje de prompts inmutables y sub-agentes jerárquicos.',
    instructions: '1. Estructura el prompt con anclas inmutables al inicio para el cache de Anthropic.\n2. Delega sub-tareas complejas a subagentes para mantener el contexto limpio.'
  }
};

document.querySelectorAll('.skillui-btn-view').forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.preventDefault();
    const skillId = btn.getAttribute('data-skill-id');
    const data = SKILL_DETAILS[skillId];
    if (data && modalOverlay && modalTitle && modalBody) {
      currentModalSkill = skillId;
      modalTitle.textContent = data.title;
      modalBody.innerHTML = `
        <p><strong>Descripción:</strong> ${data.desc}</p>
        <p><strong>Instrucciones de Uso:</strong></p>
        <pre><code>${data.instructions}</code></pre>
        <p style="margin-top: 14px; font-size: 12px; color: var(--text-3);">
          ⚡ Disponible de forma predeterminada en <code>skills/${skillId}.md</code> en Tiancode v1.0.72.
        </p>
      `;
      modalOverlay.classList.add('is-active');
      modalOverlay.setAttribute('aria-hidden', 'false');
    }
  });
});

function closeModal() {
  if (modalOverlay) {
    modalOverlay.classList.remove('is-active');
    modalOverlay.setAttribute('aria-hidden', 'true');
  }
}

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (modalOverlay) {
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) closeModal();
  });
}
if (modalCopyBtn) {
  modalCopyBtn.addEventListener('click', function () {
    if (currentModalSkill && SKILL_DETAILS[currentModalSkill]) {
      const text = `# ${SKILL_DETAILS[currentModalSkill].title}\n\n${SKILL_DETAILS[currentModalSkill].desc}\n\n## Instrucciones\n${SKILL_DETAILS[currentModalSkill].instructions}`;
      navigator.clipboard?.writeText(text).then(function () {
        const orig = modalCopyBtn.textContent;
        modalCopyBtn.textContent = '¡Markdown Copiado!';
        setTimeout(function () { modalCopyBtn.textContent = orig; }, 1800);
      });
    }
  });
}

/* ---------- Scrollspy ---------- */
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
