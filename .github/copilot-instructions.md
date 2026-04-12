# Twitch Stream Clients V3

## Stack
- Angular 21 (standalone components, Signals/computed), TypeScript 6, RxJS 7.8
- Build: `@angular/build` + `@angular/cli` 21 (gleiche Major halten!)
- Test: Vitest 4 + jsdom + `@vitest/coverage-v8`
- Lint: ESLint 10 + angular-eslint 21 + typescript-eslint
- PWA: Angular Service Worker (nur Production)

## Zweck
Browser-only Twitch Multi-Viewer mit wiederverwendbaren Stream-Listen, Quality-Auswahl pro Liste, Chat pro Stream, Favoriten, zuletzt genutzte Kanäle, Layout-Presets und lokaler Persistenz.

---

## Architektur

### Routing
- Hash-basiert (`withHashLocation()`): Root leitet zu `#/List/null` weiter
- `/List/:listId` und `/list/:listId` werden von einem `normalizeListRoute`-Guard kanonisiert (via `ListNavigationService.ensureCanonicalUrl()`)
- `StreamGridComponent` wird per `loadComponent` lazy geladen
- Wildcard `**` leitet zu `List/null` um

### State & Persistenz
- `StreamStateService` = zentrale Persistenzgrenze, wird per App-Initializer beim Start geladen (`initialize()`)
- localStorage-Key: `app_state_v3`
- Gespeichert (Interface `AppSettings`): `lists`, `statistics`, `favoriteChannels`, `recentChannels`, `lastActiveListId`
- Persist-Mechanismus: ein `effect()` beobachtet alle relevanten Signale → `_schedulePersist()` debounced per `queueMicrotask` → schreibt JSON nach localStorage
- Bei Schreibfehler (z.B. QuotaExceeded) wird ein Error-Toast angezeigt

### Datenmodell (`app-settings.model.ts`)
```
StreamQuality        = string
StreamLayoutPreset   = 'auto' | 'balanced' | 'stage' | 'chat'
StreamAudioMode      = 'default' | 'all-muted'

StreamQualityOption  { value: StreamQuality; label: string }
StreamStatistic      { name: string; value: number }
StreamChannel        { name: string; showChat: boolean }

StreamList {
  id: number; name: string; streams: StreamChannel[];
  quality?: StreamQuality; layoutPreset?: StreamLayoutPreset;
  muteAllStreams?: boolean
}

AppSettings {
  lists: StreamList[]; statistics: StreamStatistic[];
  favoriteChannels: string[]; recentChannels: string[];
  lastActiveListId: number | null
}
```

### Migration
- Ältere Keys werden beim ersten Laden migriert: `streams_v2`, `streams`, `quality_v2`, `streams_qualities`, `streams_qualies`, `stats_v2`, `showChat_v2`
- Quality-Normalisierung: `"Source"` / `"Quelle"` → `'chunked'`; validiert gegen `/^\d+p(?:\d+(?:-\d+)?)?$/`, `'auto'`, `'chunked'`, `'audio_only'`

### Twitch-Integration (`TwitchEmbedService`)
- Lädt `https://embed.twitch.tv/embed/v1.js` dynamisch einmalig (Promise gecached)
- Nutzt `window.location.hostname` als Twitch `parent`
- Quality-Sync: bis zu 120 Frames / 2s — exakte Übereinstimmung, dann Quality-Family (z.B. `"1080p"` aus `"1080p60"`), dann Ranking
- Mute-Sync: bis zu 600 Frames / 10s — setzt `setMuted()`, `setVolume()`, validiert mit `getMuted()`/`getVolume()`
- Embeds starten browserkompatibel muted und werden danach direkt auf den angeforderten Mute-Status synchronisiert
- `TwitchEmbedHandle` bietet: `destroy()`, `setMuted(boolean)`, `setQuality(StreamQuality)`
- Bei Script-Ladefehler wird einmalig ein Error-Toast gezeigt

### Bootstrap & App Shell (`App`)
- `bootstrapApplication(App, appConfig).catch(reportBootstrapError)`
- App-Initializer ruft `StreamStateService.initialize()` auf
- Zwei Constructor-Effects:
  1. **Route → State**: Syncs `activeListId` aus `NavigationEnd`-Events → `state.setActiveListId()`. Beim ersten Laden: wenn Route `null` und `lastActiveListId` existiert und Liste noch vorhanden → `navigateToList()` per `queueMicrotask`
  2. **Titel-Update**: Setzt `document.title` basierend auf `activeList.name`
