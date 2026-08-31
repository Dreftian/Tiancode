---
name: "playwright-e2e-testing"
description: "Automatización y pruebas End-to-End con Playwright: Page Object Model (POM), fixtures personalizadas, network mocking y visual regression."
---

# Playwright E2E Testing & Test Automation Expert

## Propósito
Diseñar suites de pruebas automatizadas end-to-end confiables, rápidas y resistentes a cambios con Playwright.

## Estrategias Clave
1. **Page Object Model (POM)**:
   - Encapsula selectores y acciones de páginas en clases dedicadas para evitar duplicación.
   - Utiliza selectores orientados al usuario (`getByRole`, `getByText`, `getByLabel`, `getByTestId`).

2. **Aislamiento y Autenticación**:
   - Guarda y reutiliza estados de autenticación (`storageState`) para evitar login repetitivo en cada test.
   - Ejecuta tests de forma concurrente con aislamiento total de cookies y almacenamiento.

3. **Pruebas Visuales y de Red**:
   - Captura snapshots visuales con `expect(page).toHaveScreenshot()`.
   - Intercepta y simula respuestas de backend con `page.route()`.
   - Asegura aserciones auto-reintentables (`await expect(locator).toBeVisible()`).
