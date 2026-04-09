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

  public dismissStartupHint(): void {
    this._startupHintVisible.set(false);
    this._storage.setBoolean(this._startupHintSeenKey, true);
  }

  public dismissUpdateNotice(): void {
    this._updateAvailable.set(false);
  }

  public async install(): Promise<void> {
    const promptEvent = this._installPromptEvent();

    if (!promptEvent) {
      return;
    }

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    if (choice.outcome === 'accepted') {
      this.dismissStartupHint();
    }

    this._installPromptEvent.set(null);
  }

  public reloadForUpdate(): void {
    const browserWindow = this._window;

    if (!browserWindow) {
      return;
    }

    browserWindow.location.reload();
  }

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

  private _isStandaloneMode(): boolean {
    const browserWindow = this._window;

    if (!browserWindow) {
      return false;
    }

    return browserWindow.matchMedia?.('(display-mode: standalone)').matches === true
      || (browserWindow.navigator as NavigatorWithStandalone).standalone === true;
  }

  private get _window(): Window | null {
    return this._document.defaultView;
  }
}
