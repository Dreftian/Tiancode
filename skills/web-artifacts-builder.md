---
name: web-artifacts-builder
description: Build elaborate, self-contained interactive web artifacts using modern frontend technologies (React, Tailwind CSS, Vite/Parcel bundling) with clean, professional aesthetics.
tags: ["artifacts", "react", "tailwind", "bundling", "ui-components"]
---

# Web Artifacts Builder

Guidelines and patterns for building interactive, single-file HTML applications, rich data dashboards, and functional UI prototypes that render smoothly inline or as standalone artifacts.

## 1. Quality & Design Standards
- **Avoid AI Slop Aesthetics**: Do not default to generic centered cards, heavy neon purple gradients, or arbitrary border radiuses. Use authentic, purpose-driven layouts with balanced hierarchy.
- **Self-Contained Bundling**: All scripts, styles, fonts, and icons should be bundled or loaded from reliable CDNs so the artifact runs offline or across disparate sandbox environments.
- **Interactivity & State**: Use React state hooks or lightweight stores (e.g. Zustand) to provide rich, responsive user feedback.

---

## 2. Modern Single-File HTML/React Pattern

When bundling into an all-in-one HTML artifact:

```html
<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Interactive Artifact</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body class="h-full bg-slate-950 text-slate-100 antialiased selection:bg-cyan-500 selection:text-white">
  <div id="root" class="h-full"></div>

  <script type="text/babel">
    const { useState, useMemo } = React;

    function App() {
      const [filter, setFilter] = useState("");
      const [items, setItems] = useState([
        { id: 1, name: "Database Optimization", status: "Completed" },
        { id: 2, name: "Voice Worker Thread", status: "In Progress" },
        { id: 3, name: "PTY Tree Termination", status: "Queued" }
      ]);

      const filtered = useMemo(() => {
        return items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()));
      }, [items, filter]);

      return (
        <div class="max-w-4xl mx-auto p-6 space-y-6">
          <header class="flex items-center justify-between border-b border-slate-800 pb-4">
            <h1 class="text-xl font-bold tracking-tight">System Monitor</h1>
            <input
              type="text"
              placeholder="Filter tasks..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              class="px-3 py-1.5 rounded-md bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </header>
          <ul class="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
            {filtered.map(item => (
              <li key={item.id} class="p-4 flex items-center justify-between">
                <span class="font-medium text-slate-200">{item.name}</span>
                <span class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>
```

---

## 3. Checklist for Production Artifacts
1. Ensure full accessibility: readable contrast ratios, keyboard-navigable tabs, and semantic labels.
2. Clean teardown: clear any `setInterval` or animation frames in `useEffect` cleanup handlers.
3. Keep external dependencies minimal to maximize loading speed.
