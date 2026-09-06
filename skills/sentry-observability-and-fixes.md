---
name: sentry-observability-and-fixes
description: Production observability, exception handling, distributed tracing, profiling, release health, source maps, and automated root-cause fixes with Sentry.
tags: ["sentry", "observability", "monitoring", "tracing", "errors"]
---

# Sentry Observability & Root-Cause Analysis

Production standards for error monitoring, performance telemetry, and diagnostic debugging using Sentry.

## 1. Initialization Best Practices

Initialize Sentry as early as possible in application startup:

```typescript
import * as Sentry from "@sentry/node"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  release: process.env.APP_VERSION,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  profilesSampleRate: 0.1, // continuous profiling
  sendDefaultPii: false, // protect user privacy
  beforeSend(event) {
    // Sanitize sensitive tokens or credentials from error context
    if (event.request?.headers) {
      delete event.request.headers["authorization"]
      delete event.request.headers["cookie"]
    }
    return event
  },
})
```

---

## 2. Enriched Context & Breadcrumbs

When capturing custom errors or handling background jobs, enrich the Sentry scope:

```typescript
export async function runJob(jobId: string, fn: () => Promise<void>) {
  return await Sentry.withScope(async (scope) => {
    scope.setTag("job.id", jobId)
    scope.setContext("job_metadata", { startedAt: Date.now() })

    try {
      await fn()
    } catch (error) {
      Sentry.captureException(error)
      throw error
    }
  })
}
```

---

## 3. Automated Source Map Uploads

Ensure full stack trace resolution by uploading source maps during CI/CD:

```bash
npx @sentry/cli releases files $APP_VERSION upload-sourcemaps ./dist --url-prefix '~/dist'
npx @sentry/cli releases finalize $APP_VERSION
```

---

## 4. Troubleshooting Workflow with Sentry
1. **Locate Issue ID**: Retrieve the issue ID and view the stack trace, breadcrumbs, and user action sequence.
2. **Inspect Suspect Commits**: Check Sentry's automated suspect commit detection.
3. **Reproduce Locally**: Use the breadcrumbs (network requests, console logs, DOM interactions) to recreate the exact state prior to crash.
4. **Deploy Fix with Sentry Commit Tag**: Tag git commit with `Fixes SENTRY-ISSUE-KEY` to automatically resolve the issue on release.
