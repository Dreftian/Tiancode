/* AI LIVE FRONTEND dashboard client — vanilla JS, offline, no external deps. */

"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  snapshot: null,          // latest full snapshot from SSE
  logsRendered: 0,         // how many log lines are already in the DOM
  treeRenderedKey: "",     // signature of the last rendered tree
  logScrolledToBottom: true,
};

const el = {
  connDot: $("conn-dot"),
  connText: $("conn-text"),
  sessionSelect: $("session-select"),
  phaseChip: $("phase-chip"),
  modeBadge: $("mode-badge"),
  rootPath: $("root-path"),
  fileCount: $("file-count"),
  fileTree: $("file-tree"),
  treeEmpty: $("tree-empty"),
  previewFrame: $("preview-frame"),
  previewEmpty: $("preview-empty"),
  previewLink: $("preview-link"),
  screenshotPane: $("screenshot-pane"),
  screenshotImg: $("screenshot-img"),
  screenshotMeta: $("screenshot-meta"),
  screenshotEmpty: $("screenshot-empty"),
  codeFile: $("code-file"),
  codeView: $("code-view"),
  codeEmpty: $("code-empty"),
  logView: $("log-view"),
  logCount: $("log-count"),
  logEmpty: $("log-empty"),
  logClear: $("log-clear"),
};

/* ---------------- helpers ---------------- */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function fmtTime(epoch) {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString([], { hour12: false });
}

function treeSignature(snapshot) {
  const files = snapshot ? snapshot.files : [];
  return files.length + ":" + files.map((f) => f.rel + ":" + f.mtime + ":" + f.size).join("|");
}

/* ---------------- renderers ---------------- */

function renderTop(snap) {
  if (!snap) {
    el.sessionSelect.innerHTML = "";
    el.rootPath.textContent = "";
    el.modeBadge.textContent = "web";
    el.phaseChip.textContent = "idle";
    el.phaseChip.className = "chip";
    return;
  }
  el.rootPath.textContent = snap.root;
  el.rootPath.title = snap.root;
  el.modeBadge.textContent = snap.mode;

  const phase = snap.phase || { name: "idle", status: "working" };
  el.phaseChip.textContent = phase.message
    ? phase.name + " · " + phase.status + " — " + phase.message
    : phase.name + " · " + phase.status;
  el.phaseChip.className = "chip " + (phase.status || "working");
}

function buildTree(files) {
  const root = { name: "", dirs: {}, files: [] };
  for (const f of files) {
    const parts = f.rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      node = node.dirs[dir] || (node.dirs[dir] = { name: dir, dirs: {}, files: [] });
    }
    node.files.push(f);
  }
  return root;
}

function renderTree(snap) {
  if (!snap || !snap.files.length) {
    el.fileTree.innerHTML = "";
    el.treeEmpty.classList.remove("hidden");
    el.fileCount.textContent = "";
    el.treeRenderedKey = "";
    return;
  }
  const key = treeSignature(snap);
  if (key === state.treeRenderedKey) return; // tree unchanged, keep DOM (keeps scrolled state)
  state.treeRenderedKey = key;

  el.treeEmpty.classList.add("hidden");
  el.fileCount.textContent = "(" + snap.file_count + ")";
  const root = buildTree(snap.files);
  const current = snap.current_file;
  const html = renderNodes(root.dirs, root.files, current);
  el.fileTree.innerHTML = html;
}

function renderNodes(dirs, files, current, parentPath) {
  const parts = [];
  for (const key of Object.keys(dirs).sort()) {
    const dir = dirs[key];
    const rel = parentPath ? parentPath + "/" + key : key;
    const inner = renderNodes(dir.dirs, dir.files, current, rel);
    parts.push(
      '<details><summary><span class="node dir"><span class="icon">📁</span><span class="fname">' +
        escapeHtml(key) +
        "</span></span></summary>" +
        inner +
        "</details>"
    );
  }
  for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const isCurrent = f.rel === current;
    parts.push(
      '<div class="node file' + (isCurrent ? " current" : "") + '" data-rel="' + escapeHtml(f.rel) +
        '" title="' + escapeHtml(f.rel) + '"><span class="icon">📄</span><span class="fname">' +
        escapeHtml(f.name) + '</span><span class="size">' + fmtSize(f.size) + "</span></div>"
    );
  }
  return parts.join("");
}

