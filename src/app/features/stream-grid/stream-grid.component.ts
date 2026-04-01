import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedService } from '../../core/services/twitch-embed.service';
import { calculateOptimalGrid } from '../../shared/utils/grid.util';

@Component({ 
  selector: 'app-stream-grid',
  standalone: true,
  templateUrl: './stream-grid.component.html',
  styleUrl: './stream-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreamGridComponent implements AfterViewInit {
  private readonly state = inject(StreamStateService);
  private readonly twitch = inject(TwitchEmbedService);

  readonly hostRef = viewChild<ElementRef<HTMLElement>>('gridHost');
  readonly viewportWidth = signal(window.innerWidth);
  readonly viewportHeight = signal(window.innerHeight);
  readonly streams = this.state.streams;

  private viewReady = false;

  readonly grid = computed(() =>
    calculateOptimalGrid(
      this.streams().length,
      this.viewportWidth(),
      this.viewportHeight(),
      this.state.showChat(),
    ),
  );

  readonly gridTemplateColumns = computed(() => `repeat(${this.grid().cols}, 1fr)`);
  readonly gridTemplateRows = computed(() => `repeat(${this.grid().rows}, 1fr)`);

  constructor() {
    effect(() => {
      const streams = this.state.streams();
      const quality = this.state.quality();
      const showChat = this.state.showChat();

      if (!this.viewReady) {
        return;
      }

      queueMicrotask(async () => {
        await this.renderEmbeds(streams, quality, showChat);
      });
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    queueMicrotask(async () => {
      await this.renderEmbeds(
        this.state.streams(),
        this.state.quality(),
        this.state.showChat(),
      );
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    this.viewportWidth.set(window.innerWidth);
    this.viewportHeight.set(window.innerHeight);
  }

  private async renderEmbeds(
    streams: string[],
    quality: 'auto' | '480p' | '720p60' | 'chunked',
    showChat: boolean,
  ): Promise<void> {
    const host = this.hostRef()?.nativeElement;
    if (!host || streams.length === 0) {
      return;
    }

    await this.twitch.loadScript();

    console.debug('Rendering Twitch Embeds', { streams, quality, showChat });

    const wrappers = host.querySelectorAll<HTMLElement>('.twitch-embed-wrapper');
    wrappers.forEach((wrapper, index) => {
      wrapper.innerHTML = '';
      this.twitch.createEmbed({
        elementId: wrapper.id,
        channel: streams[index],
        quality,
        showChat,
        muted: index !== 0,
      });
    });
  }
}