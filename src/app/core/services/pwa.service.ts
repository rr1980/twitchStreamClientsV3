import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { StorageService } from './storage.service';

interface BeforeInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
}

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

@Injectable({ providedIn: 'root' })
/**
 * Manages install prompts, startup hints, and service worker update notices.
 *
 * @remarks Handles PWA installation lifecycle, startup hints, and service worker update notifications for the application shell.
 */
export class PwaService {
  private readonly _startupHintSeenKey = 'pwa_startup_hint_seen_v1';
  private readonly _document = inject(DOCUMENT);
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _storage = inject(StorageService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _swUpdate = inject(SwUpdate, { optional: true });

  private readonly _installPromptEvent = signal<BeforeInstallPromptEvent | null>(null);
  private readonly _startupHintVisible = signal(false);
  private readonly _updateAvailable = signal(false);

  public readonly canInstall = computed(() => this._installPromptEvent() !== null);
  public readonly startupHintVisible = this._startupHintVisible.asReadonly();
  public readonly updateAvailable = this._updateAvailable.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    this._startupHintVisible.set(!this._storage.getBoolean(this._startupHintSeenKey, false) && !this._isStandaloneMode());
    this._registerInstallEvents();
    this._registerUpdateEvents();
  }

  /**
   * Hides the install hint and records that the user has seen it.
   *
   * @returns {void}
   * @remarks Sets the startup hint to hidden and persists that dismissal in storage.
   */
  public dismissStartupHint(): void {
    this._startupHintVisible.set(false);
    this._storage.setBoolean(this._startupHintSeenKey, true);
  }

  /**
   * Dismisses the currently visible update notice.
   *
   * @returns {void}
   * @remarks Hides the update notification for the current session.
   */
  public dismissUpdateNotice(): void {
    this._updateAvailable.set(false);
  }

  /**
   * Triggers the deferred install prompt when the browser supports it.
   *
   * @returns {Promise<void>} Promise that resolves when the install prompt flow completes.
   * @remarks If the user accepts the install, the startup hint is dismissed. If no prompt is available, nothing happens.
   */
  public async install(): Promise<void> {
    const promptEvent = this._installPromptEvent();

    if (!promptEvent) {
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === 'accepted') {
        this.dismissStartupHint();
      }
    } catch {
      // Browser rejected the install prompt – nothing we can do.
    } finally {
      this._installPromptEvent.set(null);
    }
  }

  /**
   * Reloads the current page to activate the latest deployed version.
   *
   * @returns {void}
   * @remarks Forces a browser reload so a newly ready service worker version becomes active.
   */
  public reloadForUpdate(): void {
    const browserWindow = this._window;

    if (!browserWindow) {
      return;
    }

    browserWindow.location.reload();
  }

  /**
   * Registers browser install prompt lifecycle events and their cleanup.
   *
   * @returns {void}
   * @remarks Handles `beforeinstallprompt` and `appinstalled` events and unregisters listeners on service destruction.
   */
  private _registerInstallEvents(): void {
    const browserWindow = this._window;

    if (!browserWindow) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event): void => {
      const promptEvent = event as BeforeInstallPromptEvent;

      if (typeof promptEvent.preventDefault === 'function') {
        promptEvent.preventDefault();
      }

      this._installPromptEvent.set(promptEvent);
    };
    const onAppInstalled = (): void => {
      this._installPromptEvent.set(null);
      this.dismissStartupHint();
    };

    browserWindow.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    browserWindow.addEventListener('appinstalled', onAppInstalled);

    this._destroyRef.onDestroy(() => {
      browserWindow.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      browserWindow.removeEventListener('appinstalled', onAppInstalled);
    });
  }

  /**
   * Subscribes to service worker version readiness events when enabled.
   *
   * @returns {void}
   * @remarks Listens for `VERSION_READY` events from [`SwUpdate`](src/app/core/services/pwa.service.ts:3) and sets the update signal.
   */
  private _registerUpdateEvents(): void {
    if (!this._swUpdate?.isEnabled) {
      return;
    }

    const subscription = this._swUpdate.versionUpdates.pipe(
      filter(event => event.type === 'VERSION_READY'),
    ).subscribe(() => {
      this._updateAvailable.set(true);
    });

    this._destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /**
   * Detects whether the app already runs in installed standalone mode.
   *
   * @returns {boolean} `true` when the app is already running in standalone mode.
   */
  private _isStandaloneMode(): boolean {
    const browserWindow = this._window;

    if (!browserWindow) {
      return false;
    }

    return browserWindow.matchMedia?.('(display-mode: standalone)').matches === true
      || (browserWindow.navigator as NavigatorWithStandalone).standalone === true;
  }

  /**
   * Returns the current browser window when available.
   *
   * @returns {Window | null} Current browser window, or `null` when unavailable.
   */
  private get _window(): Window | null {
    return this._document.defaultView;
  }
}
