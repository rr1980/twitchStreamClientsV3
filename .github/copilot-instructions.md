# Twitch Stream Clients V3

## Stack
- Angular 21 (standalone components, Signals/computed), TypeScript 6, RxJS 7.8
- Build: `@angular/build` + `@angular/cli` 21 (gleiche Major halten!)
- Test: Vitest 4 + jsdom + `@vitest/coverage-v8`
- Lint: ESLint 10 + angular-eslint 21 + typescript-eslint
- PWA: Angular Service Worker (nur Production)

## Zweck
Browser-only Twitch Multi-Viewer mit wiederverwendbaren Stream-Listen, Quality-Auswahl pro Liste, Chat pro Stream, Favoriten, zuletzt genutzte Kanäle, Focus-Modus, Layout-Presets und lokaler Persistenz.

## Architektur

### Routing
- Hash-basiert: Root leitet zu `#/List/null` weiter
- `/List/:listId` wird von `ListNavigationService` kanonisiert
- `StreamGridComponent` wird lazy geladen

### State & Persistenz
- `StreamStateService` = zentrale Persistenzgrenze, wird per App-Initializer beim Start geladen
- localStorage-Key: `app_state_v3`
- Gespeichert: `lists`, `statistics`, `favoriteChannels`, `recentChannels`, `lastActiveListId`
- Quality und Layout sind pro Liste gespeichert (`StreamList.quality`, `StreamList.layoutPreset`)
- Layout-Presets: `auto | balanced | stage | chat`
- Audio-Modi: `default | all-muted`

### Migration
- Ältere Keys werden beim ersten Laden migriert: `streams_v2`, `streams`, `quality_v2`, `streams_qualities`, `streams_qualies`, `stats_v2`, `showChat_v2`

### Twitch-Integration
- `TwitchEmbedService` lädt `https://embed.twitch.tv/embed/v1.js` dynamisch
- Nutzt aktuellen Hostname als Twitch `parent`
- Quality-Fallback-Logik bei nicht verfügbarer Qualität

### Bootstrap & App Shell
- `App` navigiert beim Start zu `lastActiveListId` (Microtask, nur wenn Route `null` auflöst und Liste noch existiert)
- `App` verwaltet globale Hotkeys, Document-Title, PWA Install/Update und rendert Settings-Modal + Toast-Container um das geroutete Stream-Grid

### Komponenten
- **SettingsModalComponent**: Listen-CRUD, Duplikation, Löschnavigation, Stream-CRUD, Drag-and-Drop-Reorder, Favoriten/Recents-Vorschläge, Modal-Focus-Trap, Focus-Restoration
- **StreamGridComponent**: Layout-Berechnung aus Viewport + Preset, Embed-Neuanlage bei Quality/Chat/Mute-Änderung, Quality-Merge über aktive Embeds, erster Stream startet unmuted
- **ToastContainerComponent**: Deduplizierung von Toasts

## UX-Konventionen
- UI-Texte sind Deutsch — konsistent halten, außer Lokalisierung wird explizit gewünscht
- Hotkeys: `M` = Settings-Modal, `Escape` = Schließen
- Focus-Restoration und Toast-Deduplizierung sind erwartetes Verhalten

## Arbeitsregeln
- Standalone/Signals-Architektur beibehalten, kleine fokussierte Änderungen
- Keine breiten Refactors oder unrelated Cleanup
- `@angular/build` muss auf gleicher Major wie `@angular/cli` und Angular-Pakete bleiben (sonst Schema-Fehler bei `ng test`)

## Verifikation
- `npm run lint` — ESLint
- `npm test` — Vitest (watch=false)
- `npm run test:coverage:ci` — Coverage + Threshold-Check
- Thresholds: 97% Statements, 93.5% Branches, 94.5% Functions
