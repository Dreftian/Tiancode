// El script que el agente ejecuta dentro de la página de la Vista en vivo.
//
// Se envía como texto al proceso principal, que lo evalúa en el frame real (el renderer no
// puede: la vista previa es de origen cruzado). El resultado es siempre una cadena legible,
// pensada para que un modelo entienda la pantalla sin ver un píxel: qué hay escrito, qué se
// puede pulsar y con qué referencia, y qué ha fallado en la consola.
//
// El formato del informe sigue lo que browser-use (MIT) demostró que funciona: referencias que
// no cambian entre informes, los elementos nuevos marcados, primero lo que está a la vista y
// avisos de lo que está tapado o fuera de pantalla, para que un clic no "funcione" sobre algo
// que el usuario no podría pulsar.

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
// Una referencia se asigna una vez por elemento y no se reutiliza: "e12" sigue siendo el mismo
// botón en el siguiente informe, o deja de existir.
store.ids = store.ids || new WeakMap();
store.seen = store.seen || new Set();

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
  const wrapping = el.closest && el.closest("label");
  if (wrapping && wrapping !== el && /^(input|select|textarea)$/i.test(el.tagName)) {
    const text = clean(wrapping.textContent);
    if (text) return text.slice(0, 120);
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
  'a[href], button, input:not([type=hidden]), select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"]), [role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=checkbox], [role=radio], [role=switch], [role=option], [role=textbox], [role=searchbox], [role=combobox], [role=slider], [role=spinbutton], [role=treeitem], [onclick], [data-action]';

// querySelectorAll stops at shadow roots; web components keep their controls behind one.
const deepAll = (root, selector) => {
  const found = Array.prototype.slice.call(root.querySelectorAll(selector));
  const hosts = root.querySelectorAll("*");
  for (const host of hosts) if (host.shadowRoot) found.push.apply(found, deepAll(host.shadowRoot, selector));
  return found;
};

const refFor = (node) => {
  let ref = store.ids.get(node);
  if (!ref) {
    store.seq += 1;
    ref = "e" + store.seq;
    store.ids.set(node, ref);
  }
  store.refs.set(ref, node);
  return ref;
};

// True when ancestor contains node, also across shadow roots.
const within = (ancestor, node) => {
  for (let current = node; current; current = current.parentNode || current.host) if (current === ancestor) return true;
  return false;
};

const short = (node) => {
  const name = clean(nameOf(node)).slice(0, 40);
  return node.tagName.toLowerCase() + (name ? " " + JSON.stringify(name) : "");
};

const reaches = (node, x, y) => {
  const hit = document.elementFromPoint(x, y);
  return !!hit && (within(node, hit) || within(hit, node));
};

// Scrolled out of its own container (a chat log, a sidebar list): visible to CSS, not to people.
const clipped = (node, x, y) => {
  for (let parent = node.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const box = parent.getBoundingClientRect();
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return true;
  }
  return false;
};

// Where the element is for someone looking at the page. "" plus a point that reaches it when it
// can be clicked as is; it only counts as covered when none of five points reaches it, so a
// floating composer over half of a list does not hide the whole list.
const placement = (node) => {
  const rect = node.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) return { where: "fuera de vista" };
  const clampX = (value) => Math.min(Math.max(value, 0), window.innerWidth - 1);
  const clampY = (value) => Math.min(Math.max(value, 0), window.innerHeight - 1);
  const points = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map((f) => [clampX(rect.left + rect.width * f[0]), clampY(rect.top + rect.height * f[1])]);
  if (clipped(node, points[0][0], points[0][1])) return { where: "fuera de vista" };
  const free = points.find((point) => reaches(node, point[0], point[1]));
  if (free) return { where: "", x: free[0], y: free[1] };
  const hit = document.elementFromPoint(points[0][0], points[0][1]);
  return { where: "tapado por " + (hit ? short(hit) : "otro elemento") };
};

