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
import type { StreamChannel, StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';
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

interface PendingEmbedSync {
  stream: StreamChannel;
  nextState: RenderedEmbedSnapshot;
}

@Component({
  selector: 'app-stream-grid',
  templateUrl: './stream-grid.component.html',
  styleUrl: './stream-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(window:resize)': '_onResize()',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(document:visibilitychange)': '_onDocumentVisibilityChange()',
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
  private _lastMuteAllStreams: boolean | null = null;

  private readonly _grid = computed(() => calculateStreamGridLayout(
    this._displayedStreams(),
    this._viewportWidth(),
    this._viewportHeight(),
    this._state.layoutPreset(),
    this._state.focusedChannel() !== null,
  ));

  protected readonly _gridTemplateColumns = computed(
    () => `repeat(${this._grid().cols}, minmax(var(--twitch-embed-min-width), 1fr))`,
  );
  protected readonly _gridTemplateRows = computed(
    () => `repeat(${this._grid().rows}, minmax(var(--twitch-embed-min-height), 1fr))`,
  );

  constructor() {
    effect(() => {
      this._displayedStreams();
      this._state.quality();
      this._state.menuOpen();
      this._state.muteAllStreams();

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

  protected _onDocumentVisibilityChange(): void {
    if (!this._viewReady || this._isDocumentHidden(this._hostRef()?.nativeElement.ownerDocument)) {
      return;
    }

    this._scheduleSync();
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
    const muteAllStreams = this._state.muteAllStreams();

    const activeChannels = new Set(streams.map(stream => stream.name));

    if (streams.length === 0) {
      this._lastMuteAllStreams = null;
      this._removeStaleEmbeds(activeChannels);
      return;
    }

    const shouldDeferNewEmbeds = this._shouldDeferEmbedStartup(host);
    const shouldForceMuteSync = this._lastMuteAllStreams !== null && this._lastMuteAllStreams !== muteAllStreams;
    const pendingEmbedSyncs: PendingEmbedSync[] = [];

    this._removeStaleEmbeds(activeChannels);
    this._lastMuteAllStreams = muteAllStreams;

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
        muted: muteAllStreams || index !== 0,
      };

      const currentState = this._renderedEmbeds.get(stream.name);

      if (currentState) {
        if (this._canReuseEmbed(currentState, nextState)) {
          this._syncMutedState(currentState, nextState, shouldForceMuteSync);
          return;
        }

        if (shouldDeferNewEmbeds) {
          this._syncMutedState(currentState, nextState, shouldForceMuteSync);
          return;
        }
      } else if (shouldDeferNewEmbeds) {
        return;
      }

      pendingEmbedSyncs.push({ stream, nextState });
    });

    if (pendingEmbedSyncs.length === 0) {
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

    pendingEmbedSyncs.forEach(({ stream, nextState }) => {
      if (runId !== this._syncRunId) {
        return;
      }

      const wrapper = host.ownerDocument.getElementById(nextState.elementId);

      if (!(wrapper instanceof HTMLElement) || !host.contains(wrapper)) {
        return;
      }

      const currentState = this._renderedEmbeds.get(stream.name);

      if (currentState) {
        if (this._canReuseEmbed(currentState, nextState)) {
          this._syncMutedState(currentState, nextState, shouldForceMuteSync);
          return;
        }

        currentState.handle.destroy();
      }

      const handle = this._twitch.createEmbed({
        elementId: nextState.elementId,
        channel: stream.name,
        quality: nextState.quality,
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
      if (activeChannels.size === 0) {
        this._lastMuteAllStreams = null;
      }

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

  private _canReuseEmbed(currentState: RenderedEmbedState, nextState: RenderedEmbedSnapshot): boolean {
    return currentState.elementId === nextState.elementId
      && currentState.quality === nextState.quality
      && currentState.showChat === nextState.showChat;
  }

  private _syncMutedState(
    currentState: RenderedEmbedState,
    nextState: RenderedEmbedSnapshot,
    force: boolean,
  ): void {
    if (!force && currentState.muted === nextState.muted) {
      return;
    }

    currentState.muted = nextState.muted;
    currentState.handle.setMuted(nextState.muted);
  }

  private _shouldDeferEmbedStartup(host: HTMLElement): boolean {
    return this._state.menuOpen() || this._isDocumentHidden(host.ownerDocument);
  }

  private _isDocumentHidden(documentRef: Document | undefined): boolean {
    return documentRef?.visibilityState === 'hidden';
  }

  private _readViewportDimension(dimension: 'innerWidth' | 'innerHeight'): number {
    if (!isPlatformBrowser(this._platformId)) {
      return 0;
    }

    return typeof window[dimension] === 'number' ? window[dimension] : 0;
  }
}
