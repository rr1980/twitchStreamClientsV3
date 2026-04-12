import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { HotkeyService } from './core/services/hotkey.service';
import { ListNavigationService } from './core/services/list-navigation.service';
import { SettingsModalComponent } from './features/settings-modal/settings-modal.component';
import { ToastContainerComponent } from './features/toast/toast-container.component';
import { StreamStateService } from './core/services/stream-state.service';
import { PwaService } from './core/services/pwa.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SettingsModalComponent, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(window:keydown)': '_onWindowKeydown($event)',
  },
})
/**
 * Coordinates route-driven list state, document title updates, and global shell actions.
 *
 * @remarks This is the root component of the application. It synchronizes the route with the active list state, updates the document title, and handles shell-level actions such as hotkeys and PWA install or update flows.
 */
export class App {
  protected readonly _state = inject(StreamStateService);
  protected readonly _pwa = inject(PwaService);
  private readonly _document = inject(DOCUMENT);
  private readonly _hotkeys = inject(HotkeyService);
  private readonly _listNavigation = inject(ListNavigationService);
  private readonly _title = inject(Title);
  private readonly _router = inject(Router);
  private _didAttemptInitialRestore = false;
  private readonly _activeListIdFromRoute = toSignal(
    this._router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this._listNavigation.readListId(this._router.url)),
      startWith(this._listNavigation.readListId(this._router.url)),
    ),
    { initialValue: this._listNavigation.readListId(this._router.url) },
  );

  constructor() {
    effect(() => {
      const activeListId = this._activeListIdFromRoute();

      this._state.setActiveListId(activeListId);

      if (!this._didAttemptInitialRestore) {
        this._didAttemptInitialRestore = true;
        this._restoreInitialView(activeListId);
      }
    });

    effect(() => {
      this._title.setTitle(this._buildDocumentTitle());
    });
  }

  /**
   * Delegates global hotkeys and prevents the browser default when consumed.
   *
   * @param {KeyboardEvent} event Keyboard event raised on window keydown.
   * @returns {void}
   */
  protected _onWindowKeydown(event: KeyboardEvent): void {
    if (this._hotkeys.handleWindowKeydown(event, this._document.activeElement)) {
      event.preventDefault();
    }
  }

  /**
   * Opens the settings menu from shell UI controls.
   *
   * @returns {void}
   * @remarks Triggers the state service to open the settings menu modal.
   */
  protected _openMenu(): void {
    this._state.openMenu();
  }

  /**
   * Starts the deferred PWA install flow.
   *
   * @returns {void}
   * @remarks Initiates the PWA installation prompt when available.
   */
  protected _installApp(): void {
    void this._pwa.install();
  }

  /**
   * Hides the startup install hint.
   *
   * @returns {void}
   * @remarks Dismisses the PWA startup hint for the user.
   */
  protected _dismissStartupHint(): void {
    this._pwa.dismissStartupHint();
  }

  /**
   * Reloads the app so a ready service worker update becomes active.
   *
   * @returns {void}
   * @remarks Forces a reload to activate a newly installed service worker version.
   */
  protected _reloadForUpdate(): void {
    this._pwa.reloadForUpdate();
  }

  /**
   * Hides the current update notice without reloading.
   *
   * @returns {void}
   * @remarks Dismisses the update notification without reloading the application.
   */
  protected _dismissUpdateNotice(): void {
    this._pwa.dismissUpdateNotice();
  }

  /**
   * Builds the document title from the active or requested list context.
   *
   * @returns {string} Document title string based on the current list context.
   */
  private _buildDocumentTitle(): string {
    const activeList = this._state.activeList();
    const activeListId = this._state.activeListId();

    if (activeList) {
      return `${activeList.name} | Twitch Multi-Viewer`;
    }

    if (activeListId !== null) {
      return `Liste ${activeListId} nicht gefunden | Twitch Multi-Viewer`;
    }

    return 'Twitch Multi-Viewer';
  }

  /**
   * Restores the last active list when the app starts on the null route.
   *
   * @param {number | null} activeListId List id currently active from the route.
   * @returns {void}
   * @remarks Navigates to the last active list when the current route is `null` and the list still exists.
   */
  private _restoreInitialView(activeListId: number | null): void {
    const lastActiveListId = this._state.lastActiveListId();

    if (activeListId !== null || lastActiveListId === null) {
      return;
    }

    if (!this._state.lists().some(list => list.id === lastActiveListId)) {
      return;
    }

    queueMicrotask(() => {
      this._listNavigation.navigateToList(lastActiveListId);
    });
  }
}
