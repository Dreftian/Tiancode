# Browser Automation & Web Interaction Skill

This skill guides the agent on automating browser workflows, headless and headed page navigation, capturing screenshots, interacting with DOM elements, scraping dynamic JavaScript web apps, and verifying end-to-end user journeys using Playwright / DevTools.

## When to Use
- When asked to test, inspect, scrape, or automate web applications, web pages, or local dev servers.
- When verifying UI layout, visual regressions, responsiveness, or form interactions.
- When extracting structured data from websites requiring JavaScript rendering.

## Core Capabilities & Protocols

### 1. Navigation and Page Lifecycle
- Always wait for network idle or specific selector visibility before attempting interactions:
  ```ts
  await page.goto(url, { waitUntil: "networkidle" })
  ```
- Use resilient locators: prefer user-facing role locators (`getByRole`, `getByLabel`, `getByPlaceholder`) over brittle CSS classes.

### 2. Form Interaction & Data Entry
- Explicitly clear and fill input fields:
  ```ts
  await page.getByLabel("Email").fill("user@example.com")
  await page.getByRole("button", { name: "Submit" }).click()
  ```

### 3. Screenshots & Visual Verification
- Take full-page and element-level screenshots to verify visual state and responsive layout:
  ```ts
  await page.screenshot({ path: "screenshot.png", fullPage: true })
  ```

### 4. Console & Network Error Auditing
- Listen for unhandled page errors and failed network requests:
  ```ts
  page.on("pageerror", (err) => console.error("Page error:", err))
  page.on("requestfailed", (req) => console.warn("Failed request:", req.url()))
  ```
