# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- For a single failing spec, use [`npx ng test --watch=false --include <spec-path>`](../../../package.json:9); Angular's unit-test builder rejects Jest-style flags such as `--runInBand`.
- If a filtered spec reports “Vitest failed to find the runner”, treat it as an Angular/Vitest builder quirk from the filtered invocation first, not necessarily an app regression.
- Persist failures surface as a single toast from [`StreamStateService`](../../../src/app/core/services/stream-state.service.ts:52) after [`StorageService.setJson()`](../../../src/app/core/services/storage.service.ts:109) returns false; inspect storage/quota paths before changing state logic.
- Embed issues often reproduce only when the menu is closed and the document is visible because [`StreamGridComponent._shouldDeferEmbedSync()`](../../../src/app/features/stream-grid/stream-grid.component.ts:226) blocks work otherwise.
- Twitch script load problems are deduplicated; [`StreamGridComponent`](../../../src/app/features/stream-grid/stream-grid.component.ts:88) and [`TwitchEmbedService.loadScript()`](../../../src/app/core/services/twitch-embed.service.ts:107) intentionally avoid spamming duplicate failures.
