import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { StreamQuality } from '../models/app-settings.model';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Twitch?: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Embed: new (
        elementId: string,
        options: {
          width: string;
          height: string;
          channel: string;
          layout: 'video' | 'video-with-chat';
          autoplay: boolean;
          muted: boolean;
          parent: string[];
        },
      ) => TwitchEmbedInstance;
    };
  }
}

interface TwitchPlayer {
  setQuality(value: string): void;
  getQualities(): (string | { name?: string })[];
  getQuality(): string;
}

interface TwitchEmbedInstance {
  addEventListener(event: string, callback: () => void): void;
  getPlayer(): TwitchPlayer;
}

export interface TwitchEmbedHandle {
  destroy(): void;
}

interface CreateEmbedOptions {
  elementId: string;
  channel: string;
  quality: StreamQuality;
  showChat: boolean;
  muted: boolean;
  onAvailableQualities?: (qualities: StreamQuality[]) => void;
}

@Injectable({ providedIn: 'root' })
export class TwitchEmbedService {
  private readonly _maxQualitySyncFrames = 120;
  private readonly _document = inject(DOCUMENT);
  private readonly _platformId = inject(PLATFORM_ID);
  private _scriptPromise?: Promise<void>;

  public loadScript(): Promise<void> {
    const browserWindow = this._window;

    if (!browserWindow) {
      return Promise.resolve();
    }

    if (browserWindow.Twitch?.Embed) {
      return Promise.resolve();
    }

    if (this._scriptPromise) {
      return this._scriptPromise;
    }

    this._scriptPromise = this._createScriptPromise();

    return this._scriptPromise;
  }

  public createEmbed(options: CreateEmbedOptions): TwitchEmbedHandle {
    const browserWindow = this._window;

    if (!browserWindow?.Twitch?.Embed) {
      return this._createHandle(options.elementId);
    }

    const handle = this._createHandle(options.elementId);

    const embed = new browserWindow.Twitch.Embed(options.elementId, {
      width: '100%',
      height: '100%',
      channel: options.channel,
      layout: options.showChat ? 'video-with-chat' : 'video',
      autoplay: true,
      muted: options.muted,
      parent: [browserWindow.location.hostname || 'localhost'],
    });

    embed.addEventListener('ready', () => {
      if (handle.isDestroyed()) {
        return;
      }

      const player = embed.getPlayer();
      void this._syncRequestedQuality(
        player,
        options.channel,
        options.quality,
        () => handle.isDestroyed(),
        options.onAvailableQualities,
      );
    });

    return handle;
  }

  public clearEmbed(elementId: string): void {
    this._document.getElementById(elementId)?.replaceChildren();
  }

