/* ============================================================
   Tiancode — Universo
   Portada (logo de partículas) → salto astral → universo de
   paneles con navegación lateral: una sección por pantalla,
   sin desplazamiento de página. Incluye la galería 3D con
   capturas reales de la app y sus puntos de interés.
   ============================================================ */

import { getLang } from './i18n.js?v=1.0.0';
import { setGalaxyDispersal, setGalaxyForceActive } from './galaxy.js?v=1.0.0';
import { reducedMotion } from './utils.js?v=1.0.0';

const PANELS = ['overview', 'capabilities', 'app', 'benchmarks', 'architecture', 'skills', 'downloads', 'faq'];

/* Capturas reales de la app (img/app/*.webp, 1440×900). Las coordenadas de los
   puntos de interés son porcentajes del ancho/alto de la captura. */
const SHOTS = [
  {
    id: 'home', file: 'home', title: 'Tiancode · Inicio',
    label: { es: 'Inicio', en: 'Home' },
    caption: {
      es: 'La pantalla de inicio: tus proyectos a la izquierda, búsqueda de sesiones arriba y un botón para abrir una sesión nueva en cualquier carpeta.',
      en: 'The home screen: your projects on the left, session search on top and a button to open a new session in any folder.'
    },
    hot: [
      { x: 17, y: 18.5, side: 'left', title: { es: 'Proyectos', en: 'Projects' }, text: { es: 'Cada carpeta que abres se convierte en un proyecto con sus propias sesiones.', en: 'Every folder you open becomes a project with its own sessions.' } },
      { x: 60, y: 11, title: { es: 'Buscar sesiones', en: 'Search sessions' }, text: { es: 'Encuentra cualquier conversación anterior por texto.', en: 'Find any earlier conversation by text.' } },
      { x: 17, y: 30, side: 'left', flip: true, title: { es: 'Ajustes', en: 'Settings' }, text: { es: 'Proveedores, modelos locales, sub-agentes, voces, conexiones y mascotas.', en: 'Providers, local models, sub-agents, voices, connections and pets.' } },
      { x: 61, y: 42.5, flip: true, title: { es: 'Nueva sesión', en: 'New session' }, text: { es: 'Empieza a trabajar con el modelo que elijas, en la nube o en tu GPU.', en: 'Start working with the model you choose, in the cloud or on your GPU.' } }
    ]
  },
  {
    id: 'chat', file: 'chat', title: 'Tiancode · Sesión',
    label: { es: 'Chat', en: 'Chat' },
    caption: {
      es: 'El chat al estilo Claude Code: el botón Enviar aparece al escribir, con el modo de permisos, el modelo y el esfuerzo a un clic.',
      en: 'The Claude Code style chat: Send appears as you type, with permission mode, model and effort one click away.'
    },
    hot: [
      { x: 50, y: 84, title: { es: 'Cuadro de mensaje', en: 'Message box' }, text: { es: 'Escribe, adjunta archivos con + o dicta con el micrófono. Enter envía; Ctrl+Enter envía y se queda.', en: 'Type, attach files with + or dictate with the mic. Enter sends; Ctrl+Enter sends and stays.' } },
      { x: 27, y: 93, side: 'left', title: { es: 'Modo de permisos', en: 'Permission mode' }, text: { es: 'Auto, Manual, Aceptar ediciones, Plan u Omitir permisos, cambiable en plena tarea.', en: 'Auto, Manual, Accept edits, Plan or Skip permissions, switchable mid-task.' } },
      { x: 66, y: 93, title: { es: 'Modelo', en: 'Model' }, text: { es: 'Cualquier proveedor conectado o un modelo GGUF local.', en: 'Any connected provider or a local GGUF model.' } },
      { x: 76, y: 93, side: 'right', title: { es: 'Esfuerzo', en: 'Effort' }, text: { es: 'De Más rápido a Más inteligente; el nivel máximo y Ultracode brillan con su propio color.', en: 'From Faster to Smarter; the top level and Ultracode glow with their own colour.' } }
    ]
  },
  {
    id: 'chat-effort', file: 'chat-effort', title: 'Tiancode · Esfuerzo',
    label: { es: 'Esfuerzo', en: 'Effort' },
    caption: {
      es: 'El control deslizante de esfuerzo con los niveles del modelo elegido, Rápido como icono y el signo de interrogación que explica cada nivel.',
      en: 'The effort slider with the chosen model\'s levels, Fast as an icon and the question mark that explains each level.'
    },
    hot: [
      { x: 74, y: 70, side: 'right', title: { es: 'Control deslizante', en: 'Slider' }, text: { es: 'Cada muesca es un nivel real del modelo; Ultracode es la última cuando el modelo lo admite.', en: 'Each notch is a real model level; Ultracode is the last one when the model supports it.' } }
    ]
  },
  {
    id: 'settings-general', file: 'settings-general', title: 'Tiancode · Ajustes',
    label: { es: 'Ajustes', en: 'Settings' },
    caption: {
      es: 'Ajustes organizados en pestañas superiores, sin desplazamiento: idioma, asistente de bienvenida, permisos, barra superior, apariencia y respaldos.',
      en: 'Settings organised in top tabs, no scrolling: language, welcome wizard, permissions, title bar, appearance and backups.'
    },
    hot: [
      { x: 13, y: 30, side: 'left', title: { es: 'Secciones', en: 'Sections' }, text: { es: 'Escritorio, servidor, extensiones e integraciones, siempre a la vista.', en: 'Desktop, server, extensions and integrations, always visible.' } },
      { x: 56, y: 14.5, title: { es: 'Pestañas', en: 'Tabs' }, text: { es: 'Cada sección cabe en una pantalla gracias a sus pestañas.', en: 'Each section fits on one screen thanks to its tabs.' } }
    ]
  },
  {
    id: 'settings-intelligence', file: 'settings-intelligence', title: 'Tiancode · Inteligencia',
    label: { es: 'Inteligencia', en: 'Intelligence' },
    caption: {
      es: 'Memoria de usuario y de proyecto, grafo de código, aprendizaje automático de skills, guardarraíles y reparación de llamadas a herramientas.',
      en: 'User and project memory, code graph, automatic skill learning, guardrails and tool-call repair.'
    },
    hot: [
      { x: 56, y: 30, title: { es: 'Memoria', en: 'Memory' }, text: { es: 'MEMORY.md y las skills aprendidas viven en los datos de la app, no en tus proyectos.', en: 'MEMORY.md and learned skills live in the app data, not in your projects.' } }
    ]
  },
  {
    id: 'models-hub', file: 'models-hub', title: 'Tiancode · Modelos locales',
    label: { es: 'Modelos locales', en: 'Local models' },
    caption: {
      es: 'Explora Hugging Face con los logotipos originales, compara cuantizaciones contra tu VRAM y descarga modelos GGUF para ejecutarlos con el motor nativo.',
      en: 'Browse Hugging Face with the original logos, compare quantizations against your VRAM and download GGUF models to run them with the native engine.'
    },
    hot: [
      { x: 56, y: 19.5, title: { es: 'Explorar · En disco · Motores · Ajustes', en: 'Explore · On disk · Engines · Settings' }, text: { es: 'Cuatro pestañas: buscar, lo descargado, GPU/RAM/Ollama/LM Studio y la carpeta de modelos.', en: 'Four tabs: search, downloads, GPU/RAM/Ollama/LM Studio and the models folder.' } },
      { x: 50, y: 25, title: { es: 'Buscador', en: 'Search' }, text: { es: 'Busca por nombre o pulsa una etiqueta sugerida con el logotipo del autor.', en: 'Search by name or press a suggested tag with the author\'s logo.' } },
      { x: 83.5, y: 60, side: 'right', title: { es: 'Descargar', en: 'Download' }, text: { es: 'Elige la cuantización que cabe en tu GPU y descárgala con progreso en vivo.', en: 'Pick the quantization that fits your GPU and download it with live progress.' } }
    ]
  },
  {
    id: 'models-hub-settings', file: 'models-hub-settings', title: 'Tiancode · Parámetros de carga',
    label: { es: 'Parámetros de carga', en: 'Load parameters' },
    caption: {
      es: 'La carpeta de modelos y los mismos parámetros de carga que LM Studio: contexto, capas en GPU, Flash Attention, caché K/V, mmap, semilla y más.',
      en: 'The models folder and the same load parameters as LM Studio: context, GPU layers, Flash Attention, K/V cache, mmap, seed and more.'
    },
    hot: [
      { x: 56, y: 30, title: { es: 'Carpeta de modelos', en: 'Models folder' }, text: { es: 'Elige dónde se descargan los modelos, por ejemplo otro disco.', en: 'Choose where models download, for example another drive.' } },
      { x: 56, y: 55, title: { es: 'Parámetros de carga', en: 'Load parameters' }, text: { es: 'Se aplican al motor nativo la próxima vez que carga un modelo.', en: 'Applied to the native engine the next time it loads a model.' } }
    ]
  },
  {
    id: 'sub-agents', file: 'sub-agents', title: 'Tiancode · Sub-agentes',
    label: { es: 'Sub-agentes', en: 'Sub-agents' },
    caption: {
      es: 'Catorce especialistas integrados con su rol, modelo y herramientas, más la jerarquía de delegación que usa el coordinador.',
      en: 'Fourteen built-in specialists with their role, model and tools, plus the delegation hierarchy the coordinator uses.'
    },
    hot: [
      { x: 56, y: 23.5, title: { es: 'Filtro', en: 'Filter' }, text: { es: 'Busca por nombre y filtra por habilitados o deshabilitados.', en: 'Search by name and filter by enabled or disabled.' } },
      { x: 84, y: 44, side: 'right', title: { es: 'Activar', en: 'Enable' }, text: { es: 'Cada especialista se enciende o apaga por proyecto o globalmente.', en: 'Each specialist switches on or off per project or globally.' } }
    ]
  },
  {
    id: 'mcp-plugins', file: 'mcp-plugins', title: 'Tiancode · MCP y plugins',
    label: { es: 'MCP y plugins', en: 'MCP & plugins' },
    caption: {
      es: 'Plugins instalados, plugins integrados, servidores MCP y un catálogo para descubrir más, con los logotipos oficiales de cada servicio.',
      en: 'Installed plugins, built-in plugins, MCP servers and a catalogue to discover more, with each service\'s official logo.'
    },
    hot: [
      { x: 45, y: 16.5, title: { es: 'Pestañas', en: 'Tabs' }, text: { es: 'Plugins, integrados, servidores MCP y Descubrir.', en: 'Plugins, built-in, MCP servers and Discover.' } },
      { x: 87, y: 11.5, side: 'right', title: { es: 'Añadir plugin', en: 'Add plugin' }, text: { es: 'Carga un plugin local o desde npm.', en: 'Load a plugin from disk or npm.' } }
    ]
  },
  {
    id: 'connections', file: 'connections', title: 'Tiancode · Conexiones',
    label: { es: 'Conexiones', en: 'Connections' },
    caption: {
      es: 'Recibe el resultado de tus sesiones en Telegram, Discord, Slack o un webhook, y dirige Tiancode desde un chat.',
      en: 'Receive your session results on Telegram, Discord, Slack or a webhook, and drive Tiancode from a chat.'
    },
    hot: [
      { x: 56, y: 19, title: { es: 'Estado por proveedor', en: 'Status per provider' }, text: { es: 'La barra muestra cuáles están conectados y cuántos hay activos.', en: 'The bar shows which ones are connected and how many are active.' } }
    ]
  },
  {
    id: 'pets', file: 'pets', title: 'Tiancode · Mascotas',
    label: { es: 'Mascotas', en: 'Pets' },
    caption: {
      es: 'Un compañero ilustrado que refleja el estado de la sesión, dentro de la app, flotando en el escritorio de Windows o en ambos.',
      en: 'An illustrated companion that mirrors the session state, inside the app, floating on the Windows desktop or both.'
    },
    hot: [
      { x: 85, y: 37, side: 'right', title: { es: 'Dónde se muestra', en: 'Where it appears' }, text: { es: 'Dentro de la app, en el escritorio o en ambas.', en: 'Inside the app, on the desktop or both.' } }
    ]
  },
  {
    id: 'skills', file: 'skills', title: 'Tiancode · Skills',
    label: { es: 'Skills', en: 'Skills' },
    caption: {
      es: 'Skills instaladas e importación de nuevas: playbooks de TDD, auditorías, revisiones de arquitectura y flujos que el agente aprende por sí mismo.',
      en: 'Installed skills and importing new ones: TDD playbooks, audits, architecture reviews and workflows the agent learns by itself.'
    },
    hot: [
      { x: 33, y: 30, title: { es: 'Categorías', en: 'Categories' }, text: { es: 'Iconos por categoría con descripción al pasar el cursor; 130+ skills integradas.', en: 'Category icons with a description on hover; 130+ built-in skills.' } },
      { x: 73, y: 20.5, title: { es: 'Importar skill', en: 'Import skill' }, text: { es: 'Trae una skill desde tu equipo o desde la web.', en: 'Bring a skill from your computer or from the web.' } }
    ]
  }
];

function panelFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  return PANELS.indexOf(hash) !== -1 ? hash : null;
}

function lang() {
  return getLang() === 'en' ? 'en' : 'es';
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/* ---------- Galería de capturas ---------- */
function buildGallery() {
  const tabs = document.getElementById('app-gallery-tabs');
  const img = document.getElementById('app-shot');
  const hotspots = document.getElementById('app-hotspots');
  const caption = document.getElementById('app-caption');
  const frameTitle = document.getElementById('app-frame-title');
  const wrap = document.getElementById('app-frame-wrap');
  const frame = document.getElementById('app-frame');
  if (!tabs || !img || !hotspots || !caption) return null;

  let active = SHOTS[0].id;
  const loaded = new Set();

  function renderTabs() {
    const buttons = SHOTS.map(function (shot, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-gallery-tab' + (shot.id === active ? ' is-active' : '');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', shot.id === active ? 'true' : 'false');
      const num = document.createElement('i');
      num.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.textContent = shot.label[lang()];
      button.append(num, text);
      button.addEventListener('click', function () { select(shot.id); });
      return button;
    });
    tabs.replaceChildren.apply(tabs, buttons);
  }

  function renderHot(shot) {
    const dots = (shot.hot || []).map(function (h) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'app-hot';
      dot.style.left = h.x + '%';
      dot.style.top = h.y + '%';
      if (h.side) dot.dataset.side = h.side;
      if (h.flip) dot.dataset.flip = '';
      dot.setAttribute('aria-label', h.title[lang()] + ': ' + h.text[lang()]);
      const tip = document.createElement('span');
      tip.className = 'tip';
      const strong = document.createElement('strong');
      strong.textContent = h.title[lang()];
      tip.append(strong, document.createTextNode(h.text[lang()]));
      dot.append(tip);
      return dot;
    });
    hotspots.replaceChildren.apply(hotspots, dots);
  }

  function apply(shot) {
    img.src = 'img/app/' + shot.file + '.webp';
    img.alt = shot.title;
    if (frameTitle) frameTitle.textContent = shot.title;
    caption.textContent = shot.caption[lang()];
    renderHot(shot);
  }

  function select(id) {
    const shot = SHOTS.find(function (s) { return s.id === id; }) || SHOTS[0];
    active = shot.id;
    renderTabs();
    if (reducedMotion) { apply(shot); return; }
    img.classList.add('is-switching');
    setTimeout(function () {
      apply(shot);
      const done = function () { img.classList.remove('is-switching'); };
      if (img.complete) requestAnimationFrame(done); else img.addEventListener('load', done, { once: true });
    }, 160);
  }

  function preload() {
    SHOTS.forEach(function (shot) {
      if (loaded.has(shot.id)) return;
      loaded.add(shot.id);
      const image = new Image();
      image.src = 'img/app/' + shot.file + '.webp';
    });
  }

  // Inclinación 3D siguiendo el cursor (solo con ratón y sin movimiento reducido)
  if (wrap && frame && !reducedMotion && window.matchMedia('(hover: hover)').matches) {
    wrap.addEventListener('pointermove', function (e) {
      const rect = wrap.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      frame.style.transform = 'rotateX(' + ((0.5 - py) * 7).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 9).toFixed(2) + 'deg)';
      frame.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
      frame.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
    });
    wrap.addEventListener('pointerleave', function () {
      frame.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  renderTabs();
  apply(SHOTS[0]);
  window.addEventListener('tiancode:langchange', function () {
    renderTabs();
    const shot = SHOTS.find(function (s) { return s.id === active; }) || SHOTS[0];
    caption.textContent = shot.caption[lang()];
    if (frameTitle) frameTitle.textContent = shot.title;
    renderHot(shot);
  });

  return { preload: preload, select: select };
}

/* ---------- Universo ---------- */
export function initUniverse() {
  const body = document.body;
  const universe = document.getElementById('universe');
  if (!universe) return;
  const stage = document.getElementById('universe-stage');
  const hero = document.getElementById('galaxy-hero');
  const menuLinks = Array.prototype.slice.call(universe.querySelectorAll('.universe-menu a[data-panel]'));
  const gallery = buildGallery();

  let open = false;
  let busy = false;
  let current = 'overview';

  function showPanel(id, options) {
    const opts = options || {};
    const target = PANELS.indexOf(id) !== -1 ? id : 'overview';
    current = target;
    universe.querySelectorAll('.universe-panel').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.dataset.panel === target);
    });
    menuLinks.forEach(function (link) {
      const on = link.dataset.panel === target;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const active = universe.querySelector('.universe-panel.is-active');
    if (active) active.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
    if (stage) stage.scrollTop = 0;
    if (opts.push !== false && window.history.replaceState) window.history.replaceState(null, '', '#' + target);
    if (target === 'app' && gallery) gallery.preload();
    document.dispatchEvent(new CustomEvent('tiancode:panel', { detail: { panel: target } }));
  }

  function enter(id, options) {
    const opts = options || {};
    if (busy) return;
    const target = PANELS.indexOf(id) !== -1 ? id : 'overview';
    if (open) { showPanel(target); return; }
    busy = true;
    setGalaxyForceActive(true);
    setGalaxyDispersal(1);
    const animate = !opts.instant && !reducedMotion;
    if (animate) {
      body.classList.remove('universe-warp-back');
      body.classList.add('universe-warp');
    }
    window.setTimeout(function () {
      open = true;
      body.classList.add('universe-open');
      universe.setAttribute('aria-hidden', 'false');
      if (hero) hero.setAttribute('aria-hidden', 'true');
      showPanel(target);
      window.setTimeout(function () {
        body.classList.remove('universe-warp');
        busy = false;
      }, animate ? 700 : 0);
    }, animate ? 420 : 0);
  }

  function leave() {
    if (!open || busy) return;
    busy = true;
    if (!reducedMotion) body.classList.add('universe-warp-back');
    body.classList.remove('universe-open');
    universe.setAttribute('aria-hidden', 'true');
    if (hero) hero.removeAttribute('aria-hidden');
    setGalaxyDispersal(0);
    if (window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.setTimeout(function () {
      open = false;
      busy = false;
      body.classList.remove('universe-warp-back');
      setGalaxyForceActive(false);
      window.scrollTo(0, 0);
    }, reducedMotion ? 0 : 700);
  }

  function step(delta) {
    const index = PANELS.indexOf(current);
    const next = PANELS[(index + delta + PANELS.length) % PANELS.length];
    showPanel(next);
  }

  // Entrada desde la portada
  const enterButton = document.getElementById('universe-enter');
  const hintButton = document.getElementById('universe-hint');
  const backButton = document.getElementById('universe-back');
  if (enterButton) enterButton.addEventListener('click', function () { enter('overview'); });
  if (hintButton) hintButton.addEventListener('click', function () { enter('overview'); });
  if (backButton) backButton.addEventListener('click', leave);

  menuLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      showPanel(link.dataset.panel);
    });
  });

  // Cualquier enlace a un panel (cabecera, pie, botones) entra en el universo; #top vuelve a la portada
  document.addEventListener('click', function (e) {
    const link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (id === 'top') {
      e.preventDefault();
      if (body.classList.contains('page-open')) {
        window.location.hash = '';
      } else if (open) {
        leave();
      } else {
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      }
      return;
    }
    if (PANELS.indexOf(id) === -1) return;
    e.preventDefault();
    if (body.classList.contains('page-open')) {
      // Una página interna abierta: el router la cierra al cambiar el hash y luego entramos
      window.location.hash = id;
      return;
    }
    enter(id);
  });

  // Rueda, deslizamiento y teclado sobre la portada
  if (hero) {
    hero.addEventListener('wheel', function (e) {
      if (open || busy || e.deltaY < 14 || document.getElementById('loader')) return;
      enter('overview');
    }, { passive: true });
    let touchY = null;
    hero.addEventListener('touchstart', function (e) { touchY = e.touches[0] ? e.touches[0].clientY : null; }, { passive: true });
    hero.addEventListener('touchend', function (e) {
      if (touchY === null || open || busy) return;
      const endY = e.changedTouches[0] ? e.changedTouches[0].clientY : touchY;
      if (touchY - endY > 48) enter('overview');
      touchY = null;
    }, { passive: true });
  }

  document.addEventListener('keydown', function (e) {
    if (isTypingTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (body.classList.contains('page-open')) return;
    const modal = document.getElementById('feature-modal');
    if (modal && modal.classList.contains('is-open')) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'Enter' || e.key === ' ') {
        if (document.getElementById('loader')) return;
        e.preventDefault();
        enter('overview');
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); leave(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  // Hash: #overview … #faq abren el universo en ese panel; vacío o #top vuelven a la portada
  function syncFromHash(instant) {
    if (body.classList.contains('page-open')) return;
    const id = panelFromHash();
    if (id) enter(id, { instant: instant });
    else if (open && (window.location.hash === '' || window.location.hash === '#top' || window.location.hash === '#')) leave();
  }
  window.addEventListener('hashchange', function () { syncFromHash(false); });
  document.addEventListener('tiancode:home', function () { syncFromHash(false); });
  window.setTimeout(function () { syncFromHash(true); }, 250);
}