function renderPreview(snap) {
  // Sin preview_url externo, la sesión web con index.html se muestra en
  // /preview/ (servido por este mismo servidor, estilo Xcode: se refresca
  // solo conforme cambian los archivos).
  const url = snap ? (snap.preview_url || snap.preview_default) : null;
  if (url) {
    el.previewFrame.classList.remove("hidden");
    el.previewEmpty.classList.add("hidden");
    el.previewLink.classList.remove("hidden");
    el.previewLink.href = url;
    if (el.previewFrame.src !== url) el.previewFrame.src = url;
  } else {
    el.previewFrame.classList.add("hidden");
    el.previewEmpty.classList.remove("hidden");
    el.previewLink.classList.add("hidden");
  }
}

// Recarga el iframe del preview local (/preview/) tras cambios de archivos,
// debounced para no recargar a cada evento; el preview externo no se toca.
let previewReloadTimer = null;
function schedulePreviewReload() {
  const frame = el.previewFrame;
  if (frame.classList.contains("hidden") || !frame.src || frame.src.indexOf("/preview/") === -1) return;
  if (previewReloadTimer) clearTimeout(previewReloadTimer);
  previewReloadTimer = setTimeout(() => {
    if (!frame.classList.contains("hidden")) frame.src = frame.src;
  }, 400);
}

function renderScreenshot(snap) {
  const shot = snap ? snap.screenshot : null;
  if (shot && shot.data_base64) {
    el.screenshotPane.classList.remove("hidden");
    el.screenshotImg.src = "data:" + (shot.mime || "image/png") + ";base64," + shot.data_base64;
    el.screenshotMeta.textContent = fmtTime(shot.ts);
    el.screenshotEmpty.classList.add("hidden");
  } else if (snap && snap.mode === "desktop") {
    el.screenshotPane.classList.remove("hidden");
    el.screenshotImg.removeAttribute("src");
    el.screenshotMeta.textContent = "";
    el.screenshotEmpty.classList.remove("hidden");
  } else {
    el.screenshotPane.classList.add("hidden");
  }
}

function renderCode(snap) {
  if (!snap || !snap.current_file) {
    el.codeFile.textContent = "current file";
    el.codeView.textContent = "";
    el.codeEmpty.classList.remove("hidden");
    return;
  }
  el.codeEmpty.classList.add("hidden");
  el.codeFile.textContent = snap.current_file;
  el.codeView.textContent = snap.current_code != null ? snap.current_code : "(file unreadable)";
}

function renderLogs(snap) {
  const logs = snap ? snap.logs : [];
  el.logCount.textContent = "(" + logs.length + ")";
  if (!logs.length) {
    el.logView.innerHTML = "";
    el.logEmpty.classList.remove("hidden");
    state.logsRendered = 0;
    return;
  }
  el.logEmpty.classList.add("hidden");

  const before = el.logView.scrollHeight - el.logView.scrollTop - el.logView.clientHeight;
  state.logScrolledToBottom = before < 8;

  const frag = document.createDocumentFragment();
  for (let i = state.logsRendered; i < logs.length; i++) {
    const entry = logs[i];
    const line = document.createElement("span");
    line.className = "line";
    let html = "";
    if (entry.process_id != null) html += '<span class="pid">[' + escapeHtml(entry.process_id) + "]</span>";
    html += '<span class="ts">' + escapeHtml(fmtTime(entry.ts)) + "</span>";
    html += escapeHtml(entry.line);
    line.innerHTML = html;
    frag.appendChild(line);
  }
  el.logView.appendChild(frag);
  state.logsRendered = logs.length;

  if (state.logScrolledToBottom) el.logView.scrollTop = el.logView.scrollHeight;
}

