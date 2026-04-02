# Twitch Stream Clients V3

[![Angular](https://img.shields.io/badge/Angular-21-dd0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![PWA](https://img.shields.io/badge/PWA-Service%20Worker-0f766e)](https://angular.dev/ecosystem/service-workers)

Twitch Stream Clients V3 is a browser-only Twitch multi-viewer built with Angular 21.
It lets you group channels into reusable lists, switch stream quality globally, enable chat per stream, and keep the full setup persisted locally.

The app is optimized for a compact codebase, predictable state handling, and strong automated test coverage.

## Overview

- Adaptive multi-stream grid driven by viewport size and chat layout
- Named stream lists with canonical hash URLs such as `#/List/1`
- Global quality selection with Twitch quality fallback handling
- Per-stream chat toggle and list-local ordering
- Local persistence for lists, quality, and usage statistics
- Legacy storage migration into the current list-based state model
- Keyboard shortcuts, modal focus handling, and toast-based feedback
- Production service worker support for static hosting

## Runtime Behavior

The app uses a single state service as the persistence boundary and derives UI state through Angular signals.
The active list is selected from the URL and rendered lazily through the stream grid route.

Canonical route examples:

- `#/List/null` opens the app without an active list
- `#/List/1` opens list `1`
- non-canonical or invalid routes are normalized to `#/List/<id|null>` while preserving query params and fragments

Persistence details:

- Current application state is stored in `localStorage` under `app_state_v3`
- Legacy keys such as `streams_v2`, `streams`, `quality_v2`, `streams_qualities`, `streams_qualies`, and `stats_v2` are migrated on first load
- Failed persistence writes are surfaced to the user instead of failing silently

## Features

### Stream Lists

- Create, rename, select, and delete named lists
- Keep independent channel collections per list
- Navigate directly to a list through the URL
- Automatically choose the next sensible list after deletion

### Stream Management

- Add Twitch channels with normalization and duplicate protection
- Accept channel names containing `a-z`, `äöü`, `0-9`, and `_` with a maximum of 25 characters
- Reorder streams inside the active list
- Remove individual streams without affecting other lists
- Reuse recent stream statistics as datalist suggestions

### Viewing Experience

- Calculate an efficient grid layout based on the current viewport
- Render Twitch embeds lazily for the active list only
- Support dynamic quality options reported by the Twitch player
- Preserve the selected quality even when Twitch reports a different option set
- Mute all but the first rendered stream on initial sync

### Interaction and Accessibility

- `M` opens the settings dialog when focus is not inside a typing context
- `Escape` closes the dialog
- Focus is restored to the previously active element after closing the dialog
- Toasts are deduplicated and counted when the same message repeats

## Tech Stack

- Angular 21 with standalone components
- TypeScript 6
- Angular Signals and computed state
- Angular Router with hash location strategy
- Angular Service Worker for production builds
- Vitest through Angular's unit test builder
- ESLint with Angular ESLint flat config

## Getting Started

### Prerequisites

- Node.js 22 or newer recommended
- npm 11 or newer

### Install Dependencies

```bash
npm install
```

### Start Development

```bash
npm start
```

This starts Angular's development server.
If port `4200` is already occupied, Angular may offer another port.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Angular development server |
| `npm run build` | Create the production build with static output |
| `npm run watch` | Run a development build in watch mode |
| `npm test` | Run the full test suite once |
| `npm run test:coverage` | Run the test suite with coverage |
| `npm run coverage:check` | Validate coverage thresholds from the generated coverage report |
| `npm run test:coverage:ci` | Run coverage generation and threshold validation together |
| `npm run lint` | Run ESLint for TypeScript and Angular templates |
| `npm run http` | Serve the production build from `dist/twitchStreamClientsV3/browser` on port `8086` |

## Production Preview

Build and preview the static production output locally:

```bash
npm run build
npm run http
```

Then open `http://localhost:8086`.

## Quality Gates

The project uses automated linting, unit tests, component tests, and coverage checks.

Common verification commands:

```bash
npm run lint
npm test
npm run test:coverage:ci
```

Coverage reports are written to `coverage/twitchStreamClientsV3/`.
The current enforced minimum thresholds are:

- Statements: `97%`
- Branches: `93.5%`
- Functions: `94.5%`

## Project Structure

```text
src/
	app/
		core/
			models/        App state and persistence types
			services/      State, storage, routing, hotkeys, embeds, error handling
			utils/         Bootstrap and error utilities
		features/
			settings-modal/  List and stream management UI
			stream-grid/     Twitch embed grid and layout sync
			toast/           Toast container and notification service
		shared/
			utils/         Shared layout helpers
public/
	icons/             PWA icons
scripts/
	check-coverage.mjs Coverage threshold validation
```

## Architecture Notes

- `StreamStateService` owns the persisted state model for lists, quality, statistics, and menu visibility
- `ListNavigationService` encapsulates URL parsing, canonicalization, and list navigation
- `TwitchEmbedService` wraps Twitch script loading, embed lifecycle management, and quality synchronization
- `HotkeyService` centralizes keyboard shortcuts and typing-context guards
- `ToastService` handles transient user-facing notifications with deduplication

The result is a small application where routing, persistence, and embed concerns stay isolated instead of leaking across components.

## PWA Support

Production builds register Angular's service worker and include a web app manifest.
That makes the app suitable for static hosting with installable web app behavior in supported browsers.

## Notes

- The app depends on the Twitch embed API and on Twitch's embed availability and restrictions
- The UI copy is currently German
- This project has no backend and stores all state in the browser
- The application is not affiliated with Twitch

## Open Source

This repository is intended to be publicly reusable under the MIT License.
That means other developers may use, modify, and redistribute the code with minimal restrictions, as long as the license notice is kept with substantial portions of the software.

The MIT License applies to the source code in this repository.
It does not grant rights to Twitch branding, trademarks, or third-party streamed content.

## Contributing

Contributions are welcome.
See `CONTRIBUTING.md` for local checks, code expectations, and pull request guidance.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
