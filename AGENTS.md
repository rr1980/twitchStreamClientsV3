# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Existing project rule source: also read [`.github/copilot-instructions.md`](.github/copilot-instructions.md); keep this file shorter and only preserve high-value gotchas.
- Single-spec runs use Angular's test builder include filter, not raw Vitest CLI flags: [`npx ng test --watch=false --include src/app/core/services/stream-state.service.spec.ts`](package.json). `--runInBand` is invalid here.
- Coverage gate is custom: [`npm run test:coverage:ci`](package.json) writes [`coverage/twitchStreamClientsV3/coverage-final.json`](scripts/check-coverage.mjs:4) and [`scripts/check-coverage.mjs`](scripts/check-coverage.mjs:1) enforces 97 statements / 93.5 branches / 94.5 functions.
- Production preview is a two-step flow: build first, then serve [`dist/twitchStreamClientsV3/browser`](package.json:15) via [`npm run http`](package.json:15); the output path matters.
- Routing is intentionally hash-based and canonicalized to `#/List/:id`; preserve [`withHashLocation()`](src/app/app.config.ts:59) and [`ListNavigationService.ensureCanonicalUrl()`](src/app/app.config.ts:24) behavior when touching navigation.
- App state persistence is centralized in [`StreamStateService`](src/app/core/services/stream-state.service.ts:52): startup must call [`initialize()`](src/app/core/services/stream-state.service.ts:109), and writes are debounced through a microtask-driven scheduler rather than immediate storage writes.
- Persisted storage is migration-heavy. Do not rename [`app_state_v3`](src/app/core/services/stream-state.service.ts:53) or remove legacy key migration without updating tests for old keys noted in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
- Always go through [`StorageService`](src/app/core/services/storage.service.ts:11) for browser storage access; it guards SSR/platform access and intentionally swallows quota/access failures.
- Private/protected member naming is non-default: ESLint requires leading underscores for non-public members via [`@typescript-eslint/naming-convention`](eslint.config.js:64).
- Prefer inline type imports such as [`import type { ApplicationConfig }`](src/app/app.config.ts:2); ESLint warns on non-type-only imports where possible.
- UI copy is intentionally German; keep toast text, labels, and fallback titles aligned with existing German strings unless localization work is explicitly requested.
- Twitch embeds must start muted for autoplay compatibility and are reconciled afterward inside [`TwitchEmbedService.createEmbed()`](src/app/core/services/twitch-embed.service.ts:133); removing that muted bootstrap breaks playback in browsers.
- [`StreamGridComponent`](src/app/features/stream-grid/stream-grid.component.ts:54) intentionally defers embed sync while the menu is open or the document is hidden; eager syncing causes flaky behavior and test failures.
- Available quality options are aggregated from live embeds and normalized centrally; use [`setAvailableQualities()`](src/app/core/services/stream-state.service.ts:104) plus [`buildAvailableStreamQualityOptions()`](src/app/core/services/stream-state.service.ts:70) instead of ad-hoc option lists.
