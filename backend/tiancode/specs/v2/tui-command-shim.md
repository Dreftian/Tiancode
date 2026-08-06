# TUI Command Shim Removal

Problem:

- v1 keeps a deprecated `api.command` TUI plugin shim so older plugins do not fail during initialization
- v2 should expose only the keymap command API
- tests and fixtures should not encode legacy command behavior as expected behavior

## Remove Public Types

In `backend/plugin/src/tui.ts`, remove:

- `TuiCommand`
- `TuiCommandApi`
- `TuiPluginApi.command`

Keep `api.keymap` as the only TUI command registration and execution surface.

## Remove Runtime Shim

Delete `backend/tiancode/src/cli/cmd/tui/plugin/command-shim.ts`.

In `backend/tiancode/src/cli/cmd/tui/plugin/api.tsx`, remove:

- the `createCommandShim` import
- the `command: createCommandShim(...)` field from `createTuiApi(...)`

In `backend/tiancode/src/cli/cmd/tui/plugin/runtime.ts`, remove:

- the `createCommandShim` import
- the `command: createCommandShim(...)` field from `pluginApi(...)`

## Migration Target

Plugin authors should replace old calls with keymap calls:

```ts
api.keymap.registerLayer({
  commands: [
    {
      name: "plugin.command",
      title: "Plugin Command",
      namespace: "palette",
      slashName: "plugin",
      run() {
        api.ui.dialog.clear()
      },
    },
  ],
  bindings: [{ key: "ctrl+shift+p", cmd: "plugin.command" }],
})
```

Direct replacements:

- `api.command.register(cb)` -> `api.keymap.registerLayer({ commands, bindings })`
- `api.command.trigger(name)` -> `api.keymap.dispatchCommand(name)`
- `api.command.show()` -> `api.keymap.dispatchCommand("command.palette.show")`
- `onSelect(dialog)` -> use `api.ui.dialog` from the plugin API closure

## Verification

After removal, run from package directories:

- `bun typecheck` in `backend/plugin`
- `bun typecheck` in `backend/tiancode`
- TUI plugin loader tests in `backend/tiancode` if runtime plugin API wiring changed
