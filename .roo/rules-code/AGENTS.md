# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Non-public members are expected to use leading underscores per [`eslint.config.js`](../../../eslint.config.js:64); follow existing names like [`_state`](../../../src/app/app.ts:32) and [`_renderedEmbeds`](../../../src/app/features/stream-grid/stream-grid.component.ts:59).
- Storage access must stay behind [`StorageService`](../../../src/app/core/services/storage.service.ts:11); direct [`window.localStorage`](../../../src/app/core/services/storage.service.ts:181) usage bypasses platform/error guards the app relies on.
- State mutations should flow through [`StreamStateService`](../../../src/app/core/services/stream-state.service.ts:52); per-list quality/layout/focus/mute behavior is coupled to its normalization and persist pipeline.
- Embed updates should prefer reconciliation over recreation: [`StreamGridComponent._syncEmbeds()`](../../../src/app/features/stream-grid/stream-grid.component.ts:202) only recreates when wrapper/chat shape changes.
- New Twitch player behavior belongs in [`TwitchEmbedService`](../../../src/app/core/services/twitch-embed.service.ts:91), which already handles autoplay-muted bootstrap, quality fallback ranking, and repeated mute sync.
- Keep German UX copy consistent with existing toasts and labels in [`SettingsModalComponent`](../../../src/app/features/settings-modal/settings-modal.component.ts:120) and [`App`](../../../src/app/app.ts:137).
