import { getLang } from './i18n.js?v=1.0.0-r7';

const details = {
  es: {
    swe: { title: 'Modelos y especialistas', label: 'GGUF', summary: 'Un catálogo que refleja los modelos disponibles.', items: ['El borrado elimina las entradas antiguas de la interfaz.', 'Especialistas enfocados en desarrollo, pruebas, diseño, marketing y seguridad autorizada.', 'Los agentes personalizados y sus instrucciones se conservan.'] },
    latency: { title: 'Sigue el trabajo en el Sandbox', label: 'En vivo', summary: 'Actividad real de la sesión que estás viendo.', items: ['La vista previa sigue el proyecto correcto.', 'Las herramientas muestran su estado y los archivos que modifican.', 'Las recargas se agrupan al completar cambios; los errores se muestran en contexto.'] },
    tokens: { title: 'Instrucciones y controles más claros', label: 'Control', summary: 'Elige cómo trabajar con tu modelo.', items: ['Selector visible de micrófono y mantener pulsado para grabar.', 'Mejorar input usa el modelo seleccionado y permite deshacer.', 'Rápido está disponible con cualquier modelo; Ultracode usa el esfuerzo más alto compatible.'] },
    offline: { title: 'Actualiza conservando tu configuración', label: 'SHA-256', summary: 'Cada archivo se verifica antes de publicar.', items: ['Claves, ajustes, sesiones y autenticación MCP se conservan.', 'Una descarga fallida muestra un error y permite reintentar.', 'La versión estable se publica después de comprobar instalador, portable y metadatos.'] }
  },
  en: {
    swe: { title: 'Models and specialists', label: 'GGUF', summary: 'A catalog reflecting available models.', items: ['Deleting a model removes stale UI entries.', 'Focused specialists for development, tests, design, marketing and authorized security.', 'Custom agents and their instructions are preserved.'] },
    latency: { title: 'Follow work in the Sandbox', label: 'Live', summary: 'Real activity from the session you are viewing.', items: ['Preview follows the correct project.', 'Tools show their status and the files they change.', 'Reloads are coalesced after changes finish; errors appear in context.'] },
    tokens: { title: 'Clearer instructions and controls', label: 'Control', summary: 'Choose how to work with your model.', items: ['Visible microphone selector and hold-to-record.', 'Improve input uses the selected model and supports undo.', 'Fast is available for every model; Ultracode uses the highest compatible effort.'] },
    offline: { title: 'Update while keeping your settings', label: 'SHA-256', summary: 'Every file is verified before publication.', items: ['Provider keys, settings, sessions and MCP authentication are preserved.', 'A failed download shows an error and allows retrying.', 'The stable release is published after checking installer, portable and metadata.'] }
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
