import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { StorageService } from './storage.service';

/**
 * User choice payload returned by the deferred install prompt.
 *
 * @remarks The browser resolves this only after the user closes the install prompt, allowing the service to persist dismissal state conditionally.
 */
interface BeforeInstallPromptChoice {
  /** Whether the install prompt was accepted or dismissed. */
  outcome: 'accepted' | 'dismissed';

  /** Platform identifier returned by the browser. */
  platform: string;
}

/**
 * Browser install prompt event surfaced before the app can be installed.
 *
 * @remarks The event is browser-specific and intentionally kept local to this service so unsupported environments degrade without leaking the custom type through the app.
 */
interface BeforeInstallPromptEvent extends Event {
  /** Opens the browser-provided install prompt. */
  prompt(): Promise<void>;

  /** Resolves with the user's final prompt choice. */
  userChoice: Promise<BeforeInstallPromptChoice>;
}

/**
 * Browser navigator shape that may expose the legacy standalone flag on iOS.
 *
 * @remarks Safari on iOS historically exposes standalone mode through `navigator.standalone` instead of `matchMedia('(display-mode: standalone)')`.
 */
type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

@Injectable({ providedIn: 'root' })
/**
 * Manages install prompts, startup hints, and service worker update notices.
 *
 * @remarks This service centralizes all PWA-specific browser integration so the shell can react through signals instead of wiring raw install and service-worker events itself.
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

  /** Read-only signal exposing whether the browser currently allows PWA installation. */
  public readonly canInstall = computed(() => this._installPromptEvent() !== null);

  /** Read-only signal exposing whether the startup install hint should be visible. */
  public readonly startupHintVisible = this._startupHintVisible.asReadonly();

  /** Read-only signal exposing whether a service worker update is ready to activate. */
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
   * @remarks Sets the startup hint to hidden and persists that dismissal in storage.
    * @returns {void}
   */
  public dismissStartupHint(): void {
    this._startupHintVisible.set(false);
    this._storage.setBoolean(this._startupHintSeenKey, true);
  }

  /**
   * Dismisses the currently visible update notice.
   *
   * @remarks Hides the update notification for the current session.
    * @returns {void}
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
   * @remarks Forces a browser reload so a newly ready service worker version becomes active.
    * @returns {void}
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
    * @remarks Handles `beforeinstallprompt` and `appinstalled` events, captures the deferred prompt for later user-driven installation, and unregisters listeners on service destruction.
    * @returns {void}
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
    * @remarks Listens for `VERSION_READY` events from [`SwUpdate`](src/app/core/services/pwa.service.ts:3) and flips a signal instead of reloading immediately, so the shell can let the user control when the update is activated.
    * @returns {void}
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