const describe = (node, ref) => {
  const tag = node.tagName.toLowerCase();
  const role = (node.getAttribute && node.getAttribute("role")) || (tag === "a" ? "link" : tag === "button" ? "button" : tag);
  const bits = [ref, role, JSON.stringify(nameOf(node))];
  if (node.disabled || (node.getAttribute && node.getAttribute("aria-disabled") === "true")) bits.push("disabled");
  if (tag === "input" || tag === "textarea") {
    bits.push("type=" + (node.getAttribute("type") || "text"));
    if (node.type === "checkbox" || node.type === "radio") bits.push(node.checked ? "checked" : "unchecked");
    else if (isSecret(node)) bits.push(node.value ? "value=(oculto)" : "value=(vacío)");
    else if (node.value) bits.push("value=" + JSON.stringify(clean(node.value).slice(0, 80)));
    if (node.required) bits.push("required");
    if (node.getAttribute("aria-invalid") === "true" || (node.validity && node.value && !node.validity.valid)) bits.push("invalid");
  }
  if (tag === "select") {
    const options = Array.prototype.slice.call(node.options).map((o) => o.value).slice(0, 20);
    bits.push("selected=" + JSON.stringify(node.value), "options=" + JSON.stringify(options));
  }
  if (node.getAttribute && node.getAttribute("aria-checked")) bits.push("checked=" + node.getAttribute("aria-checked"));
  if (node.getAttribute && node.getAttribute("aria-selected") === "true") bits.push("selected");
  if (node.getAttribute && node.getAttribute("aria-expanded")) bits.push("expanded=" + node.getAttribute("aria-expanded"));
  return bits.join(" ");
};

const collect = (root) => {
  const scope = root || document.body || document.documentElement;
  if (!scope) return [];
  for (const [ref, node] of store.refs) if (!node.isConnected) store.refs.delete(ref);
  const previous = store.seen;
  const seen = new Set();
  const inView = [];
  const offscreen = [];
  for (const node of deepAll(scope, INTERACTIVE)) {
    if (!visible(node)) continue;
    // A label or icon inside a link or button is the same target as its owner.
    const owner = node.parentElement && node.parentElement.closest("a[href], button");
    if (owner && visible(owner)) continue;
    // Focus traps and scroll wrappers: focusable through tabindex, but nothing to act on.
    if (/^(div|span)$/i.test(node.tagName) && !node.getAttribute("role") && !node.hasAttribute("onclick") && !node.hasAttribute("data-action") && !nameOf(node)) continue;
    const ref = refFor(node);
    seen.add(ref);
    const where = placement(node).where;
    const line = (previous.size && !previous.has(ref) ? "*" : "") + describe(node, ref) + (where ? " [" + where + "]" : "");
    (where === "fuera de vista" ? offscreen : inView).push(line);
  }
  store.seen = seen;
  const items = inView.concat(offscreen);
  store.total = items.length;
  return items.slice(0, LIMIT_ELEMENTS);
};

const scopeFor = (target) => {
  if (!target) return null;
  const el = resolve(target);
  return el || null;
};

const byText = (needle) => {
  const wanted = clean(needle).toLowerCase();
  if (!wanted) return null;
  const nodes = deepAll(document, INTERACTIVE).filter(visible);
  const exact = nodes.find((node) => clean(nameOf(node)).toLowerCase() === wanted);
  if (exact) return exact;
  const partial = nodes.find((node) => clean(nameOf(node)).toLowerCase().indexOf(wanted) !== -1);
  if (partial) return partial;
  const all = Array.prototype.slice.call(document.querySelectorAll("*")).filter(visible);
  return all.find((node) => clean(node.textContent).toLowerCase() === wanted) || null;
};

const isRef = (target) => /^e\\d+$/.test(target);

// A ref names one element. When that element is gone the action must say so, not quietly fall
// back to a text search for "e12" and act on something else.
const resolve = (target) => {
  if (!target) return null;
  if (isRef(target)) {
    const node = store.refs.get(target);
    return node && node.isConnected ? node : null;
  }
  try {
    const found = document.querySelector(target);
    if (found) return found;
  } catch (error) {
    // No era un selector CSS: se intenta como texto visible.
  }
  return byText(target);
};

const missing = (target) =>
  isRef(target)
    ? "La referencia " + target + " ya no existe en la página: cambió desde el último informe. Usa las referencias de este:"
    : "No encontré " + target + " en la pantalla.";

const pageText = () => {
  const body = document.body;
  const text = clean(body ? body.innerText : "");
  return text.length > LIMIT_TEXT ? text.slice(0, LIMIT_TEXT) + " …[texto recortado]" : text;
};

const scrollInfo = () => {
  const page = document.scrollingElement || document.documentElement;
  const screen = Math.max(window.innerHeight, 1);
  const above = page.scrollTop / screen;
  const below = Math.max(0, page.scrollHeight - page.scrollTop - screen) / screen;
  return "Desplazamiento: " + above.toFixed(1) + " pantallas por encima, " + below.toFixed(1) + " por debajo";
};

