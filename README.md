# Twitch Stream Clients V3

[![Angular](https://img.shields.io/badge/Angular-21-dd0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![PWA](https://img.shields.io/badge/PWA-Service%20Worker-0f766e)](https://angular.dev/ecosystem/service-workers)

Twitch Stream Clients V3 is a compact multi-viewer for Twitch streams built with Angular 21.
It lets you organize streams into reusable lists, switch quality globally, toggle chat per stream, and keep your setup persisted across sessions.

The project focuses on a fast browser-only experience with a small codebase, predictable state handling, and solid test coverage.

## Highlights

- Multi-stream Twitch viewer with adaptive grid layout
- Named stream lists with direct linking via hash-based URLs
- Per-stream chat toggle and list-local stream ordering
- Global quality switching with Twitch quality fallback handling
- Local persistence for lists, quality, statistics, and UI state migration
- Keyboard shortcuts for quick interaction
- Toast-based feedback for user actions and storage failures
- Service worker support for production builds
- Unit and component tests with Vitest

## How It Works

The application is built around a single state service that owns the persisted app model.
Users manage lists of Twitch channels, choose the active list through the URL hash, and render each stream through the Twitch embed API.

Examples:

- `#/List/null` opens the app without an active list
- `#/List/1` opens list `1`
- invalid hashes are normalized to the canonical format automatically

## Feature Overview

### Stream Management

- Create, rename, select, and delete named stream lists
- Add channels with normalization and duplicate protection
- Reorder streams within a list
- Remove channels individually
- Use recent stream statistics as datalist suggestions

### Viewing Experience

- Automatically calculates an efficient stream grid based on viewport size
- Supports `auto`, `480p`, `720p60`, and `chunked` quality modes
- Falls back to the closest available Twitch quality when needed
- Allows chat to be enabled per stream
- Mutes all but the primary stream on initial render

### State, Navigation, and Resilience

- Persists app state in `localStorage`
- Migrates legacy storage keys into the current list-based state model
- Keeps navigation centralized through a dedicated hash navigation service
- Normalizes invalid URLs into a stable `#/List/<id|null>` format
- Surfaces persistence failures to the user instead of silently losing changes

### UX Details

- `M` toggles the settings menu when focus is not inside a typing field
- `Escape` closes the settings menu
- Modal focus is restored when the dialog closes
- Toast messages are deduplicated and counted when repeated

## Tech Stack

- Angular 21
- TypeScript 6
- Angular Signals for local app state
- Angular Service Worker for production PWA support
- Vitest for tests
- ESLint for linting

## Getting Started

### Prerequisites

- Node.js 22+ recommended
- npm 11+

### Installation

```bash
npm install
```

### Start the Development Server

```bash
npm start
```

The app starts with Angular's dev server.
If port `4200` is already in use, Angular may offer a different port automatically.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm start` | Starts the Angular dev server |
| `npm run build` | Creates a production build |
| `npm run watch` | Builds in watch mode for development |
| `npm test` | Runs the Vitest-based Angular test suite once |
| `npm run test:coverage` | Runs tests with coverage output |
| `npm run coverage:check` | Verifies coverage thresholds |
| `npm run test:coverage:ci` | Full CI coverage run plus threshold check |
| `npm run lint` | Runs ESLint |
| `npm run http` | Serves the production build from `dist/twitchStreamClientsV3/browser` |

## Build and Preview Production Output

```bash
npm run build
npm run http
```

Then open:

```text
http://localhost:8086
```

## Testing

The project uses Angular's test integration with Vitest and includes unit and component tests for core state, embeds, modal interactions, error handling, hotkeys, and grid calculation.

Useful commands:

```bash
npm test
npm run test:coverage
npm run test:coverage:ci
```

Coverage artifacts are written to `coverage/twitchStreamClientsV3/`.

## Project Structure

```text
src/
	app/
		core/
			models/       App state types
			services/     State, storage, navigation, hotkeys, embeds, error handling
			utils/        Bootstrap helpers
		features/
			settings-modal/  List and stream management UI
			stream-grid/     Twitch embed grid
			toast/           Notification system
		shared/
			utils/        Shared layout helpers
```

## Architecture Notes

- `StreamStateService` is the central state owner and persistence boundary.
- `ListNavigationService` keeps URL hash parsing and normalization in one place.
- `TwitchEmbedService` wraps script loading, embed creation, cleanup, and quality synchronization.
- UI feedback is routed through `ToastService`.

This keeps the application small while avoiding navigation and persistence logic leaking across multiple components.

## PWA Support

Production builds include an Angular service worker configuration and a web app manifest.
That means the app is structured to behave like a lightweight installable web application when served in production.

## Notes

- This project uses the Twitch embed API and therefore depends on Twitch availability and embed restrictions.
- The application is not affiliated with Twitch.

## License

No license file is included in this repository at the moment.
