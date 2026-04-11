import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, isDevMode } from '@angular/core';
import type { StreamQuality, StreamQualityOption } from '../models/app-settings.model';
import {
  areStreamQualityOptionsEqual,
  getDefaultStreamQualityLabel,
  normalizeAvailableStreamQualities,
  normalizeStreamQuality,
  normalizeStreamQualityLabel,
} from '../../shared/utils/stream-quality.util';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Twitch?: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      Embed: {
        new (
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
        ): TwitchEmbedInstance;
        VIDEO_READY?: string;
      };
    };
  }
}

interface TwitchPlayer {
  setQuality(value: string): void;
  setMuted?(value: boolean): void;
  getMuted?(): boolean;
  setVolume?(value: number): void;
  getVolume?(): number;
  getQualities(): TwitchQualityDescriptor[];
  getQuality(): string;
}

type TwitchQualityDescriptor = string | {
  name?: string;
  quality?: string;
  value?: string;
  label?: string;
  title?: string;
  displayName?: string;
  display_name?: string;
  localizedName?: string;
  localized_name?: string;
};

interface TwitchEmbedInstance {
  addEventListener(event: string, callback: () => void): void;
  getPlayer(): TwitchPlayer;
}

export interface TwitchEmbedHandle {
  destroy(): void;
  setMuted(value: boolean): void;
}

interface CreateEmbedOptions {
  elementId: string;
  channel: string;
  quality: StreamQuality;
  showChat: boolean;
  muted: boolean;
  onAvailableQualities?: (qualities: StreamQualityOption[]) => void;
}

