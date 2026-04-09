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
import type { GridItemPlacement } from '../../shared/utils/grid.util';
import type { StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedService } from '../../core/services/twitch-embed.service';
import type { TwitchEmbedHandle } from '../../core/services/twitch-embed.service';
import { calculateStreamGridLayout } from '../../shared/utils/grid.util';
import { areStreamQualityOptionsEqual } from '../../shared/utils/stream-quality.util';
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
  private readonly _availableQualitiesByStream = new Map<string, StreamQualityOption[]>();

  private readonly _hostRef = viewChild<ElementRef<HTMLElement>>('gridHost');
  private readonly _viewportWidth = signal(this._readViewportDimension('innerWidth'));
  private readonly _viewportHeight = signal(this._readViewportDimension('innerHeight'));
  protected readonly _activeList = this._state.activeList;
  protected readonly _listCount = this._state.listCount;
  protected readonly _streams = this._state.streams;
  protected readonly _focusedChannel = this._state.focusedChannel;
  protected readonly _displayedStreams = computed(() => {
    const focusedChannel = this._state.focusedChannel();
    const streams = this._state.streams();

    if (!focusedChannel) {
      return streams;
    }

    const focusedStream = streams.find(stream => stream.name === focusedChannel);

    if (!focusedStream) {
      return streams;
    }

    return [focusedStream, ...streams.filter(stream => stream.name !== focusedChannel)];
  });

  private _viewReady = false;
  private _syncRunId = 0;
  private _loadScriptErrorVisible = false;

  private readonly _grid = computed(() => calculateStreamGridLayout(
    this._displayedStreams(),
    this._viewportWidth(),
    this._viewportHeight(),
    this._state.layoutPreset(),
    this._state.focusedChannel() !== null,
  ));

  protected readonly _gridTemplateColumns = computed(() => `repeat(${this._grid().cols}, 1fr)`);
  protected readonly _gridTemplateRows = computed(() => `repeat(${this._grid().rows}, 1fr)`);

  constructor() {
    effect(() => {
      this._displayedStreams();
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
    if (this._resizeTimer !== null) {
      globalThis.clearTimeout(this._resizeTimer);
    }

    for (const renderedEmbed of this._renderedEmbeds.values()) {
      renderedEmbed.handle.destroy();
    }

    this._renderedEmbeds.clear();
    this._availableQualitiesByStream.clear();
    this._state.setAvailableQualities([]);
  }

  private _resizeTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  protected _onResize(): void {
    if (this._resizeTimer !== null) {
      globalThis.clearTimeout(this._resizeTimer);
    }

    this._resizeTimer = globalThis.setTimeout(() => {
      this._resizeTimer = null;
      this._viewportWidth.set(this._readViewportDimension('innerWidth'));
      this._viewportHeight.set(this._readViewportDimension('innerHeight'));
    }, 150);
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

    const streams = this._displayedStreams();
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

      const wrapperId = this._getEmbedElementId(stream.name);
      const wrapper = host.ownerDocument.getElementById(wrapperId);

      if (!(wrapper instanceof HTMLElement) || !host.contains(wrapper)) {
        return;
      }

      const nextState: RenderedEmbedSnapshot = {
        elementId: wrapperId,
        quality,
        showChat: stream.showChat,
        muted: index !== 0,
      };

      if (this._isRenderedStateCurrent(stream.name, nextState)) {
        return;
      }

      this._renderedEmbeds.get(stream.name)?.handle.destroy();

      const handle = this._twitch.createEmbed({
        elementId: wrapperId,
        channel: stream.name,
        quality,
        showChat: stream.showChat,
        muted: nextState.muted,
        onAvailableQualities: qualities => {
          if (runId !== this._syncRunId) {
            return;
          }

          if (this._renderedEmbeds.get(stream.name)?.handle !== handle) {
            return;
          }

          this._setAvailableQualitiesForStream(stream.name, qualities);
        },
      });

      this._renderedEmbeds.set(stream.name, {
        ...nextState,
        handle,
      });
    });
  }

  private _removeStaleEmbeds(activeChannels: Set<string>): void {
    let removedEmbed = false;

    for (const [stream, renderedEmbed] of this._renderedEmbeds.entries()) {
      if (activeChannels.has(stream)) {
        continue;
      }

      renderedEmbed.handle.destroy();
      this._renderedEmbeds.delete(stream);
      this._availableQualitiesByStream.delete(stream);
      removedEmbed = true;
    }

    if (removedEmbed || activeChannels.size === 0) {
      this._syncAvailableQualities();
    }
  }

  private _setAvailableQualitiesForStream(stream: string, qualities: StreamQualityOption[]): void {
    const seen = new Set<string>();
    const normalizedQualities = qualities
      .map(quality => ({
        value: quality.value.trim(),
        label: quality.label.trim(),
      }))
      .filter(quality => quality.value.length > 0 && quality.label.length > 0)
      .filter(quality => !seen.has(quality.value) && seen.add(quality.value));
    const currentQualities = this._availableQualitiesByStream.get(stream) ?? [];

    if (areStreamQualityOptionsEqual(currentQualities, normalizedQualities)) {
      return;
    }

    if (normalizedQualities.length === 0) {
      this._availableQualitiesByStream.delete(stream);
    } else {
      this._availableQualitiesByStream.set(stream, normalizedQualities);
    }

    this._syncAvailableQualities();
  }

  private _syncAvailableQualities(): void {
    this._state.setAvailableQualities([...this._availableQualitiesByStream.values()].flat());
  }

  private _getEmbedElementId(channel: string): string {
    return `twitch-embed-${channel}`;
  }

  protected _toggleFocusedChannel(channelName: string): void {
    this._state.setFocusedChannel(this._focusedChannel() === channelName ? null : channelName);
  }

  protected _isFocusedChannel(channelName: string): boolean {
    return this._focusedChannel() === channelName;
  }

  protected _getPlacement(index: number): GridItemPlacement {
    return this._grid().placements[index] ?? {};
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
