import { Injectable } from '@angular/core';
import type { StreamQuality } from '../models/app-settings.model';

declare global {
  interface Window {
    Twitch?: {
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

@Injectable({ providedIn: 'root' })
export class TwitchEmbedService {
  private readonly maxQualitySyncFrames = 120;
  private scriptPromise?: Promise<void>;

  public loadScript(): Promise<void> {
    if (window.Twitch?.Embed) {
      return Promise.resolve();
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = this.createScriptPromise();

    return this.scriptPromise;
  }

  public createEmbed(options: {
    elementId: string;
    channel: string;
    quality: StreamQuality;
    showChat: boolean;
    muted: boolean;
  }): TwitchEmbedHandle {
    if (!window.Twitch?.Embed) {
      return this.createHandle(options.elementId);
    }

    const handle = this.createHandle(options.elementId);

    const embed = new window.Twitch.Embed(options.elementId, {
      width: '100%',
      height: '100%',
      channel: options.channel,
      layout: options.showChat ? 'video-with-chat' : 'video',
      autoplay: true,
      muted: options.muted,
      parent: [window.location.hostname || 'localhost'],
    });

    embed.addEventListener('ready', () => {
      if (handle.isDestroyed()) {
        return;
      }

      const player = embed.getPlayer();
      void this.syncRequestedQuality(player, options.channel, options.quality, () => handle.isDestroyed());
    });

    return handle;
  }

  public clearEmbed(elementId: string): void {
    document.getElementById(elementId)?.replaceChildren();
  }

  private createScriptPromise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-twitch-embed="true"]');

      if (existingScript) {
        if (window.Twitch?.Embed) {
          resolve();
          return;
        }

        if (existingScript.dataset['loadState'] === 'error') {
          existingScript.remove();
        } else {
          this.attachScriptListeners(existingScript, resolve, reject);
          return;
        }
      }

      const script = document.createElement('script');
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.async = true;
      script.dataset['twitchEmbed'] = 'true';
      this.attachScriptListeners(script, resolve, reject);
      document.head.appendChild(script);
    });
  }

  private attachScriptListeners(
    script: HTMLScriptElement,
    resolve: () => void,
    reject: (reason?: unknown) => void,
  ): void {
    script.addEventListener('load', () => {
      script.dataset['loadState'] = 'loaded';

      if (window.Twitch?.Embed) {
        resolve();
        return;
      }

      this.resetScriptState(script);
      reject(new Error('Twitch embed script loaded without exposing Twitch.Embed.'));
    }, { once: true });

    script.addEventListener('error', () => {
      this.resetScriptState(script);
      reject(new Error('Twitch embed script failed.'));
    }, { once: true });
  }

  private resetScriptState(script: HTMLScriptElement): void {
    script.dataset['loadState'] = 'error';
    script.remove();
    this.scriptPromise = undefined;
  }

  private async syncRequestedQuality(
    player: TwitchPlayer,
    channel: string,
    quality: StreamQuality,
    isDestroyed: () => boolean,
  ): Promise<void> {
    const requestedQuality = this.mapRequestedQuality(quality);

    if (!requestedQuality) {
      return;
    }

    try {
      for (let frame = 0; frame < this.maxQualitySyncFrames; frame++) {
        if (isDestroyed()) {
          return;
        }

        const availableQualities = this.readAvailableQualities(player);
        const resolvedQuality = this.resolveRequestedQuality(requestedQuality, availableQualities);

        if (resolvedQuality) {
          player.setQuality(resolvedQuality);
          return;
        }

        await this.waitForNextFrame();
      }

      console.warn(
        `[Twitch] Quality '${requestedQuality}' für Channel '${channel}' nicht verfügbar.`,
        this.readAvailableQualities(player),
      );
    } catch (error) {
      console.warn('[Twitch] Quality Set Error:', error);
    }
  }

  private readAvailableQualities(player: TwitchPlayer): string[] {
    return (player.getQualities?.() ?? [])
      .map(quality => typeof quality === 'string' ? quality : quality.name ?? '')
      .filter((quality): quality is string => quality.length > 0);
  }

  private waitForNextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }

  private mapRequestedQuality(value: StreamQuality): string | null {
    switch (value) {
      case 'auto':
        return null;
      case 'chunked':
        return 'chunked';
      case '480p':
        return '480p';
      case '720p60':
        return '720p60';
      default:
        return null;
    }
  }

  private resolveRequestedQuality(requestedQuality: string, availableQualities: string[]): string | null {
    if (availableQualities.includes(requestedQuality)) {
      return requestedQuality;
    }

    if (requestedQuality === 'chunked') {
      return null;
    }

    const qualityFamily = this.extractQualityFamily(requestedQuality);

    if (!qualityFamily) {
      return null;
    }

    const familyMatches = availableQualities.filter(quality => this.extractQualityFamily(quality) === qualityFamily);

    if (familyMatches.length === 0) {
      return null;
    }

    return this.rankQualityMatches(requestedQuality, qualityFamily, familyMatches)[0] ?? null;
  }

  private extractQualityFamily(value: string): string | null {
    const match = value.match(/^\d+p/);

    return match?.[0] ?? null;
  }

  private rankQualityMatches(requestedQuality: string, qualityFamily: string, matches: string[]): string[] {
    return [...matches].sort((left, right) => {
      return this.getQualityMatchScore(left, requestedQuality, qualityFamily)
        - this.getQualityMatchScore(right, requestedQuality, qualityFamily);
    });
  }

  private getQualityMatchScore(candidate: string, requestedQuality: string, qualityFamily: string): number {
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

  private createHandle(elementId: string): TwitchEmbedHandle & { isDestroyed(): boolean } {
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