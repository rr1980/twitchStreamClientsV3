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
        [eventConstant: string]: unknown;
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

/**
 * Represents a live Twitch embed instance that can be updated or destroyed.
 *
 * @remarks Provides methods to destroy the embed, update mute state, and set stream quality.
 */
export interface TwitchEmbedHandle {
  destroy(): void;
  setMuted(value: boolean): void;
  setQuality(value: StreamQuality): void;
}

/**
 * Options used to create and initialize one Twitch embed instance.
 *
 * @property {string} elementId DOM element id of the embed container.
 * @property {string} channel Twitch channel name to render.
 * @property {StreamQuality} quality Requested stream quality.
 * @property {boolean} showChat Whether chat should be rendered next to the stream.
 * @property {boolean} muted Initial muted state requested by the app.
 * @property {((qualities: StreamQualityOption[]) => void) | undefined} onAvailableQualities Optional callback invoked when the player reports available qualities.
 */
interface CreateEmbedOptions {
  elementId: string;
  channel: string;
  quality: StreamQuality;
  showChat: boolean;
  muted: boolean;
  onAvailableQualities?: (qualities: StreamQualityOption[]) => void;
}

@Injectable({ providedIn: 'root' })
/**
 * Loads the Twitch embed script and keeps player instances synchronized with app state.
 *
 * @remarks Handles dynamic script loading, embed creation, and synchronization of player quality and mute state with the application.
 */
export class TwitchEmbedService {
  private readonly _maxQualitySyncFrames = 120;
  private readonly _maxQualitySyncDurationMs = 2000;
  private readonly _minMuteSyncFrames = 30;
  private readonly _maxMuteSyncFrames = 600;
  private readonly _maxMuteSyncDurationMs = 10000;
  private readonly _document = inject(DOCUMENT);
  private readonly _platformId = inject(PLATFORM_ID);
  private _scriptPromise?: Promise<void>;
  private _didLogQualityDescriptors = false;

  /**
   * Loads the Twitch embed script once and reuses the pending request.
   *
   * @returns {Promise<void>} Promise that resolves when the script is loaded and [`Twitch.Embed`](src/app/core/services/twitch-embed.service.ts:207) is available.
   */
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