- `@HostListener('window:keydown')` delegiert an `HotkeyService`
- Rendert: Update-Notice, Startup-Hint, Menü-Trigger-Button, `<router-outlet>`, `SettingsModalComponent`, `ToastContainerComponent`

---

## Services (Detail)

### `StreamStateService`
**Private Signale:** `_lists`, `_activeListId`, `_reportedAvailableQualities`, `_statistics`, `_favoriteChannels`, `_recentChannels`, `_lastActiveListId`, `_menuOpen`

**Öffentliche Computed Signale:** `lists`, `activeListId`, `activeList` (Lookup by ID), `streams`, `quality` (Fallback `'auto'`), `availableQualities` (via `buildAvailableStreamQualityOptions()`), `statistics`, `favoriteChannels`, `recentChannels` (max 24), `layoutPreset` (Fallback `'auto'`), `muteAllStreams`, `lastActiveListId`, `menuOpen`, `streamCount`, `listCount`

**Listen-Operationen:**
- `createList(rawName)` → `ListMutationResult` (Prüft: leer, Duplikat). Vergibt ID per `max(ids) + 1`
- `renameList(listId, rawName)` → `ListMutationResult` (Prüft: leer, Duplikat, nicht gefunden)
- `duplicateList(listId)` → `ListMutationResult` (Name: "Kopie", "Kopie 2", etc.)
- `deleteList(listId)` → entfernte `StreamList | null`

**Stream-Operationen:**
- `addStream(rawName)` → `StreamMutationResult` (Prüft: leer, ungültig, Duplikat, keine aktive Liste). Bumped Statistik + Recents
- `removeStream(index)` → entfernter Name
- `moveStream(index, direction: -1|1)`, `reorderStreams(fromIndex, toIndex)`
- `setStreamShowChat(index, value)`, `disableChatsForActiveList()` → Anzahl geändert

**Kanal-Validierung:**
- `_normalizeChannelName()`: trim, lowercase, Kommas entfernen
- `_isValidChannelName()`: Regex `/^[a-zäöü0-9_]{1,25}$/`
- `_normalizeListName()`: trim, Whitespace normalisieren
- Duplikat-Check: case-insensitive

**Weitere Operationen:**
- `setQuality(value)`, `setLayoutPreset(value)`, `setMuteAllStreams(value)`
- `setAvailableQualities(values)` — vom StreamGrid gemeldet
- `toggleFavoriteChannel(rawName)` → boolean (neuer Status)
- `addFavoriteChannelsToActiveList()` → `{ ok, reason?, added[] }`
- `getTopStatistics(limit=10)` → sortierte Top-Kanäle
- `openMenu()`, `closeMenu()`, `toggleMenu()`

### `ListNavigationService`
- `navigateToList(listId: number|null)` → Router navigiert zu `/List/:listId`
- `readListId(url: string)` → `number | null` (parst aus URL-Pfad)
- `ensureCanonicalUrl(url: string)` → `true | UrlTree` (Redirect bei nicht-kanonischer URL)

### `HotkeyService`
- `handleWindowKeydown(event, activeElement)` → boolean
- **Escape**: schließt Menü wenn geöffnet
- **M**: öffnet Menü wenn geschlossen UND Fokus nicht in INPUT/TEXTAREA/SELECT/contentEditable

### `PwaService`
- Signale: `canInstall` (computed), `startupHintVisible`, `updateAvailable`
- `install()` — ruft `beforeinstallprompt.prompt()` auf
- `dismissStartupHint()` — setzt localStorage-Flag `pwa_startup_hint_seen_v1`
- `dismissUpdateNotice()`, `reloadForUpdate()` — `window.location.reload()`
- Registriert `beforeinstallprompt`, `appinstalled` und SW-Versions-Update-Listener

### `StorageService`
- Wrapper um `localStorage` mit Fehlerbehandlung
- Methoden: `getItem`, `hasKey`, `getString`, `getBoolean`, `getJson`, `setString`, `setBoolean`, `setJson`, `remove`
- Gibt Fallback bei Fehler zurück, warnt bei QuotaExceededError
- Prüft `isPlatformBrowser` vor Zugriff

### `AppErrorHandler` (implements `ErrorHandler`)
- `handleError(error)`: Normalisiert zu Error, logged auf Console, zeigt Toast in Production: *"Unerwarteter Fehler. Bitte versuche es erneut."*

