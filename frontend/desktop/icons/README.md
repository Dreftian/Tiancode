# Tiancode desktop icons

The source of truth is `tools/script/regenerate-icons.py`. It draws the cat
face as high-contrast vector-like shapes, then creates the Windows ICO frames,
tray icon, macOS ICNS, mobile assets, and all `dev`, `beta`, and `prod`
channel copies.

Run the generator from the repository root:

```powershell
python tools/script/regenerate-icons.py
```

The icon is intentionally tested at 32 px during generation: the two eyes
must remain distinct so the Windows taskbar does not reduce the mark to an
abstract smile. `copy-icons.ts` copies the selected channel into
`resources/icons` during every desktop release build.
