import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedHandle, TwitchEmbedService } from '../../core/services/twitch-embed.service';
import { calculateOptimalGrid } from '../../shared/utils/grid.util';
import { StreamQuality } from '../../core/models/app-settings.model';

interface RenderedEmbedState {
  elementId: string;
  quality: StreamQuality;
  showChat: boolean;
  muted: boolean;
  handle: TwitchEmbedHandle;
}

type RenderedEmbedSnapshot = Omit<RenderedEmbedState, 'handle'>;

@Component({
  selector: 'app-stream-grid',
  templateUrl: './stream-grid.component.html',
  styleUrl: './stream-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()',
  },
})
export class StreamGridComponent implements AfterViewInit, OnDestroy {
  private readonly state = inject(StreamStateService);
  private readonly twitch = inject(TwitchEmbedService);
  private readonly renderedEmbeds = new Map<string, RenderedEmbedState>();

  readonly hostRef = viewChild<ElementRef<HTMLElement>>('gridHost');
  readonly viewportWidth = signal(window.innerWidth);
  readonly viewportHeight = signal(window.innerHeight);
  readonly streams = this.state.streams;

  private viewReady = false;
  private syncRunId = 0;

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

      const runId = ++this.syncRunId;

      queueMicrotask(() => {
        if (runId !== this.syncRunId) {
          return;
        }

        void this.syncEmbeds(streams, quality, showChat);
      });
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;

    const runId = ++this.syncRunId;

    queueMicrotask(() => {
      if (runId !== this.syncRunId) {
        return;
      }

      void this.syncEmbeds(
        this.state.streams(),
        this.state.quality(),
        this.state.showChat(),
      );
    });
  }

  ngOnDestroy(): void {
    for (const renderedEmbed of this.renderedEmbeds.values()) {
      renderedEmbed.handle.destroy();
    }

    this.renderedEmbeds.clear();
  }

  onResize(): void {
    this.viewportWidth.set(window.innerWidth);
    this.viewportHeight.set(window.innerHeight);
  }

  private async syncEmbeds(
    streams: string[],
    quality: StreamQuality,
    showChat: boolean,
  ): Promise<void> {
    const host = this.hostRef()?.nativeElement;

    if (!host) {
      return;
    }

    const activeChannels = new Set(streams);
    this.removeStaleEmbeds(activeChannels);

    if (streams.length === 0) {
      return;
    }

    await this.twitch.loadScript();

    streams.forEach((stream, index) => {
      const wrapper = host.querySelector<HTMLElement>(`.twitch-embed-wrapper[data-channel="${stream}"]`);

      if (!wrapper) {
        return;
      }

      const nextState: RenderedEmbedSnapshot = {
        elementId: wrapper.id,
        quality,
        showChat,
        muted: index !== 0,
      };

      if (this.isRenderedStateCurrent(stream, nextState)) {
        return;
      }

      this.renderedEmbeds.get(stream)?.handle.destroy();

      const handle = this.twitch.createEmbed({
        elementId: wrapper.id,
        channel: stream,
        quality,
        showChat,
        muted: nextState.muted,
      });

      this.renderedEmbeds.set(stream, {
        ...nextState,
        handle,
      });
    });
  }

  private removeStaleEmbeds(activeChannels: Set<string>): void {
    for (const [stream, renderedEmbed] of this.renderedEmbeds.entries()) {
      if (activeChannels.has(stream)) {
        continue;
      }

      renderedEmbed.handle.destroy();
      this.renderedEmbeds.delete(stream);
    }
  }

  private isRenderedStateCurrent(stream: string, nextState: RenderedEmbedSnapshot): boolean {
    const currentState = this.renderedEmbeds.get(stream);

    if (!currentState) {
      return false;
    }

    return currentState.elementId === nextState.elementId
      && currentState.quality === nextState.quality
      && currentState.showChat === nextState.showChat
      && currentState.muted === nextState.muted;
  }
}