function renderSessions(snapshot) {
  if (!snapshot || !snapshot.session_id) return;
  fetch("/api/sessions")
    .then((r) => r.json())
    .then((data) => {
      const current = snapshot.session_id;
      let changed = false;
      const options = (data.sessions || []).map((s) => {
        const selected = s.session_id === current ? " selected" : "";
        if (s.session_id === current && el.sessionSelect.value !== current) changed = true;
        return '<option value="' + escapeHtml(s.session_id) + '"' + selected + ">" +
          escapeHtml(s.label) + " · " + escapeHtml(s.mode) + "</option>";
      });
      el.sessionSelect.innerHTML = options.join("");
      if (changed) el.sessionSelect.value = current;
    })
    .catch(() => {});
}

function renderAll() {
  const snap = state.snapshot;
  renderTop(snap);
  renderTree(snap);
  renderPreview(snap);
  renderScreenshot(snap);
  renderCode(snap);
  renderLogs(snap);
  renderSessions(snap);
}

/* ---------------- SSE event application ---------------- */

function applyUpdate(event) {
  const snap = state.snapshot;
  if (!snap || event.session_id !== snap.session_id) return;
  const data = event.data || {};
  switch (event.type) {
    case "phase":
      snap.phase = data;
      renderTop(snap);
      break;
    case "preview":
      snap.preview_url = data.url;
      renderPreview(snap);
      break;
    case "current_file":
      snap.current_file = data.rel;
      snap.current_code = data.code;
      renderCode(snap);
      renderTree(snap);
      break;
    case "log":
      snap.logs.push(data);
      if (snap.logs.length > 2000) snap.logs.shift();
      renderLogs(snap);
      break;
    case "process":
      snap.processes[data.process_id] = data;
      break;
    case "screenshot":
      snap.screenshot = data;
      renderScreenshot(snap);
      break;
    case "file_added":
    case "file_modified":
    case "file_changed":
      snap.files = upsertFile(snap.files, data);
      snap.file_count = snap.files.length;
      renderTree(snap);
      schedulePreviewReload();
      break;
    case "file_removed":
      snap.files = snap.files.filter((f) => f.rel !== data.rel);
      snap.file_count = snap.files.length;
      renderTree(snap);
      break;
    case "tree_changed":
      break; // next snapshot event re-renders the tree
    default:
      break;
  }
}

function upsertFile(files, data) {
  const next = files.filter((f) => f.rel !== data.rel);
  next.push({ rel: data.rel, kind: data.kind, size: data.size, mtime: data.mtime });
  return next;
}

/* ---------------- SSE connection ---------------- */

function connectEvents() {
  const es = new EventSource("/events");
  es.addEventListener("snapshot", (e) => {
    state.snapshot = JSON.parse(e.data);
    renderAll();
  });
  es.addEventListener("update", (e) => {
    applyUpdate(JSON.parse(e.data));
  });
  es.onopen = () => {
    el.connDot.classList.add("on");
    el.connDot.classList.remove("off");
    el.connText.textContent = "live";
  };
  es.onerror = () => {
    el.connDot.classList.remove("on");
    el.connDot.classList.add("off");
    el.connText.textContent = "reconnecting";
    // EventSource auto-reconnects; nothing else to do here.
  };
}

/* ---------------- interactions ---------------- */

el.fileTree.addEventListener("click", (e) => {
  const node = e.target.closest(".node.file");
  if (!node) return;
  const rel = node.getAttribute("data-rel");
  if (!rel) return;
  fetch("/api/current_file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel }),
  }).catch(() => {});
});

el.sessionSelect.addEventListener("change", () => {
  const sessionId = el.sessionSelect.value;
  if (!sessionId) return;
  fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => {});
});

el.logClear.addEventListener("click", () => {
  if (state.snapshot) state.snapshot.logs = [];
  el.logView.innerHTML = "";
  state.logsRendered = 0;
  el.logCount.textContent = "(0)";
  el.logEmpty.classList.remove("hidden");
});

el.logView.addEventListener("scroll", () => {
  const before = el.logView.scrollHeight - el.logView.scrollTop - el.logView.clientHeight;
  state.logScrolledToBottom = before < 8;
});

/* ---------------- boot ---------------- */

connectEvents();
