// El script que el agente ejecuta dentro de la página de la Vista en vivo.
//
// Se envía como texto al proceso principal, que lo evalúa en el frame real (el renderer no
// puede: la vista previa es de origen cruzado). El resultado es siempre una cadena legible,
// pensada para que un modelo entienda la pantalla sin ver un píxel: qué hay escrito, qué se
// puede pulsar y con qué referencia, y qué ha fallado en la consola.

export type PreviewAgentAction = {
  type: "origin" | "inspect" | "click" | "fill" | "press" | "select" | "scroll" | "navigate"
  /**
   * Superficie destino. `preview` (por defecto) es la vista previa del proyecto y `browser` el
   * navegador integrado. No cambia el script: decide a qué frame lo manda el renderer.
   */
  surface?: "preview" | "browser"
  target?: string
  value?: string
  key?: string
  url?: string
  direction?: string
}

/** Tope del texto visible devuelto: suficiente para entender la pantalla sin llenar el contexto. */
const TEXT_LIMIT = 4000
const ELEMENT_LIMIT = 120

/**
 * Cuerpo compartido: helpers de inspección y resolución de elementos.
 *
 * Vive como texto porque se evalúa en otro contexto de JavaScript; por eso también se escribe
 * sin dependencias y sin sintaxis que un `<script>` antiguo no entienda.
 */