const snapshot = (note, root) => {
  const lines = [];
  if (note) lines.push(note, "");
  lines.push("URL: " + location.href);
  lines.push("Título: " + (document.title || "(sin título)"));
  const navigation = typeof performance.getEntriesByType === "function" && performance.getEntriesByType("navigation")[0];
  if (navigation && navigation.responseStatus) lines.push("Estado HTTP: " + navigation.responseStatus);
  // Text sent without a charset is read as windows-1252, which turns "á" into "Ã¡": say so instead
  // of letting the agent chase a bug in its own strings.
  const charset = (document.characterSet || "").toUpperCase();
  if (charset && charset !== "UTF-8") {
    lines.push("Codificación: " + charset + ". Si el texto muestra caracteres como Ã© o â€, el servidor no declara UTF-8: añade <meta charset=utf-8> al principio del <head> o usa la vista previa de Tiancode, que lo envía.");
  } else if (/Ã[\u0080-\u00BF]|â€/.test(document.title + " " + (document.body ? document.body.innerText.slice(0, 2000) : ""))) {
    lines.push("Aviso: el texto parece mal codificado (Ã©, â€…); el archivo pudo guardarse con otra codificación que no es UTF-8.");
  }
  lines.push(scrollInfo());
  const dialog = document.querySelector('[role=dialog], dialog[open]');
  if (dialog && visible(dialog)) lines.push("Diálogo abierto: " + JSON.stringify(clean(nameOf(dialog)).slice(0, 120)));
  lines.push("");
  lines.push("Texto visible:");
  lines.push(pageText() || "(la página no muestra texto)");
  lines.push("");
  const items = collect(root);
  const total = store.total || items.length;
  lines.push("Elementos interactivos (" + items.length + (total > items.length ? " de " + total + ", recortado" : "") + "):");
  lines.push("Las referencias se mantienen entre informes. * = nuevo desde el anterior; [fuera de vista] = desplázate antes; [tapado por …] = otro elemento lo cubre.");
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

// The events a real press produces, in order: menus and popovers built on pointerdown react to
// this where a bare el.click() does nothing.
const press = (el, point) => {
  const rect = el.getBoundingClientRect();
  const x = point && typeof point.x === "number" ? point.x : rect.left + rect.width / 2;
  const y = point && typeof point.y === "number" ? point.y : rect.top + rect.height / 2;
  const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y };
  const Pointer = window.PointerEvent || window.MouseEvent;
  el.dispatchEvent(new Pointer("pointerdown", Object.assign({ pointerType: "mouse", isPrimary: true }, init)));
  el.dispatchEvent(new MouseEvent("mousedown", init));
  el.focus && el.focus();
  el.dispatchEvent(new Pointer("pointerup", Object.assign({ pointerType: "mouse", isPrimary: true }, init)));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.click();
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
          if (${target} && !root) return missing(${target}) + "\\n\\n" + snapshot();
          return snapshot(null, root);
        `
      case "click":
        return `
          const el = resolve(${target});
          if (!el) return missing(${target}) + "\\n" + collect().join("\\n");
          if (el.disabled || el.getAttribute("aria-disabled") === "true") return "El elemento " + ${target} + " está deshabilitado, así que un clic no hace nada.";
          el.scrollIntoView({ block: "center", inline: "center" });
          await settle(60);
          const spot = placement(el);
          if (spot.where.indexOf("tapado") === 0) return snapshot("No pulsé " + JSON.stringify(nameOf(el) || ${target}) + ": está " + spot.where + ". Ciérralo o resuelve lo que lo cubre y vuelve a intentarlo.");
          press(el, spot);
          await settle(450);
          return snapshot("Pulsado: " + JSON.stringify(nameOf(el) || ${target}));
        `
      case "fill":
        return `
          const el = resolve(${target});
          if (!el) return missing(${target}) + "\\n" + collect().join("\\n");
          el.scrollIntoView({ block: "center" });
          el.focus && el.focus();
          if (el.isContentEditable) {
            // Rich editors keep their own model: typing through the editing pipeline updates it,
            // overwriting textContent does not.
            const range = document.createRange();
            range.selectNodeContents(el);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            const typed = document.execCommand && document.execCommand("insertText", false, ${value});
            if (!typed) {
              el.textContent = ${value};
              el.dispatchEvent(new Event("input", { bubbles: true }));
            }
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
          if (!el) return missing(${target});
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
          if (!el) return missing(${target});
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
          if (${target} && !el) return missing(${target});
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
