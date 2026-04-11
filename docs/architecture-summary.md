# Architecture Summary

This document is the compact maintainer-oriented reference for Twitch Stream Clients V3.
It complements the public README with responsibility boundaries, state ownership, and the most relevant runtime flows.

## System Summary

- Browser-only Twitch multi-viewer built with Angular 21 standalone components and Signals
- Hash-based routing with canonical list URLs under `#/List/:listId`
- Single persistence boundary in `StreamStateService`
- Local-only storage via `localStorage` key `app_state_v3`
- Lazy stream grid rendering with Twitch embed lifecycle management isolated in `TwitchEmbedService`
- German UI copy, keyboard-driven modal access, and toast-based user feedback

## Runtime Flow

1. `bootstrapApplication()` starts the app through `appConfig` and runs the initializer for `StreamStateService.initialize()`.
2. The router resolves or normalizes the current hash route to `/List/:listId`.
3. `App` mirrors the current route into the active list state and restores the last active list when starting from `List/null`.
4. `SettingsModalComponent` mutates lists, streams, favorites, quality, layout, and mute settings through `StreamStateService`.
5. `StreamGridComponent` reacts to active state, computes the layout, and delegates Twitch player creation and synchronization to `TwitchEmbedService`.
6. Signal-driven persistence writes the normalized application state back to `localStorage`.

## Ownership Summary

| Area | Owner | Notes |
| --- | --- | --- |
| Persisted app state | `StreamStateService` | Lists, favorites, recent channels, statistics, last active list |
| URL parsing and canonicalization | `ListNavigationService` | Keeps `/List/:id` URLs normalized |
| Twitch embed loading and player sync | `TwitchEmbedService` | Script loading, quality sync, mute sync |
| Settings and list management UI | `SettingsModalComponent` | Form handling, drag and drop, focus trap |
| Stream rendering and layout | `StreamGridComponent` | Grid calculation, embed reuse, visibility/resize sync |
| Toast lifecycle | `ToastService` + `ToastContainerComponent` | Deduplicated transient feedback |
| PWA install/update handling | `PwaService` | Startup hint, install prompt, update notice |
| Global keyboard shortcuts | `HotkeyService` | `M` to open menu, `Escape` to close |

## State Model

Persisted application state is defined through `AppSettings` and centers on `StreamList`.

| Entity | Purpose |
| --- | --- |
| `StreamList` | Named collection of channels plus list-scoped quality, layout, focus, and mute state |
| `StreamChannel` | Channel name and per-stream chat toggle |
| `favoriteChannels` | Reusable favorite channel pool across lists |
| `recentChannels` | Recently used channels, capped for quick reuse |
| `statistics` | Usage counters for channel suggestions and ranking |
| `lastActiveListId` | Restores the previous working context on startup |

## Change Map

Use this section to find the right edit location quickly.

| Goal | Primary files |
| --- | --- |
| Change list persistence or list mutations | `src/app/core/services/stream-state.service.ts` |
| Change route behavior or canonical URLs | `src/app/core/services/list-navigation.service.ts`, `src/app/app.config.ts`, `src/app/app.ts` |
| Change Twitch player setup or sync heuristics | `src/app/core/services/twitch-embed.service.ts` |
| Change modal interactions or stream management UI | `src/app/features/settings-modal/` |
| Change grid behavior or focus mode rendering | `src/app/features/stream-grid/`, `src/app/shared/utils/grid.util.ts` |
| Change quality normalization or labels | `src/app/shared/utils/stream-quality.util.ts` |
| Change install/update UX | `src/app/core/services/pwa.service.ts` |
| Change notification behavior | `src/app/features/toast/` |

## Important Rules

- Keep the standalone + Signals architecture intact; avoid broad state refactors.
- Preserve the persistence boundary in `StreamStateService` instead of scattering `localStorage` access.
- Keep `@angular/build`, `@angular/cli`, and Angular packages on matching major versions.
- Keep user-facing copy consistent with the current German UI unless localization work is intentional.
- Do not bypass route canonicalization logic when linking to lists.

## Verification Checklist

Run these commands before merging behavior changes:

```bash
npm run lint
npm test
npm run test:coverage:ci
```

Coverage thresholds currently enforced:

- Statements: `97%`
- Branches: `93.5%`
- Functions: `94.5%`

## Related Documents

- [README.md](../README.md) for public overview and local setup
- [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution and pull request expectations
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) for the most detailed project-specific implementation notes
