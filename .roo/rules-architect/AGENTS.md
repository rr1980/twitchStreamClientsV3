# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- The app is intentionally browser-only but still guards platform access; architecture changes must preserve the [`StorageService`](../../../src/app/core/services/storage.service.ts:11) and Twitch script browser checks instead of assuming unrestricted DOM availability.
- [`StreamStateService`](../../../src/app/core/services/stream-state.service.ts:52) is the persistence boundary and also the normalization/migration boundary; splitting state elsewhere risks breaking legacy storage migration and per-list derived signals.
- Navigation, active list state, and title restoration are coupled across [`App`](../../../src/app/app.ts:31), [`appRoutes`](../../../src/app/app.config.ts:30), and [`ListNavigationService`](../../../src/app/app.config.ts:24); route shape changes need coordinated updates.
- [`StreamGridComponent`](../../../src/app/features/stream-grid/stream-grid.component.ts:54) assumes embed lifecycle can be paused while UI overlays or hidden documents are active; alternative architectures must preserve this defer-and-reconcile model to avoid Twitch embed churn.
- Quality selection is not just UI state: live embed callbacks feed normalized options back into central state, so any redesign must keep the feedback loop between [`TwitchEmbedService`](../../../src/app/core/services/twitch-embed.service.ts:133), [`StreamGridComponent`](../../../src/app/features/stream-grid/stream-grid.component.ts:202), and [`StreamStateService`](../../../src/app/core/services/stream-state.service.ts:104).
