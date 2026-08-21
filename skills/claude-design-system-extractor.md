---
name: claude-design-system-extractor
description: SkillUI Ultra engine for Claude. Reverse-engineers design systems from web apps, repositories, or HTML/CSS into structured tokens, typography, colors, animations, and component contracts for CLAUDE.md and DESIGN.md.
tags: ["claude", "design-system", "skillui", "ui-ux", "tokens"]
---

# Claude Design System Extractor (SkillUI Ultra)

Extracts and reverse-engineers full-fidelity design systems, converting live websites, component libraries, or CSS stylesheets into structured design tokens and architectural guidelines.

## 🎯 Primary Purpose
Ensures that Claude and Tiancode agents generate user interfaces matching the exact design language, spacing grid, typography scale, color semantics, and motion curves of any reference application without hallucinating generic or cliché UI patterns.

## 📋 Extraction Protocol

### 1. Token Extraction (Colors & Surface Elevation)
- **Palette**: Extract Primary, Secondary, Accent, Background (Layers 01-04), Borders (Muted, Base, Strong), and Status Tones (Success, Warning, Error, Info).
- **HSL Semantic Mapping**: Formulate all colors using standard CSS Custom Properties with HSL/RGB alpha channels:
  ```css
  --color-bg-base: hsl(220, 15%, 8%);
  --color-bg-layer-1: hsl(220, 14%, 12%);
  --color-text-primary: hsl(210, 20%, 98%);
  --color-accent-blue: hsl(217, 91%, 60%);
  ```

### 2. Typography Hierarchy & Font Pairing
- **Scale**: `display`, `h1`, `h2`, `h3`, `body`, `caption`, `code`.
- **Tracking & Line Heights**: Strict letter-spacing (e.g. `-0.02em` for large headers, `0.01em` for small labels) and proportional line-heights (`1.15` for titles, `1.5` for copy).

### 3. Spacing & Radius System
- **Grid Units**: 4px / 8px baseline (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px).
- **Radius Tokens**: `radius-sm` (4px), `radius-md` (8px), `radius-lg` (12px), `radius-full` (9999px).

### 4. Motion Curves & Micro-Interactions
- **Transitions**: Bezier curves for snappy tactile feedback: `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring) or `cubic-bezier(0.16, 1, 0.3, 1)` (fluid ease-out).

## 🛠️ Output Artifacts
When executing this skill, produce two canonical documentation files:
1. `DESIGN.md`: Full design tokens, color palette, layout rules, and component specs.
2. `CLAUDE.md`: Compact instructions for Claude to adhere strictly to the extracted system.