const RUNTIME = `
const LIMIT_TEXT = ${TEXT_LIMIT};
const LIMIT_ELEMENTS = ${ELEMENT_LIMIT};

const store = (window.__tiancodeAgent = window.__tiancodeAgent || { refs: new Map(), seq: 0, logs: [] });

if (!store.hooked) {
  store.hooked = true;
  const record = (level, text) => {
    if (!text) return;
    store.logs.push(level + ": " + String(text).slice(0, 400));
    if (store.logs.length > 50) store.logs.shift();
  };
  window.addEventListener("error", (event) => record("error", event.message || String(event.error || "")));
  window.addEventListener("unhandledrejection", (event) => record("error", String((event.reason && event.reason.message) || event.reason || "")));
  const nativeError = console.error;
  console.error = function () {
    record("error", Array.prototype.map.call(arguments, (a) => (typeof a === "string" ? a : (a && a.message) || JSON.stringify(a))).join(" "));
    return nativeError.apply(console, arguments);
  };
  const nativeWarn = console.warn;
  console.warn = function () {
    record("warn", Array.prototype.map.call(arguments, (a) => (typeof a === "string" ? a : (a && a.message) || JSON.stringify(a))).join(" "));
    return nativeWarn.apply(console, arguments);
  };
}

const visible = (el) => {
  if (!el || !el.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
  return true;
};

const clean = (value) => String(value == null ? "" : value).replace(/\\s+/g, " ").trim();

// A password field's .value is the plaintext the user typed. It must never reach the snapshot,
// which goes into the transcript and to the model provider.
const isSecret = (el) => {
  if (!el || !el.getAttribute) return false;
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "password") return true;
  const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
  return auto === "current-password" || auto === "new-password" || auto === "one-time-code";
};

const nameOf = (el) => {
  const aria = el.getAttribute && el.getAttribute("aria-label");
  if (aria) return clean(aria);
  const labelledBy = el.getAttribute && el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelled = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)).filter(Boolean);
    if (labelled.length) return clean(labelled.map((node) => node.textContent).join(" "));
  }
  if (el.id) {
    const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (label) return clean(label.textContent);
  }
  const text = clean(el.innerText || el.textContent);
  if (text) return text.slice(0, 120);
  const attrs = isSecret(el) ? ["placeholder", "title", "alt", "name"] : ["placeholder", "title", "alt", "name", "value"];
  for (const attr of attrs) {
    const found = el.getAttribute && el.getAttribute(attr);
    if (found) return clean(found).slice(0, 120);
  }
  return "";
};

const INTERACTIVE =
  'a[href], button, input:not([type=hidden]), select, textarea, summary, [contenteditable=""], [contenteditable="true"], [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=option], [onclick], [data-action]';

const collect = (root) => {
  store.refs = new Map();
  store.seq = 0;
  const scope = root || document.body || document.documentElement;
  const nodes = scope ? Array.prototype.slice.call(scope.querySelectorAll(INTERACTIVE)) : [];
  const items = [];
  for (const node of nodes) {
    if (!visible(node)) continue;
    store.seq += 1;
    const ref = "e" + store.seq;
    store.refs.set(ref, node);
    const tag = node.tagName.toLowerCase();
    const role = (node.getAttribute && node.getAttribute("role")) || (tag === "a" ? "link" : tag === "button" ? "button" : tag);
    const bits = [ref, role, JSON.stringify(nameOf(node))];
    if (node.disabled) bits.push("disabled");
    if (tag === "input" || tag === "textarea") {
      bits.push("type=" + (node.getAttribute("type") || "text"));
      if (node.type === "checkbox" || node.type === "radio") bits.push(node.checked ? "checked" : "unchecked");
      else if (isSecret(node)) bits.push(node.value ? "value=(oculto)" : "value=(vacío)");
      else if (node.value) bits.push("value=" + JSON.stringify(clean(node.value).slice(0, 80)));
    }
    if (tag === "select") {
      const options = Array.prototype.slice.call(node.options).map((o) => o.value).slice(0, 20);
      bits.push("selected=" + JSON.stringify(node.value), "options=" + JSON.stringify(options));
    }
    if (node.getAttribute && node.getAttribute("aria-selected") === "true") bits.push("selected");
    if (node.getAttribute && node.getAttribute("aria-expanded")) bits.push("expanded=" + node.getAttribute("aria-expanded"));
    items.push(bits.join(" "));
    if (items.length >= LIMIT_ELEMENTS) break;
  }
  return items;
};

const scopeFor = (target) => {
  if (!target) return null;
  const el = resolve(target);
  return el || null;
};

const byText = (needle) => {
  const wanted = clean(needle).toLowerCase();
  if (!wanted) return null;
  const nodes = Array.prototype.slice.call(document.querySelectorAll(INTERACTIVE)).filter(visible);
  const exact = nodes.find((node) => clean(nameOf(node)).toLowerCase() === wanted);
  if (exact) return exact;
  const partial = nodes.find((node) => clean(nameOf(node)).toLowerCase().indexOf(wanted) !== -1);
  if (partial) return partial;
  const all = Array.prototype.slice.call(document.querySelectorAll("*")).filter(visible);
  return all.find((node) => clean(node.textContent).toLowerCase() === wanted) || null;
};

const resolve = (target) => {
  if (!target) return null;
  if (/^e\\d+$/.test(target) && store.refs.has(target)) return store.refs.get(target);
  try {
    const found = document.querySelector(target);
    if (found) return found;
  } catch (error) {
    // No era un selector CSS: se intenta como texto visible.
  }
  return byText(target);
};

const pageText = () => {
  const body = document.body;
  const text = clean(body ? body.innerText : "");
  return text.length > LIMIT_TEXT ? text.slice(0, LIMIT_TEXT) + " …[texto recortado]" : text;
};

const snapshot = (note, root) => {
  const lines = [];
  if (note) lines.push(note, "");
  lines.push("URL: " + location.href);
  lines.push("Título: " + (document.title || "(sin título)"));
  const dialog = document.querySelector('[role=dialog], dialog[open]');
  if (dialog && visible(dialog)) lines.push("Diálogo abierto: " + JSON.stringify(clean(nameOf(dialog)).slice(0, 120)));
  lines.push("");
  lines.push("Texto visible:");
  lines.push(pageText() || "(la página no muestra texto)");
  lines.push("");
  const items = collect(root);
  lines.push("Elementos interactivos (" + items.length + (items.length >= LIMIT_ELEMENTS ? "+, recortado" : "") + "):");
  lines.push(items.length ? items.join("\\n") : "(ninguno visible)");
  if (store.logs.length) {
    lines.push("");
    lines.push("Consola:");
    lines.push(store.logs.slice(-15).join("\\n"));
  }
  return lines.join("\\n");
};

const settle = (ms) => new Promise((done) => setTimeout(done, ms));

const setNativeValue = (el, value) => {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && descriptor.set) descriptor.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
};
`

function literal(value: unknown) {
  return JSON.stringify(value ?? null)
}

/**
 * Construye el script de una acción. El resultado de la evaluación es siempre una cadena: el
 * informe que lee el agente.
 */
