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

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-twitch-embed="true"]');

      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Twitch embed script failed.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.async = true;
      script.dataset['twitchEmbed'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Twitch embed script failed.'));
      document.head.appendChild(script);
    });

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