  private _createScriptPromise(): Promise<void> {
    const browserWindow = this._window;

    if (!browserWindow) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const existingScript = this._document.querySelector<HTMLScriptElement>('script[data-twitch-embed="true"]');

      if (existingScript) {
        if (browserWindow.Twitch?.Embed) {
          resolve();
          return;
        }

        if (existingScript.dataset['loadState'] === 'error') {
          existingScript.remove();
        } else {
          this._attachScriptListeners(existingScript, resolve, reject);
          return;
        }
      }

      const script = document.createElement('script');
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.async = true;
      script.dataset['twitchEmbed'] = 'true';
      this._attachScriptListeners(script, resolve, reject);

      if (!this._document.head) {
        this._scriptPromise = undefined;
        reject(new Error('Document head is unavailable.'));
        return;
      }

      this._document.head.appendChild(script);
    });
  }

  private _attachScriptListeners(
    script: HTMLScriptElement,
    resolve: () => void,
    reject: (reason?: unknown) => void,
  ): void {
    const browserWindow = this._window;

    script.addEventListener('load', () => {
      script.dataset['loadState'] = 'loaded';

      if (browserWindow?.Twitch?.Embed) {
        resolve();
        return;
      }

      this._resetScriptState(script);
      reject(new Error('Twitch embed script loaded without exposing Twitch.Embed.'));
    }, { once: true });

    script.addEventListener('error', () => {
      this._resetScriptState(script);
      reject(new Error('Twitch embed script failed.'));
    }, { once: true });
  }

  private _resetScriptState(script: HTMLScriptElement): void {
    script.dataset['loadState'] = 'error';
    script.remove();
    this._scriptPromise = undefined;
  }

  private async _syncRequestedQuality(
    player: TwitchPlayer,
    channel: string,
    quality: StreamQuality,
    isDestroyed: () => boolean,
    onAvailableQualities?: (qualities: StreamQuality[]) => void,
  ): Promise<void> {
    const requestedQuality = this._mapRequestedQuality(quality);

    try {
      for (let frame = 0; frame < this._maxQualitySyncFrames; frame++) {
        if (isDestroyed()) {
          return;
        }

        const availableQualities = this._readAvailableQualities(player);

        if (availableQualities.length > 0) {
          onAvailableQualities?.(availableQualities);
        }

        if (!requestedQuality) {
          if (availableQualities.length > 0) {
            return;
          }

          await this._waitForNextFrame();
          continue;
        }

        const resolvedQuality = this._resolveRequestedQuality(requestedQuality, availableQualities);

        if (resolvedQuality) {
          player.setQuality(resolvedQuality);
          return;
        }

        await this._waitForNextFrame();
      }

      if (!requestedQuality) {
        return;
      }

      console.warn(
        `[Twitch] Quality '${requestedQuality}' für Channel '${channel}' nicht verfügbar.`,
        this._readAvailableQualities(player),
      );
    } catch (error) {
      console.warn('[Twitch] Quality Set Error:', error);
    }
  }

  private _readAvailableQualities(player: TwitchPlayer): string[] {
    return (player.getQualities?.() ?? [])
      .map(quality => typeof quality === 'string' ? quality : quality.name ?? '')
      .filter((quality): quality is string => quality.length > 0);
  }

  private _waitForNextFrame(): Promise<void> {
    return new Promise(resolve => {
      const browserWindow = this._window;

      if (!browserWindow?.requestAnimationFrame) {
        globalThis.setTimeout(resolve, 0);
        return;
      }

      browserWindow.requestAnimationFrame(() => resolve());
    });
  }

  private get _window(): Window | null {
    if (!isPlatformBrowser(this._platformId)) {
      return null;
    }

    return this._document.defaultView;
  }

  private _mapRequestedQuality(value: StreamQuality): string | null {
    const normalizedValue = typeof value === 'string' ? value.trim() : 'auto';

    if (normalizedValue === 'auto') {
      return null;
    }

    return /^(chunked|audio_only|\d+p(?:\d+(?:-\d+)?)?)$/i.test(normalizedValue)
      ? normalizedValue
      : null;
  }

  private _resolveRequestedQuality(requestedQuality: string, availableQualities: string[]): string | null {
    if (availableQualities.includes(requestedQuality)) {
      return requestedQuality;
    }

    if (requestedQuality === 'chunked') {
      return null;
    }

    const qualityFamily = this._extractQualityFamily(requestedQuality);

    if (!qualityFamily) {
      return null;
    }

    const familyMatches = availableQualities.filter(quality => this._extractQualityFamily(quality) === qualityFamily);

    if (familyMatches.length === 0) {
      return null;
    }

    return this._rankQualityMatches(requestedQuality, qualityFamily, familyMatches)[0] ?? null;
  }

  private _extractQualityFamily(value: string): string | null {
    const match = value.match(/^\d+p/);

    return match?.[0] ?? null;
  }

  private _rankQualityMatches(requestedQuality: string, qualityFamily: string, matches: string[]): string[] {
    return [...matches].sort((left, right) => {
      return this._getQualityMatchScore(left, requestedQuality, qualityFamily)
        - this._getQualityMatchScore(right, requestedQuality, qualityFamily);
    });
  }

  private _getQualityMatchScore(candidate: string, requestedQuality: string, qualityFamily: string): number {
    if (candidate === requestedQuality) {
      return 0;
    }

    if (candidate === qualityFamily) {
      return 1;
    }

    if (requestedQuality.endsWith('60') && candidate.includes('60')) {
      return 2;
    }

    return 3;
  }

  private _createHandle(elementId: string): TwitchEmbedHandle & { isDestroyed(): boolean } {
    let destroyed = false;

    return {
      destroy: () => {
        if (destroyed) {
          return;
        }

        destroyed = true;
        this.clearEmbed(elementId);
      },
      isDestroyed: () => destroyed,
    };
  }
}