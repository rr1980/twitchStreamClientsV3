import { Injectable } from '@angular/core';
import { StreamQuality } from '../models/app-settings.model';

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

@Injectable({ providedIn: 'root' })
export class TwitchEmbedService {
  private readonly maxQualitySyncFrames = 120;
  private scriptPromise?: Promise<void>;

  loadScript(): Promise<void> {
    if (window.Twitch?.Embed) {
      return Promise.resolve();
    }

    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = this.createScriptPromise();

    return this.scriptPromise;
  }

  createEmbed(options: {
    elementId: string;
    channel: string;
    quality: StreamQuality;
    showChat: boolean;
    muted: boolean;
  }): void {
    if (!window.Twitch?.Embed) {
      return;
    }

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
      const player = embed.getPlayer();
      void this.syncRequestedQuality(player, options.channel, options.quality);
    });
  }

  clearEmbed(elementId: string): void {
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
  ): Promise<void> {
    const requestedQuality = this.mapRequestedQuality(quality);

    if (!requestedQuality) {
      return;
    }

    try {
      for (let frame = 0; frame < this.maxQualitySyncFrames; frame++) {
        const availableQualities = this.readAvailableQualities(player);

        if (availableQualities.includes(requestedQuality)) {
          player.setQuality(requestedQuality);
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
}