export function buildPreviewAgentScript(action: PreviewAgentAction): string {
  // La sonda de origen está pensada para correr ANTES del permiso, así que va sola: sin el RUNTIME
  // no engancha la consola de la página ni toca nada suyo, sólo dice qué página es para poder
  // preguntar por ella. Aún no la emite nadie — ver PreviewActionSurface en agent-bridge.ts.
  if (action.type === "origin") return `(() => location.href)()`

  const target = literal(action.target ?? "")
  const value = literal(action.value ?? "")
  const key = literal(action.key ?? "Enter")
  const url = literal(action.url ?? "")
  const direction = literal((action.direction ?? "down").toLowerCase())

  const body = (() => {
    switch (action.type) {
      case "inspect":
        return `
          const root = scopeFor(${target});
          if (${target} && !root) return "No encontré " + ${target} + " en la pantalla.\\n\\n" + snapshot();
          return snapshot(null, root);
        `
      case "click":
        return `
          const el = resolve(${target});
          if (!el) return "No encontré " + ${target} + " en la pantalla. Elementos disponibles:\\n" + collect().join("\\n");
          if (el.disabled) return "El elemento " + ${target} + " está deshabilitado, así que un clic no hace nada.";
          el.scrollIntoView({ block: "center", inline: "center" });
          el.focus && el.focus();
          el.click();
          await settle(450);
          return snapshot("Pulsado: " + JSON.stringify(nameOf(el) || ${target}));
        `
      case "fill":
        return `
          const el = resolve(${target});
          if (!el) return "No encontré el campo " + ${target} + ". Campos disponibles:\\n" + collect().join("\\n");
          el.scrollIntoView({ block: "center" });
          el.focus && el.focus();
          if (el.isContentEditable) {
            el.textContent = ${value};
            el.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            setNativeValue(el, ${value});
          }
          await settle(250);
          const echo = isSecret(el) ? "(oculto)" : JSON.stringify(${value});
          return snapshot("Escrito en " + JSON.stringify(nameOf(el) || ${target}) + ": " + echo);
        `
      case "select":
        return `
          const el = resolve(${target});
          if (!el) return "No encontré el desplegable " + ${target} + ".";
          if (el.tagName.toLowerCase() !== "select") return "El elemento " + ${target} + " no es un <select>; usa click sobre la opción.";
          const wanted = ${value};
          const option = Array.prototype.find.call(el.options, (o) => o.value === wanted || clean(o.textContent) === clean(wanted));
          if (!option) return "El desplegable no tiene la opción " + JSON.stringify(wanted) + ". Opciones: " + Array.prototype.map.call(el.options, (o) => o.value).join(", ");
          el.value = option.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          await settle(300);
          return snapshot("Elegido " + JSON.stringify(option.value));
        `
      case "press":
        return `
          const el = ${target} ? resolve(${target}) : document.activeElement || document.body;
          if (!el) return "No encontré " + ${target} + " para enviarle la tecla.";
          el.focus && el.focus();
          const init = { key: ${key}, code: ${key}, bubbles: true, cancelable: true };
          el.dispatchEvent(new KeyboardEvent("keydown", init));
          el.dispatchEvent(new KeyboardEvent("keypress", init));
          el.dispatchEvent(new KeyboardEvent("keyup", init));
          if (${key} === "Enter" && el.form && typeof el.form.requestSubmit === "function") el.form.requestSubmit();
          await settle(400);
          return snapshot("Tecla enviada: " + ${key});
        `
      case "scroll":
        return `
          const el = ${target} ? resolve(${target}) : null;
          const box = el || document.scrollingElement || document.documentElement;
          const dir = ${direction};
          if (dir === "top") box.scrollTop = 0;
          else if (dir === "bottom") box.scrollTop = box.scrollHeight;
          else box.scrollTop = box.scrollTop + (dir === "up" ? -1 : 1) * Math.round((box.clientHeight || 600) * 0.8);
          await settle(250);
          return snapshot("Desplazado: " + dir);
        `
      case "navigate":
        return `
          const next = ${url};
          if (!next) return "Falta la URL o ruta para navegar.";
          let resolved;
          try { resolved = new URL(next, location.href); } catch (error) { return "URL inválida: " + next; }
          if (resolved.origin !== location.origin) return "Sólo puedo navegar dentro de la propia app (" + location.origin + ").";
          setTimeout(() => { location.href = resolved.href; }, 30);
          return "Navegando a " + resolved.href + ". Vuelve a llamar a preview_inspect en un momento para ver la pantalla nueva.";
        `
      default:
        return `return "Acción no soportada."`
    }
  })()

  return `(async () => {
${RUNTIME}
${body}
})()`
}
