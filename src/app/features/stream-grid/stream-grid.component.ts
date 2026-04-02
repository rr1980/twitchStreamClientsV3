import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import type { StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedService } from '../../core/services/twitch-embed.service';
import type { TwitchEmbedHandle } from '../../core/services/twitch-embed.service';
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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(window:resize)': '_onResize()',
  },
})
export class StreamGridComponent implements AfterViewInit, OnDestroy {
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _state = inject(StreamStateService);
  private readonly _twitch = inject(TwitchEmbedService);
  private readonly _toast = inject(ToastService);
  private readonly _renderedEmbeds = new Map<string, RenderedEmbedState>();

  private readonly _hostRef = viewChild<ElementRef<HTMLElement>>('gridHost');
  private readonly _viewportWidth = signal(this._readViewportDimension('innerWidth'));
  private readonly _viewportHeight = signal(this._readViewportDimension('innerHeight'));
  protected readonly _activeList = this._state.activeList;
  protected readonly _listCount = this._state.listCount;
  protected readonly _streams = this._state.streams;

  private _viewReady = false;
  private _syncRunId = 0;
  private _loadScriptErrorVisible = false;

  private readonly _grid = computed(() => calculateOptimalGrid(this._streams(), this._viewportWidth(), this._viewportHeight()));

  protected readonly _gridTemplateColumns = computed(() => `repeat(${this._grid().cols}, 1fr)`);
  protected readonly _gridTemplateRows = computed(() => `repeat(${this._grid().rows}, 1fr)`);

  constructor() {
    effect(() => {
      this._state.streams();
      this._state.quality();

      if (!this._viewReady) {
        return;
      }

      this._scheduleSync();
    });
  }

  public ngAfterViewInit(): void {
    this._viewReady = true;
    this._scheduleSync();
  }

  public ngOnDestroy(): void {
    for (const renderedEmbed of this._renderedEmbeds.values()) {
      renderedEmbed.handle.destroy();
    }

    this._renderedEmbeds.clear();
  }

  protected _onResize(): void {
    this._viewportWidth.set(this._readViewportDimension('innerWidth'));
    this._viewportHeight.set(this._readViewportDimension('innerHeight'));
  }

  private _scheduleSync(): void {
    const runId = ++this._syncRunId;

    queueMicrotask(() => {
      if (runId !== this._syncRunId) {
        return;
      }

      void this._syncEmbeds(runId);
    });
  }

  private async _syncEmbeds(runId: number): Promise<void> {
    if (runId !== this._syncRunId) {
      return;
    }

    const host = this._hostRef()?.nativeElement;

    if (!host) {
      return;
    }

    const streams = this._state.streams();
    const quality = this._state.quality();

    const activeChannels = new Set(streams.map(stream => stream.name));

    if (streams.length === 0) {
      this._removeStaleEmbeds(activeChannels);
      return;
    }

    try {
      await this._twitch.loadScript();
    } catch {
      if (runId !== this._syncRunId) {
        return;
      }

      if (!this._loadScriptErrorVisible) {
        this._loadScriptErrorVisible = true;
        this._toast.show('Twitch-Embed konnte nicht geladen werden. Bitte versuche es erneut.', 'error');
      }

      return;
    }

    if (runId !== this._syncRunId) {
      return;
    }

    this._loadScriptErrorVisible = false;
    this._removeStaleEmbeds(activeChannels);

    streams.forEach((stream, index) => {
      if (runId !== this._syncRunId) {
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

      if (this._isRenderedStateCurrent(stream.name, nextState)) {
        return;
      }

      this._renderedEmbeds.get(stream.name)?.handle.destroy();

      const handle = this._twitch.createEmbed({
        elementId: wrapper.id,
        channel: stream.name,
        quality,
        showChat: stream.showChat,
        muted: nextState.muted,
      });

      this._renderedEmbeds.set(stream.name, {
        ...nextState,
        handle,
      });
    });
  }

  private _removeStaleEmbeds(activeChannels: Set<string>): void {
    for (const [stream, renderedEmbed] of this._renderedEmbeds.entries()) {
      if (activeChannels.has(stream)) {
        continue;
      }

      renderedEmbed.handle.destroy();
      this._renderedEmbeds.delete(stream);
    }
  }

  private _isRenderedStateCurrent(stream: string, nextState: RenderedEmbedSnapshot): boolean {
    const currentState = this._renderedEmbeds.get(stream);

    if (!currentState) {
      return false;
    }

    return currentState.elementId === nextState.elementId
      && currentState.quality === nextState.quality
      && currentState.showChat === nextState.showChat
      && currentState.muted === nextState.muted;
  }

  private _readViewportDimension(dimension: 'innerWidth' | 'innerHeight'): number {
    if (!isPlatformBrowser(this._platformId)) {
      return 0;
    }

    return typeof window[dimension] === 'number' ? window[dimension] : 0;
  }
}