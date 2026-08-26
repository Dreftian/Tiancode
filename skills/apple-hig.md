---
name: apple-hig
description: Design and build apps that feel native to Apple platforms following the Human Interface Guidelines. Covers iOS/iPadOS, macOS, watchOS, visionOS, and tvOS conventions: SF typography scales, SF Symbols usage rules, system colors and materials, layout metrics and safe areas, platform navigation patterns, Liquid Glass app icons via Icon Composer, Dynamic Type and accessibility. Use when the user requests an Apple-style, iOS-style, macOS-style, or HIG-compliant interface, asks about SF Symbols or SF Pro, or wants guidance on Apple design templates and UI kits.
icon: models
---

# Apple Human Interface Guidelines

## Core Direction

Apple platforms read as native when four things hold: content is the hero, hierarchy comes
from type weight and scale rather than decoration, system materials and colors replace custom
chrome, and every interaction matches the conventions of the platform it runs on. Clarity,
deference, and depth remain the three pillars: text is legible at every size, interfaces defer
to content instead of competing with it, and motion plus layering communicate hierarchy.

When adapting an existing web or desktop product toward an Apple look, do not paint a frame.
Rebuild the information architecture the way the platform would: navigation pattern first,
then type scale, then controls, then materials, then icons.

## Platform Targets

Decide the target before designing; conventions diverge sharply:

| Platform | Primary navigation | Idiom | Notes |
| --- | --- | --- | --- |
| iOS / iPadOS | Tab bar (bottom) + navigation stack | Touch-first, 44pt targets | iPad adds sidebar; support Split View and Stage Manager |
| macOS | Window toolbar + sidebar (NSToolbar style) | Pointer-first, dense | Menus matter; support full keyboard access |
| watchOS | Vertical paging, digital crown | Glanceable | Design for 3 contrast tiers, not screens |
| visionOS | Windows in space, ornaments, gaze+pinch | Spatial | Comfort over density; glass materials |
| tvOS | Full-screen focus engine | 10-foot distance | Motion and parallax carry hierarchy |

Never mix idioms across platforms: a bottom tab bar inside a macOS window reads as a port,
not as a Mac app.

## Typography — San Francisco

Use the system font stack so the platform provides SF Pro automatically:

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif;
```

- iOS body text is **17pt SF Pro Text regular**; large title 34pt bold; titles use Text styles,
  not ad-hoc sizes. Headlines above ~20pt switch to the Display optical size automatically.
- macOS standard control text is **13pt**; window titles 13–15pt semibold.
- Prefer **semantic text styles** (`title`, `headline`, `body`, `callout`, `footnote`,
  `caption1/2`) over fixed pixel values so **Dynamic Type** scales everything.
- Line height ≈ 1.2 for headings, 1.45 for body. Tracking tightens slightly as size grows
  (the system handles this for `-apple-system`).
- Serif alternative for reading surfaces: **New York** (`ui-serif`). Monospace:
  **SF Mono** (never ship it as a UI font; use `ui-monospace`).
- Minimum body size 11pt (captions only); never below 9pt.

### Type scale quick reference (iOS, default Large)

| Style | Size / Weight | Use |
| --- | --- | --- |
| Large Title | 34 / Bold | Screen entry point |
| Title 1 / 2 / 3 | 28 / 22 / 20 semibold | Section headers |
| Headline | 17 / Semibold | Emphasis within body |
| Body | 17 / Regular | Default reading |
| Callout | 16 / Regular | Secondary |
| Subhead / Footnote | 15 / 13 | Metadata |
| Caption 1 / 2 | 12 / 11 | Legal, timestamps |

## SF Symbols

SF Symbols is not an icon pack; it is typography. Over 7,000 glyphs ship in nine weights and
three scales that optically match the SF fonts.

Rules that keep symbols native:

- Always pair symbol weight with adjacent text weight (`symbolRenderingMode`, matching
  `fontWeight`) — a medium symbol beside a semibold label looks broken.
- Use hierarchical and palette rendering modes for multi-layer meaning; monochrome by default.
- Respect **baseline alignment**: symbols align to text cap heights, not boxes. In CSS, align
  with `vertical-align: -0.08em`-style optical corrections rather than flex centering.
- Never stretch, recolor into brand palettes casually, or mix families (one glyph set per
  interface). Export custom symbols with the SF Symbols app template so animation and RTL
  variants survive.
- Download the **SF Symbols app** (macOS) to browse and export; reference names are stable
  APIs (`chevron.left`, `square.and.arrow.up`).

## Color and Materials

- Prefer **system semantic colors** over hex: `systemBackground`, `secondarySystemBackground`,
  `label`, `secondaryLabel`, `separator`, `tintColor`. They adapt to Dark Mode and High Contrast
  automatically. In CSS approximations: label `#000`/`#FFF`, secondary `rgba(60,60,67,.6)` light /
  `rgba(235,235,245,.6)` dark, separator `rgba(60,60,67,.29)` / `rgba(84,84,88,.6)`.
- System accent colors have defined pairs (blue `#007AFF` light / `#0A84FF` dark, etc.). One tint
  per app; reserve red/green for destructive/success semantics.
- **Materials** (vibrancy/blur) sit between background and content — `backdrop-filter` with the
  platform's saturate-plus-blur recipe (`backdrop-filter: blur(20px) saturate(180%)`) reads more
  native than flat translucency.