### `ToastService`
- Signal: `messages` (readonly `ToastMessage[]`)
- `ToastMessage`: `{ id, text, type: 'success'|'error'|'info', count }`
- `show(text, type='success')`: Dedupliziert (text+type), inkrementiert `count`, max 4 sichtbar, auto-remove nach 3s
- `remove(id)`: entfernt Toast, löscht Timer

---

## Komponenten (Detail)

### `SettingsModalComponent`
**Change Detection:** OnPush

**Form Controls:**
- `_newListNameControl` — neue Liste anlegen
- `_activeListNameControl` — aktive Liste umbenennen (synced per Effect)
- `_channelNameControl` — neuen Stream hinzufügen (disabled wenn keine aktive Liste)

**ViewChild Refs:** `_listInputRef`, `_streamInputRef`, `_renameListInputRef`, `_modalPanelRef`

**Focus-Management:**
- Beim Öffnen: speichert `activeElement`, fokussiert primären Input (Stream-Input wenn Liste vorhanden, sonst Listen-Input)
- Beim Schließen: stellt Fokus per `queueMicrotask` wieder her
- Focus-Trap: `Tab`/`Shift+Tab` zirkuliert innerhalb des Modal-Panels
- `Escape` schließt Modal

**Drag & Drop (HTML5 API):**
- Signale: `_draggedStreamIndex`, `_dropTargetStreamIndex`
- Events: `dragstart` (setzt Drag-Image), `dragenter`, `dragover`, `drop` (→ `reorderStreams()`), `dragend`
- Visuelles Feedback per CSS-Klassen (`_isDraggedStream()`, `_isDropTarget()`)

**Listen-Operationen:**
- Erstellen, Umbenennen, Duplizieren (Name: "Kopie" / "Kopie 2"), Löschen (Toast, navigiert zu nächster Liste per `_getNextListIdAfterDeletion()`)
- Listen werden als Radio-Buttons dargestellt

**Stream-Operationen:**
- Hinzufügen (parst " (123)"-Suffix weg via `_extractChannelName()`), Entfernen, Hoch-/Runter-Bewegen, Chat-Toggle pro Stream, Favorit-Toggle
- Stream-Items zeigen: Drag-Handle, Index, Name, Chat-Checkbox, Move-Buttons, Favorit-Button, Entfernen-Button

**Sidebar:**
- Quick Actions: "Alle Chats deaktivieren", "Alle stumm / Stumm aufheben"
- Layout-Preset Fieldset: Auto, Grid (balanced), Bühne (stage), Chat
- Quality Fieldset: Auto + verfügbare Qualitäten aus aktiven Embeds

**Backdrop:** Klick auf Backdrop schließt Modal

### `StreamGridComponent`
**Change Detection:** OnPush, Lifecycle: AfterViewInit, OnDestroy

**Embed-State-Tracking:**
```
_renderedEmbeds: Map<string, RenderedEmbedState>
  RenderedEmbedState { elementId, quality, showChat, muted, handle: TwitchEmbedHandle }
_availableQualitiesByStream: Map<string, StreamQualityOption[]>
```

**Grid-Berechnung:**
- Computed Signal `_grid` nutzt `calculateStreamGridLayout()` mit: `displayedStreams`, Viewport-Dimensionen, `layoutPreset`
- `_displayedStreams`: alle Streams der aktiven Liste
- CSS-Grid: `_gridTemplateColumns`, `_gridTemplateRows` aus Layout berechnet

**Embed-Sync-Logik (`_syncEmbeds()`):**
1. Aufgeschoben wenn: Menü offen ODER Dokument nicht sichtbar ODER View nicht bereit
2. Entfernt veraltete Embeds (nicht mehr in aktiver Stream-Liste)
3. Für jeden Stream: Falls Element-ID + showChat unverändert → nur Quality/Muted updaten (kein Recreate)
4. Neue Embeds: Twitch-Script laden → `createEmbed()` mit `onAvailableQualities`-Callback
5. Neue Embeds übernehmen direkt den aktuellen `muteAllStreams`-Status ohne Sonderbehandlung des ersten Streams
6. `_syncAvailableQualities()`: flattened alle per-Stream-Qualities, dedupliziert, pushed zu State

