import { getLang } from './i18n.js?v=1.0.0-b1008';

const details = {
  "es": {
    "swe": {
      "title": "Modelos gratuitos de OpenCode",
      "label": "Free",
      "summary": "La lista de modelos gratuitos sigue el catálogo de OpenCode.",
      "items": [
        "El grupo «OpenCode Free» se activa en Proveedores, Modelos o la bienvenida.",
        "Cada modelo tiene su propio interruptor para el selector.",
        "Con tu clave de OpenCode Zen tienes además todos sus modelos de pago."
      ]
    },
    "latency": {
      "title": "Una bienvenida completa",
      "label": "1200×850",
      "summary": "Seis pasos para dejar Tiancode a tu gusto.",
      "items": [
        "Idioma, tema, mascota y lectura en voz alta.",
        "Escala de la interfaz del 80 % al 120 %, tamaño y ancho de la conversación con vista previa.",
        "Pestañas, terminal, línea de tiempo, modelos gratuitos y qué se abre al iniciar."
      ]
    },
    "tokens": {
      "title": "Chat y vista previa",
      "label": "Chat",
      "summary": "La mascota acompaña cada paso del modelo.",
      "items": [
        "La mascota aparece junto a Pensando, Editar, Shell y los demás pasos.",
        "Cerrar la vista previa ya no la vuelve a abrir en bucle.",
        "El modo Code continúa en tu último proyecto."
      ]
    },
    "offline": {
      "title": "Actualiza conservando tu configuración",
      "label": "SHA-256",
      "summary": "Cada archivo se verifica antes de publicar.",
      "items": [
        "Claves, ajustes, sesiones y autenticación MCP se conservan.",
        "Quien tenga 1.0.1–1.0.8 instala Tiancode.exe encima.",
        "Instalador, portable, CLI y metadatos se comprueban antes de publicar."
      ]
    }
  },
  "en": {
    "swe": {
      "title": "OpenCode's free models",
      "label": "Free",
      "summary": "The free model list follows OpenCode's catalog.",
      "items": [
        "The “OpenCode Free” group can be turned on in Providers, Models or the welcome wizard.",
        "Every model has its own switch for the picker.",
        "With your OpenCode Zen key you also get all of its paid models."
      ]
    },
    "latency": {
      "title": "A complete welcome",
      "label": "1200×850",
      "summary": "Six steps to set Tiancode up your way.",
      "items": [
        "Language, theme, pet and read-aloud.",
        "Interface scale from 80% to 120%, conversation size and width with a preview.",
        "Tabs, terminal, timeline, free models and what opens on start."
      ]
    },
    "tokens": {
      "title": "Chat and preview",
      "label": "Chat",
      "summary": "The pet follows every step of the model.",
      "items": [
        "The pet sits next to Thinking, Edit, Shell and the other steps.",
        "Closing the preview no longer reopens it in a loop.",
        "Code mode continues in your last project."
      ]
    },
    "offline": {
      "title": "Update while keeping your settings",
      "label": "SHA-256",
      "summary": "Every file is verified before publication.",
      "items": [
        "Provider keys, settings, sessions and MCP sign-ins are kept.",
        "If you have 1.0.1–1.0.8, install Tiancode.exe on top.",
        "Installer, portable, CLI and metadata are checked before release."
      ]
    }
  }
};

export function initCharts() {
  const buttons = document.querySelectorAll('.benchmark-nav-btn');
  const container = document.getElementById('eval-bars-container');
  if (!container || !buttons.length) return;
  let selection = 'swe';
  function render() {
    const entry = details[getLang()]?.[selection] || details.es.swe;
    document.getElementById('eval-title').textContent = entry.title;
    document.getElementById('eval-unit').textContent = '1.0.0';
    document.getElementById('eval-stat-num').textContent = entry.label;
    document.getElementById('eval-stat-label').textContent = entry.summary;
    container.replaceChildren();
    const list = document.createElement('ul');
    list.className = 'release-facts';
    entry.items.forEach(function (text) { const item = document.createElement('li'); item.textContent = text; list.appendChild(item); });
    container.appendChild(list);
    buttons.forEach(function (button) { const active = button.dataset.metric === selection; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  }
  buttons.forEach(function (button) { button.addEventListener('click', function () { selection = button.dataset.metric; render(); }); });
  window.addEventListener('tiancode:langchange', render);
  render();
}