  /**
   * Creates an embed handle for a stream and wires quality and mute synchronization.
   *
   * @param {CreateEmbedOptions} options Options used to create the embed instance.
   * @returns {TwitchEmbedHandle} Handle used to control the embed instance.
   * @remarks When the Twitch API is unavailable, the method still returns a no-op compatible handle.
   */
  public createEmbed(options: CreateEmbedOptions): TwitchEmbedHandle {
    const browserWindow = this._window;

    if (!browserWindow?.Twitch?.Embed) {
      return this._createHandle(options.elementId, options.muted, options.quality);
    }

    const handle = this._createHandle(options.elementId, options.muted, options.quality);

    const embed = new browserWindow.Twitch.Embed(options.elementId, {
      width: '100%',
      height: '100%',
      channel: options.channel,
      layout: options.showChat ? 'video-with-chat' : 'video',
      autoplay: true,
      muted: true,
      parent: [browserWindow.location.hostname || 'localhost'],
    });
    const twitchReadyEvent = browserWindow.Twitch.Embed['VIDEO_READY'];
    const readyEvents = new Set([
      typeof twitchReadyEvent === 'string' ? twitchReadyEvent : 'video.ready',
      'video.ready',
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
      handle.setQualityCallbackChannel(options.channel, options.onAvailableQualities);
      handle.setPlayer(player);

      return true;
    };

    readyEvents.forEach(eventName => {
      embed.addEventListener(eventName, () => {
        initializePlayer();
      });
    });

    return handle;
  }

  /**
   * Clears the embed container for a previously rendered player.
   *
   * @param {string} elementId DOM element id to clear.
   * @returns {void}
   */
  public clearEmbed(elementId: string): void {
    this._document.getElementById(elementId)?.replaceChildren();
  }

  /**
   * Creates or reuses the Twitch script tag and resolves once [`Twitch.Embed`](src/app/core/services/twitch-embed.service.ts:206) is available.
   *
   * @returns {Promise<void>} Promise that resolves once the Twitch embed API can be used.
   */
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

  /**
   * Attaches one-shot load and error listeners to the Twitch script element.
   *
   * @param {HTMLScriptElement} script Script element used for the Twitch embed loader.
   * @param {() => void} resolve Callback that resolves the loading promise.
   * @param {(reason?: unknown) => void} reject Callback that rejects the loading promise.
   * @returns {void}
   */
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

  /**
   * Resets the cached script-loading state after a failed Twitch script load.
   *
   * @param {HTMLScriptElement} script Script element affected by the failed load.
   * @returns {void}
   */
  private _resetScriptState(script: HTMLScriptElement): void {
    script.dataset['loadState'] = 'error';
    script.remove();
    this._scriptPromise = undefined;
  }

  /**
   * Repeatedly tries to apply the requested quality until Twitch exposes usable options.
   *
   * @param {TwitchPlayer} player Current Twitch player instance.
   * @param {string} channel Channel name used for quality error logging.
   * @param {StreamQuality} quality Requested quality in the app-specific format.
   * @param {() => boolean} isDestroyed Abort condition for stale or destroyed embeds.
   * @param {(qualities: StreamQualityOption[]) => void} [onAvailableQualities] Optional callback for detected quality options.
   * @returns {Promise<void>} Promise that settles when quality synchronization completes or aborts.
   */
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
            player.setQuality('auto');
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
        `[Twitch] Quality '${requestedQuality}' is not available for channel '${channel}'.`,
        this._readAvailableQualities(player).map(option => option.value),
      );
    } catch (error) {
      console.warn('[Twitch] Quality Set Error:', error);
    }
  }

  /**
   * Reads and normalizes quality options from the current Twitch player instance.
   *
   * @param {TwitchPlayer} player Current Twitch player instance.
   * @returns {StreamQualityOption[]} Normalized quality options reported by the player.
   */
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

  /**
   * Awaits the next animation frame or falls back to a timer outside the browser.
   *
   * @returns {Promise<void>} Promise that resolves on the next render step.
   */
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

  /**
   * Returns the current browser window when Twitch embed APIs are available.
   *
   * @returns {Window | null} Browser window or `null` when running outside the browser.
   */
  private get _window(): Window | null {
    if (!isPlatformBrowser(this._platformId)) {
      return null;
    }

    return this._document.defaultView;
  }

  /**
   * Converts app quality values into Twitch player quality identifiers.
   *
   * @param {StreamQuality} value Quality value in the app-specific format.
   * @returns {string | null} Twitch quality identifier or `null` for automatic mode.
   */
  private _mapRequestedQuality(value: StreamQuality): string | null {
    const normalizedValue = normalizeStreamQuality(value);

    if (normalizedValue === 'auto') {
      return null;
    }

    return normalizedValue;
  }

  /**
   * Resolves the best available Twitch quality for the requested normalized value.
   *
   * @param {string} requestedQuality Normalized target quality.
   * @param {string[]} availableQualities Available Twitch quality identifiers.
   * @returns {string | null} Best matching Twitch quality or `null` when no mapping is possible.
   */
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

    if (familyMatches.length > 0) {
      return this._rankQualityMatches(requestedQuality, qualityFamily, familyMatches)[0] ?? null;
    }

    return this._findNearestResolution(requestedQuality, availableQualities);
  }

  /**
   * Chooses the closest available resolution when the exact requested quality is missing.
   *
   * @param {string} requestedQuality Requested quality identifier.
   * @param {string[]} availableQualities Available Twitch quality identifiers.
   * @returns {string | null} Quality identifier with the smallest distance from the request.
   */
  private _findNearestResolution(requestedQuality: string, availableQualities: string[]): string | null {
    const requestedMatch = requestedQuality.match(/^(\d+)p/);

    if (!requestedMatch) {
      return null;
    }

    const requestedResolution = Number(requestedMatch[1]);
    const requestedFrameRates = this._extractQualityFrameRates(requestedQuality);
    const requestedFrameRate = requestedFrameRates[0] ?? 0;
    let bestMatch: string | null = null;
    let bestDistance = Infinity;
    let bestResolution = -1;
    let bestFrameRate = -1;

    for (const quality of availableQualities) {
      if (quality === 'chunked' || quality === 'audio_only') {
        continue;
      }

      const resolutionMatch = quality.match(/^(\d+)p/);

      if (!resolutionMatch) {
        continue;
      }

      const resolution = Number(resolutionMatch[1]);
      const distance = Math.abs(resolution - requestedResolution);
      const candidateFrameRate = this._extractQualityFrameRates(quality)[0] ?? 0;

      if (
        distance < bestDistance
        || (distance === bestDistance && resolution > bestResolution)
        || (distance === bestDistance && resolution === bestResolution
          && Math.abs(candidateFrameRate - requestedFrameRate) < Math.abs(bestFrameRate - requestedFrameRate))
      ) {
        bestDistance = distance;
        bestMatch = quality;
        bestResolution = resolution;
        bestFrameRate = candidateFrameRate;
      }
    }

    return bestMatch;
  }

  /**
   * Extracts the resolution family token from a Twitch quality string.
   *
   * @param {string} value Twitch quality identifier.
   * @returns {string | null} Resolution family such as `720p`, or `null` when none matches.
   */
  private _extractQualityFamily(value: string): string | null {
    const match = value.match(/^\d+p/);

    return match?.[0] ?? null;
  }

  /**
   * Sorts same-family quality candidates by how closely they match the request.
   *
   * @param {string} requestedQuality Requested quality identifier.
   * @param {string} qualityFamily Resolution family derived from the request.
   * @param {string[]} matches Candidates from the same quality family.
   * @returns {string[]} Candidates ordered from best to worst match.
   */
  private _rankQualityMatches(requestedQuality: string, qualityFamily: string, matches: string[]): string[] {
    return [...matches].sort((left, right) => {
      return this._getQualityMatchScore(left, requestedQuality, qualityFamily)
        - this._getQualityMatchScore(right, requestedQuality, qualityFamily);
    });
  }

  /**
   * Scores same-family candidates so the closest Twitch quality wins.
   *
   * @param {string} candidate Quality identifier being scored.
   * @param {string} requestedQuality Requested quality identifier.
   * @param {string} qualityFamily Resolution family derived from the request.
   * @returns {number} Lower scores indicate a better match.
   */
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

  /**
   * Extracts numeric frame-rate hints from a Twitch quality label.
   *
   * @param {string} value Twitch quality identifier.
   * @returns {number[]} Detected frame rates in numeric form.
   */
  private _extractQualityFrameRates(value: string): number[] {
    return (value.match(/\d+/g) ?? [])
      .slice(1)
      .map(rate => Number(rate))
      .filter(rate => Number.isFinite(rate) && rate > 0);
  }

  /**
   * Converts Twitch quality descriptors into normalized app quality options.
   *
   * @param {TwitchQualityDescriptor} descriptor Quality descriptor returned by the Twitch API.
   * @returns {StreamQualityOption | null} Normalized quality option or `null` when no mapping is possible.
   */
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

  /**
   * Re-applies mute and volume until the player reflects the requested audio state.
   *
   * @param {TwitchPlayer} player Current Twitch player instance.
   * @param {() => boolean} getRequestedMuted Returns the requested muted state.
   * @param {() => number} getRestoredVolume Returns the last known volume for unmuted playback.
   * @param {(value: number) => void} setRestoredVolume Stores a newly detected volume level.
   * @param {() => boolean} isCancelled Abort condition for stale synchronization runs.
   * @returns {Promise<void>} Promise that settles when audio synchronization completes or is cancelled.
   */
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

      if (mutedMatches && volumeMatches && frame >= this._minMuteSyncFrames) {
        return;
      }

      await this._waitForNextFrame();
    }
  }

  /**
   * Creates the mutable handle abstraction used by the grid to manage one embed instance.
   *
   * @param {string} elementId DOM element id of the embed container.
   * @param {boolean} initialMuted Initial muted state.
   * @returns {TwitchEmbedHandle & { isDestroyed(): boolean; setPlayer(player: TwitchPlayer): void; }} Control object for the embed lifecycle, audio state, and quality.
   */
  private _createHandle(elementId: string, initialMuted: boolean, initialQuality: StreamQuality): TwitchEmbedHandle & {
    isDestroyed(): boolean;
    setPlayer(player: TwitchPlayer): void;
    setQualityCallbackChannel(channel: string, onAvailableQualities?: (qualities: StreamQualityOption[]) => void): void;
  } {
    let destroyed = false;
    let player: TwitchPlayer | null = null;
    let requestedMuted = initialMuted;
    let requestedQuality: StreamQuality = initialQuality;
    let qualityChannel = '';
    let onAvailableQualities: ((qualities: StreamQualityOption[]) => void) | undefined;
    let restoredVolume = 0.5;
    let muteSyncRunId = 0;
    let qualitySyncRunId = 0;

    /**
     * Starts or restarts mute synchronization for the current player instance.
     *
     * @returns {void}
     */
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

    /**
     * Starts or restarts quality synchronization for the current player instance.
     *
     * @returns {void}
     */
    const syncRequestedQuality = (): void => {
      if (!player || destroyed) {
        return;
      }

      const currentPlayer = player;
      const syncRunId = ++qualitySyncRunId;

      void this._syncRequestedQuality(
        currentPlayer,
        qualityChannel,
        requestedQuality,
        () => destroyed || player !== currentPlayer || syncRunId !== qualitySyncRunId,
        onAvailableQualities,
      );
    };

    return {
      destroy: () => {
        if (destroyed) {
          return;
        }

        destroyed = true;
        muteSyncRunId += 1;
        qualitySyncRunId += 1;
        this.clearEmbed(elementId);
      },
      setMuted: (value: boolean) => {
        requestedMuted = value;
        syncRequestedMutedState();
      },
      setQuality: (value: StreamQuality) => {
        requestedQuality = value;
        syncRequestedQuality();
      },
      setPlayer: (nextPlayer: TwitchPlayer) => {
        if (destroyed) {
          return;
        }

        player = nextPlayer;
        syncRequestedMutedState();
        syncRequestedQuality();
      },
      setQualityCallbackChannel: (channel: string, onAvailableQualitiesCallback?: (qualities: StreamQualityOption[]) => void) => {
        qualityChannel = channel;
        onAvailableQualities = onAvailableQualitiesCallback;
      },
      isDestroyed: () => destroyed,
    };
  }
}