**Event-Handler:**
- `_onResize()`: debounced (150ms), liest Viewport-Dimensionen neu
- `_onDocumentVisibilityChange()`: re-synced wenn Dokument wieder sichtbar

**Cleanup (ngOnDestroy):** Resize-Timer, alle Embeds zerstört, Maps geleert, Qualities zurückgesetzt

### `ToastContainerComponent`
- Iteriert `ToastService.messages()`
- Jeder Toast: Text, Count-Badge (wenn > 1), Dismiss-Button
- `aria-live`: `assertive` für Fehler, `polite` für Info/Success
- `role`: `alert` für Fehler, `status` für andere

---

## Utilities

### `grid.util.ts`
- `calculateOptimalGrid(streams, width, height)` → `GridLayout`: testet Spalten 1..count, berechnet Zell-Fläche gewichtet nach showChat, wählt bestes Fitting
- `calculateStreamGridLayout(streams, width, height, preset, hasFocusedStream)` → `StreamGridLayout`: delegiert an Preset-Handler
- `calculateBalancedGrid(count)` → cols=ceil(sqrt), rows=ceil(count/cols)
- `calculateChatGrid(count, width, height)` → 1-2 Spalten basierend auf Seitenverhältnis
- `calculateFeaturedGrid(count, width, height)` → erstes Item 2×2, Rest normal (Stage-Layout)
- `buildUniformLayout(count, layout)` → gleichmäßige Platzierung
- `thisCellArea(cellWidth, cellHeight, showChat)` → berechnet 16:9 bzw. 21:9 Video-Area

### `stream-quality.util.ts`
- `normalizeStreamQuality(value)` → trim, "Source"/"Quelle" → `'chunked'`, Validierung, Default `'auto'`
- `isSupportedStreamQuality(value)` → `'auto'`, `'chunked'`, `'audio_only'`, oder Auflösungs-Pattern
- `normalizeStreamQualityLabel(value, label?)` → deutscher Label mit Übersetzungen (Quelle, Nur Audio)
- `normalizeAvailableStreamQualities(values)` → Deduplizierung, sortiert
- `buildAvailableStreamQualityOptions(reported, selected)` → kombiniert Auto + gewählte + gemeldete
- `areStreamQualityOptionsEqual(left, right)` → Deep-Vergleich
- Quality-Sortierung: Quelle (chunked) > Auflösung DESC > Framerate DESC > audio_only

### `bootstrap-error.util.ts`
- `reportBootstrapError(error)` → normalisiert zu Error, logged auf Console

---

## Build & Konfiguration

### `angular.json`
- Builder: `@angular/build:application` (Output-Mode `static` in Production)
- Service Worker: aktiviert in Production mit `ngsw-config.json`
- Budgets: Initial 500kB Warnung / 1MB Fehler; Komponenten-Styles 10kB / 20kB
- Output-Hashing: all; Subresource-Integrity: true
- Tests: `@angular/build:unit-test` mit `tsconfig.spec.json`

### `ngsw-config.json`
- Asset-Gruppe **app** (Prefetch): `/favicon.ico`, `/index.html`, `/manifest.webmanifest`, `/*.css`, `/*.js`
- Asset-Gruppe **assets** (Lazy): Bilder, Fonts, Medien

### `main.ts`
- `bootstrapApplication(App, appConfig).catch(reportBootstrapError)`

---

## UX-Konventionen
- UI-Texte sind Deutsch — konsistent halten, außer Lokalisierung wird explizit gewünscht
- Hotkeys: `M` = Settings-Modal öffnen, `Escape` = Schließen (nur wenn nicht in Textfeld)
- Focus-Restoration und Toast-Deduplizierung sind erwartetes Verhalten
- Toasts: max 4 sichtbar, auto-remove 3s, Duplikate inkrementieren Counter
- PWA: Install-Hint beim ersten Besuch (nicht Standalone), Update-Notice bei SW-Update

## Arbeitsregeln
- Standalone/Signals-Architektur beibehalten, kleine fokussierte Änderungen
- Keine breiten Refactors oder unrelated Cleanup
- `@angular/build` muss auf gleicher Major wie `@angular/cli` und Angular-Pakete bleiben (sonst Schema-Fehler bei `ng test`)

## Verifikation
- `npm run lint` — ESLint
- `npm test` — Vitest (watch=false)
- `npm run test:coverage:ci` — Coverage + Threshold-Check
- Thresholds: 97% Statements, 93.5% Branches, 94.5% Functions