- Dark Mode is not inverted light: elevate surfaces *lighter* as they rise (`#000` → `#1C1C1E` →
  `#2C2C2E`), reduce pure white text to `#EBEBF5`-range opacities, and re-tune shadows (they
  barely register; rely on elevation of fill).
- **Liquid Glass** (2025 design language): layered, specular material for controls and chrome;
  keep content on standard materials and glass only on interactive layers.

## Layout Metrics

- Base grid: **8pt** (half-steps of 4pt for fine alignment).
- iOS horizontal margin: **16pt** phone, **20pt+** iPad; macOS window content inset 20pt.
- Minimum touch target **44×44pt** (iOS), 28pt pointer minimum macOS; keep destructive controls
  far from frequent ones.
- Safe areas are mandatory context: respect `env(safe-area-inset-*)`; home indicator adds 34pt
  bottom inset; notch adds ~47/59pt top depending on device.
- Cards and groups: continuous-corner rounded rects, 10–16pt radius grouped-list style;
  inset grouped lists use 10pt cell radius with 8–10pt side insets.
- Motion: spring-based, 250–400ms, interruptible; fades and small transforms beat slides for
  state changes. Respect Reduce Motion.

## Navigation Patterns

- **iOS**: tab bar (≤5 items, no page dots) for peer destinations; push navigation with
  leading back-chevron and centered title; swipe-from-left-edge always pops. Modality
  (sheets) is for focused tasks, not navigation; page sheets carry a grabber and rounded top.
- **iPadOS**: prefer sidebar (list) + detail split; tabs exist but sidebars dominate wide idiom.
- **macOS**: toolbar actions live top-right; settings in a toolbar-driven window with sidebar
  categories; every menu-bar command mirrors a shortcut. Window traffic lights stay untouched.
- Sheets/alerts: alerts are rare, two-button max preferred, verb-labeled buttons ("Erase",
  never "OK/Cancel" ambiguity); the destructive action is red and non-default.

## App Icons — Icon Composer

Modern pipeline (replaces static PNG grids):

1. Design one **layered** icon in **Icon Composer** (macOS Sequoia+): background, middle,
   foreground layers export as a single `.icon` file with Liquid Glass rendering, specular
   highlights, and appearance states (dark/tinted) annotated per layer.
2. Canvas: **1024×1024**; keep critical content inside the safe area (icons get a superellipse
   mask applied by the system — never pre-round corners, never pre-add shadow).
3. Export flattened marketing PNGs from Icon Composer only when needed outside Xcode.
4. Web/PWA fallback: provide 180×180 `apple-touch-icon.png` (opaque, no transparency).

## Accessibility (non-negotiable)

- Support **Dynamic Type** up to accessibility sizes: layouts reflow (stack vertically), never
  truncate primary content.
- Contrast: 4.5:1 body, 3:1 large text and UI components. Test with Increased Contrast on.
- Every interactive element needs an accessibility label; decorative images hide from
  assistive tech. Hit-area ≥ target even when the visual is smaller (`contentShape`).
- VoiceOver order follows layout order — audit focus sequence, group related elements
  (`aria-labelledby` analogs), and announce state changes politely.
- Motion: honor Reduce Motion/Transparency; provide haptic-equivalent feedback where supported.

## Official Resources

Design against the real artifacts rather than memory:

| Resource | Link |
| --- | --- |
| Human Interface Guidelines | https://developer.apple.com/design/human-interface-guidelines/ |
| iOS 27 & iPadOS 27 UI Kit (Figma) | https://www.figma.com/community/file/1651309003795292092/ios-and-ipados-27 |
| macOS 27 UI Kit (Figma) | https://www.figma.com/community/file/1651309434229735362/macos-27 |
| watchOS 26 UI Kit (Figma) | https://www.figma.com/community/file/1540060090060216489/watchos-26 |
| visionOS 26 UI Kit (Figma) | https://www.figma.com/community/file/1540071341298017505/visionos-26 |
| App Icon Template (iOS/iPadOS/watchOS 27, Figma) | https://www.figma.com/community/file/1645923469870515372/app-icon-template-ios-ipados-and-watchos-27 |
| All downloads index (fonts, bezels, templates) | https://developer.apple.com/design/resources/ |
| SF Pro / SF Compact / SF Mono / New York fonts | https://developer.apple.com/design/resources/#fonts |
| SF Symbols app | https://developer.apple.com/sf-symbols/ |
| Icon Composer | https://developer.apple.com/icon-composer/ |

Licensing note: SF fonts and Apple UI kits are licensed for designing apps for Apple
platforms only — they may not be redistributed inside other products or used for
non-Apple targets. On non-Apple platforms approximate SF Pro with Inter/SF-style
metrics instead of shipping Apple's binaries.

## Workflow

1. **Identify platform + idiom** (table above); pick navigation pattern before pixels.
2. **Start from the official UI kit** when one exists — copy component dimensions rather
   than eyeballing screenshots.
3. Build the type ramp from semantic styles; wire Dynamic Type scaling early.
4. Apply system colors/materials; only then introduce brand tint (one accent).
5. Compose icons from SF Symbols; export custom symbols only when no glyph fits.
6. Produce the icon in Icon Composer (layered), flatten last.
7. Audit: Dynamic Type XXL, Dark Mode, Reduced Motion, VoiceOver pass, 44pt targets.
