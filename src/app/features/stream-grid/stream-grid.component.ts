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
import { StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedHandle, TwitchEmbedService } from '../../core/services/twitch-embed.service';
import { calculateOptimalGrid } from '../../shared/utils/grid.util';
import { ToastService } from '../toast/toast.service';

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
  private readonly toast = inject(ToastService);
  private readonly renderedEmbeds = new Map<string, RenderedEmbedState>();

  readonly hostRef = viewChild<ElementRef<HTMLElement>>('gridHost');
  readonly viewportWidth = signal(window.innerWidth);
  readonly viewportHeight = signal(window.innerHeight);
  readonly activeList = this.state.activeList;
  readonly listCount = this.state.listCount;
  readonly streams = this.state.streams;

  private viewReady = false;
  private syncRunId = 0;
  private loadScriptErrorVisible = false;

  readonly grid = computed(() => calculateOptimalGrid(this.streams(), this.viewportWidth(), this.viewportHeight()));

  readonly gridTemplateColumns = computed(() => `repeat(${this.grid().cols}, 1fr)`);
  readonly gridTemplateRows = computed(() => `repeat(${this.grid().rows}, 1fr)`);

  constructor() {
    effect(() => {
      this.state.streams();
      this.state.quality();

      if (!this.viewReady) {
        return;
      }

      this.scheduleSync();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.scheduleSync();
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

  private scheduleSync(): void {
    const runId = ++this.syncRunId;

    queueMicrotask(() => {
      if (runId !== this.syncRunId) {
        return;
      }

      void this.syncEmbeds(runId);
    });
  }

  private async syncEmbeds(runId: number): Promise<void> {
    if (runId !== this.syncRunId) {
      return;
    }

    const host = this.hostRef()?.nativeElement;

    if (!host) {
      return;
    }

    const streams = this.state.streams();
    const quality = this.state.quality();

    const activeChannels = new Set(streams.map(stream => stream.name));

    if (streams.length === 0) {
      this.removeStaleEmbeds(activeChannels);
      return;
    }

    try {
      await this.twitch.loadScript();
    } catch {
      if (runId !== this.syncRunId) {
        return;
      }

      if (!this.loadScriptErrorVisible) {
        this.loadScriptErrorVisible = true;
        this.toast.show('Twitch-Embed konnte nicht geladen werden. Bitte versuche es erneut.', 'error');
      }

      return;
    }

    if (runId !== this.syncRunId) {
      return;
    }

    this.loadScriptErrorVisible = false;
    this.removeStaleEmbeds(activeChannels);

    streams.forEach((stream, index) => {
      if (runId !== this.syncRunId) {
        return;
      }

      const wrapper = host.querySelector<HTMLElement>(`.twitch-embed-wrapper[data-channel="${stream.name}"]`);

      if (!wrapper) {
        return;
      }

      const nextState: RenderedEmbedSnapshot = {
        elementId: wrapper.id,
        quality,
        showChat: stream.showChat,
        muted: index !== 0,
      };

      if (this.isRenderedStateCurrent(stream.name, nextState)) {
        return;
      }

      this.renderedEmbeds.get(stream.name)?.handle.destroy();

      const handle = this.twitch.createEmbed({
        elementId: wrapper.id,
        channel: stream.name,
        quality,
        showChat: stream.showChat,
        muted: nextState.muted,
      });

      this.renderedEmbeds.set(stream.name, {
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