@Injectable({ providedIn: 'root' })
export class TwitchEmbedService {
  private readonly _maxQualitySyncFrames = 120;
  private readonly _maxQualitySyncDurationMs = 2000;
  private readonly _maxMuteSyncFrames = 600;
  private readonly _maxMuteSyncDurationMs = 10000;
  private readonly _maxPlayerReadySyncFrames = 600;
  private readonly _maxPlayerReadySyncDurationMs = 10000;
  private readonly _document = inject(DOCUMENT);
  private readonly _platformId = inject(PLATFORM_ID);
  private _scriptPromise?: Promise<void>;
  private _didLogQualityDescriptors = false;

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
      return this._createHandle(options.elementId, options.muted);
    }

    const handle = this._createHandle(options.elementId, options.muted);

    const embed = new browserWindow.Twitch.Embed(options.elementId, {
      width: '100%',
      height: '100%',
      channel: options.channel,
      layout: options.showChat ? 'video-with-chat' : 'video',
      autoplay: true,
      muted: options.muted,
      parent: [browserWindow.location.hostname || 'localhost'],
    });
    const readyEvents = new Set([
      browserWindow.Twitch.Embed.VIDEO_READY ?? 'video_ready',
      'video_ready',
      'ready',
    ]);
    let didInitializePlayer = false;

    const initializePlayer = (): boolean => {
      if (didInitializePlayer) {
        return true;
      }

      if (handle.isDestroyed()) {
        return true;
      }

      let player: TwitchPlayer;

      try {
        player = embed.getPlayer();
      } catch {
        return false;
      }

      didInitializePlayer = true;
      handle.setPlayer(player);
      void this._syncRequestedQuality(
        player,
        options.channel,
        options.quality,
        () => handle.isDestroyed(),
        options.onAvailableQualities,
      );

      return true;
    };

    readyEvents.forEach(eventName => {
      embed.addEventListener(eventName, () => {
        initializePlayer();
      });
    });
    void this._syncPlayerReadyState(initializePlayer, () => handle.isDestroyed());

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

      const script = this._document.createElement('script');
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
    onAvailableQualities?: (qualities: StreamQualityOption[]) => void,
  ): Promise<void> {
    const requestedQuality = this._mapRequestedQuality(quality);
    const syncDeadline = Date.now() + this._maxQualitySyncDurationMs;
    let lastPublishedQualities: StreamQualityOption[] = [];

    try {
      for (let frame = 0; frame < this._maxQualitySyncFrames && Date.now() < syncDeadline; frame++) {
        if (isDestroyed()) {
          return;
        }

        const availableQualityOptions = this._readAvailableQualities(player);
        const availableQualities = availableQualityOptions.map(option => option.value);

        if (availableQualityOptions.length > 0 && !areStreamQualityOptionsEqual(availableQualityOptions, lastPublishedQualities)) {
          lastPublishedQualities = availableQualityOptions;
          onAvailableQualities?.(availableQualityOptions);
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
        this._readAvailableQualities(player).map(option => option.value),
      );
    } catch (error) {
      console.warn('[Twitch] Quality Set Error:', error);
    }
  }

  private _readAvailableQualities(player: TwitchPlayer): StreamQualityOption[] {
    const rawQualities = player.getQualities?.() ?? [];

    if (isDevMode() && !this._didLogQualityDescriptors && rawQualities.some(quality => typeof quality !== 'string')) {
      this._didLogQualityDescriptors = true;
      console.info('[Twitch] Raw quality descriptors:', rawQualities);
    }

    return normalizeAvailableStreamQualities(
      rawQualities
        .map(quality => this._normalizeQualityDescriptor(quality))
        .filter((quality): quality is StreamQualityOption => quality !== null),
    );
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
    const normalizedValue = normalizeStreamQuality(value);

    if (normalizedValue === 'auto') {
      return null;
    }

    return normalizedValue;
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

    const requestedFrameRate = this._extractQualityFrameRates(requestedQuality)[0] ?? 0;
    const candidateFrameRates = this._extractQualityFrameRates(candidate);

    if (requestedFrameRate > 0 && candidateFrameRates.includes(requestedFrameRate)) {
      return 2;
    }

    return 3;
  }

  private _extractQualityFrameRates(value: string): number[] {
    return (value.match(/\d+/g) ?? [])
      .slice(1)
      .map(rate => Number(rate))
      .filter(rate => Number.isFinite(rate) && rate > 0);
  }

  private _normalizeQualityDescriptor(descriptor: TwitchQualityDescriptor): StreamQualityOption | null {
    if (typeof descriptor === 'string') {
      const normalizedValue = this._mapRequestedQuality(descriptor);

      return normalizedValue
        ? { value: normalizedValue, label: getDefaultStreamQualityLabel(normalizedValue) }
        : null;
    }

    const normalizedValue = [descriptor.name, descriptor.quality, descriptor.value]
      .map(value => this._mapRequestedQuality(value ?? ''))
      .find((value): value is string => value !== null)
      ?? this._mapRequestedQuality(
        [
          descriptor.label,
          descriptor.displayName,
          descriptor.display_name,
          descriptor.localizedName,
          descriptor.localized_name,
          descriptor.title,
        ].find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? '',
      );

    if (!normalizedValue) {
      return null;
    }

    const rawLabel = [
      descriptor.label,
      descriptor.displayName,
      descriptor.display_name,
      descriptor.localizedName,
      descriptor.localized_name,
      descriptor.title,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    return {
      value: normalizedValue,
      label: normalizeStreamQualityLabel(normalizedValue, rawLabel),
    };
  }

  private async _syncRequestedMutedState(
    player: TwitchPlayer,
    getRequestedMuted: () => boolean,
    getRestoredVolume: () => number,
    setRestoredVolume: (value: number) => void,
    isCancelled: () => boolean,
  ): Promise<void> {
    if (typeof player.setMuted !== 'function') {
      return;
    }

    const syncDeadline = Date.now() + this._maxMuteSyncDurationMs;

    for (let frame = 0; frame < this._maxMuteSyncFrames && Date.now() < syncDeadline; frame++) {
      if (isCancelled()) {
        return;
      }

      const muted = getRequestedMuted();
      const currentVolume = typeof player.getVolume === 'function'
        ? player.getVolume()
        : null;

      if (typeof currentVolume === 'number' && Number.isFinite(currentVolume) && currentVolume > 0) {
        setRestoredVolume(currentVolume);
      }

      player.setMuted(muted);

      if (typeof player.setVolume === 'function') {
        player.setVolume(muted ? 0 : getRestoredVolume());
      }

      const mutedMatches = typeof player.getMuted !== 'function' || player.getMuted() === muted;
      const volumeMatches = typeof player.getVolume !== 'function'
        || (muted
          ? player.getVolume() === 0
          : player.getVolume() > 0);

      if (mutedMatches && volumeMatches) {
        return;
      }

      await this._waitForNextFrame();
    }
  }

  private async _syncPlayerReadyState(
    initializePlayer: () => boolean,
    isDestroyed: () => boolean,
  ): Promise<void> {
    const syncDeadline = Date.now() + this._maxPlayerReadySyncDurationMs;

    for (let frame = 0; frame < this._maxPlayerReadySyncFrames && Date.now() < syncDeadline; frame++) {
      if (isDestroyed()) {
        return;
      }

      await this._waitForNextFrame();

      if (isDestroyed() || initializePlayer()) {
        return;
      }
    }
  }

  private _createHandle(elementId: string, initialMuted: boolean): TwitchEmbedHandle & {
    isDestroyed(): boolean;
    setPlayer(player: TwitchPlayer): void;
  } {
    let destroyed = false;
    let player: TwitchPlayer | null = null;
    let requestedMuted = initialMuted;
    let restoredVolume = 0.5;
    let muteSyncRunId = 0;

    const syncRequestedMutedState = (): void => {
      if (!player || destroyed) {
        return;
      }

      const currentPlayer = player;
      const syncRunId = ++muteSyncRunId;

      void this._syncRequestedMutedState(
        currentPlayer,
        () => requestedMuted,
        () => restoredVolume,
        value => {
          restoredVolume = value;
        },
        () => destroyed || player !== currentPlayer || syncRunId !== muteSyncRunId,
      );
    };

    return {
      destroy: () => {
        if (destroyed) {
          return;
        }

        destroyed = true;
        muteSyncRunId += 1;
        this.clearEmbed(elementId);
      },
      setMuted: (value: boolean) => {
        requestedMuted = value;
        syncRequestedMutedState();
      },
      setPlayer: (nextPlayer: TwitchPlayer) => {
        if (destroyed) {
          return;
        }

        player = nextPlayer;
        syncRequestedMutedState();
      },
      isDestroyed: () => destroyed,
    };
  }
}
