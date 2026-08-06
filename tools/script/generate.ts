#!/usr/bin/env bun

import { $ } from "bun"

await $`bun ./backend/sdk/js/script/build.ts`

await $`bun dev generate > ../sdk/openapi.json`.cwd("backend/opencode")

await $`./script/format.ts`
