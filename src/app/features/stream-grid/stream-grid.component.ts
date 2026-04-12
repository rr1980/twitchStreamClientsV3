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
/**
 * Computes the visible grid and keeps Twitch embeds synchronized with active state.
 *
 * @remarks Handles grid calculation, embed lifecycle, quality sync, and mute sync for streams.
 * @component
 */
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
  protected readonly _displayedStreams = this._state.streams;

  private _viewReady = false;
  private _syncRunId = 0;
  private _loadScriptErrorVisible = false;
  private _lastMuteAllStreams: boolean | null = null;
  private _lastQuality: StreamQuality | null = null;

  private readonly _grid = computed(() => calculateStreamGridLayout(
    this._displayedStreams(),
    this._viewportWidth(),
    this._viewportHeight(),
    this._state.layoutPreset(),
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

  /**
   * Marks the view as ready and kicks off the first embed synchronization.
   *
   * @returns {void}
   * @remarks Called after the component's view has been fully initialized.
   */
  public ngAfterViewInit(): void {
    this._viewReady = true;
    this._scheduleSync();
  }

  /**
   * Destroys rendered embeds and clears derived quality state on teardown.
   *
   * @returns {void}
   * @remarks Called when the component is destroyed to clean up resources.
   */
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

  /**
   * Debounces viewport changes before recalculating the grid.
   *
   * @returns {void}
   * @remarks Updates the viewport size signals after a short delay.
   */
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

  /**
   * Resumes embed synchronization when the document becomes visible again.
   *
   * @returns {void}
   * @remarks Triggers a sync if the view is ready and the document is visible.
   */
  protected _onDocumentVisibilityChange(): void {
    if (!this._viewReady || this._isDocumentHidden(this._hostRef()?.nativeElement.ownerDocument)) {
      return;
    }

    this._scheduleSync();
  }

  /**
   * Coalesces multiple reactive changes into a single embed synchronization pass.
   *
   * @returns {void}
   * @remarks Ensures only the latest sync run is executed after microtasks.
   * @private
   */
  private _scheduleSync(): void {
    const runId = ++this._syncRunId;

    queueMicrotask(() => {
      if (runId !== this._syncRunId) {
        return;
      }

      void this._syncEmbeds(runId);
    });
  }

  /**
   * Reconciles rendered embeds with the active list, quality, chat, and mute state.
   *
   * @param {number} runId Identifier for the current sync run.
   * @returns {Promise<void>} Promise that resolves when the sync completes.
   * @remarks Reuses existing embeds where possible and recreates them only when wrapper or chat shape changes.
   * @private
   */
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
      this._lastQuality = null;
      this._removeStaleEmbeds(activeChannels);
      return;
    }

    const shouldDeferEmbedSync = this._shouldDeferEmbedSync(host);
    const shouldForceMuteSync = !shouldDeferEmbedSync
      && this._lastMuteAllStreams !== null
      && this._lastMuteAllStreams !== muteAllStreams;
    const shouldForceQualitySync = !shouldDeferEmbedSync
      && this._lastQuality !== null
      && this._lastQuality !== quality;
    const pendingEmbedSyncs: PendingEmbedSync[] = [];

    this._removeStaleEmbeds(activeChannels);

    if (!shouldDeferEmbedSync) {
      this._lastMuteAllStreams = muteAllStreams;
      this._lastQuality = quality;
    }

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
        muted: muteAllStreams,
      };

      const currentState = this._renderedEmbeds.get(stream.name);

      if (currentState) {
        if (this._canReuseEmbed(currentState, nextState)) {
          if (!shouldDeferEmbedSync) {
            this._syncMutedState(currentState, nextState, shouldForceMuteSync);
            this._syncQualityState(currentState, nextState, shouldForceQualitySync);
          }

          return;
        }

        if (shouldDeferEmbedSync) {
          return;
        }
      } else if (shouldDeferEmbedSync) {
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
          this._syncQualityState(currentState, nextState, shouldForceQualitySync);
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

  /**
   * Destroys embeds for channels that are no longer part of the active view.
   *
   * @param {Set<string>} activeChannels Set of channel names that should remain active.
   * @returns {void}
   * @remarks Also republishes available quality options when rendered embed state changes.
   * @private
   */
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
        this._lastQuality = null;
      }

      this._syncAvailableQualities();
    }
  }

  /**
   * Stores the latest quality set for one stream and republishes the flattened union.
   *
   * @param {string} stream Name of the stream channel.
   * @param {StreamQualityOption[]} qualities Available quality options reported for the stream.
   * @returns {void}
   * @remarks Deduplicates and trims option values before merging them into the shared quality state.
   * @private
   */
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

  /**
   * Publishes the merged quality options reported by all currently rendered embeds.
   *
   * @returns {void}
   * @remarks Flattens the per-stream cache into one list consumed by the shared state service.
   * @private
   */
  private _syncAvailableQualities(): void {
    this._state.setAvailableQualities([...this._availableQualitiesByStream.values()].flat());
  }

  /**
   * Builds the DOM id used for a stream's embed host element.
   *
   * @param {string} channel Name of the stream channel.
   * @returns {string} DOM element id for the embed host.
   * @private
   */
  private _getEmbedElementId(channel: string): string {
    return `twitch-embed-${channel}`;
  }

  /**
   * Returns the placement override for a rendered tile.
   *
   * @param {number} index Index of the tile in the grid.
   * @returns {GridItemPlacement} Placement override for the tile, or an empty object when none exists.
   */
  protected _getPlacement(index: number): GridItemPlacement {
    return this._grid().placements[index] ?? {};
  }

  /**
   * Returns whether an existing embed can be kept without recreation.
   *
   * @param {RenderedEmbedState} currentState Current rendered embed state.
   * @param {RenderedEmbedSnapshot} nextState Next desired embed state.
   * @returns {boolean} `true` when the embed can be reused.
   * @remarks Reuse is intentionally limited to cases where wrapper identity and chat shape stay unchanged.
   * @private
   */
  private _canReuseEmbed(currentState: RenderedEmbedState, nextState: RenderedEmbedSnapshot): boolean {
    return currentState.elementId === nextState.elementId
      && currentState.showChat === nextState.showChat;
  }

  /**
   * Applies mute changes to an existing embed only when the state actually changed.
   *
   * @param {RenderedEmbedState} currentState Current rendered embed state.
   * @param {RenderedEmbedSnapshot} nextState Next desired embed state.
   * @param {boolean} force Whether the mute update should be forced regardless of state.
   * @returns {void}
   * @private
   */
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

  /**
   * Applies quality changes to an existing embed only when necessary.
   *
   * @param {RenderedEmbedState} currentState Current rendered embed state.
   * @param {RenderedEmbedSnapshot} nextState Next desired embed state.
   * @param {boolean} force Whether the quality update should be forced regardless of state.
   * @returns {void}
   * @private
   */
  private _syncQualityState(
    currentState: RenderedEmbedState,
    nextState: RenderedEmbedSnapshot,
    force: boolean,
  ): void {
    if (!force && currentState.quality === nextState.quality) {
      return;
    }

    currentState.quality = nextState.quality;
    currentState.handle.setQuality(nextState.quality);
  }

  /**
   * Defers expensive embed work while the modal is open or the document is hidden.
   *
   * @param {HTMLElement} host Host element of the grid.
   * @returns {boolean} `true` when embed sync should be deferred.
   * @remarks Avoids eager embed churn while the menu is open or the page is hidden.
   * @private
   */
  private _shouldDeferEmbedSync(host: HTMLElement): boolean {
    return this._state.menuOpen() || this._isDocumentHidden(host.ownerDocument);
  }

  /**
   * Returns whether the referenced document is currently hidden.
   *
   * @param {Document | undefined} documentRef Document to check.
   * @returns {boolean} `true` when the document is hidden.
   * @private
   */
  private _isDocumentHidden(documentRef: Document | undefined): boolean {
    return documentRef?.visibilityState === 'hidden';
  }

  /**
   * Reads the viewport size on the browser and falls back to zero during SSR.
   *
   * @param {'innerWidth' | 'innerHeight'} dimension Window property to read, such as `innerWidth` or `innerHeight`.
   * @returns {number} Viewport dimension in pixels, or `0` when unavailable.
   * @private
   */
  private _readViewportDimension(dimension: 'innerWidth' | 'innerHeight'): number {
    if (!isPlatformBrowser(this._platformId)) {
      return 0;
    }

    return typeof window[dimension] === 'number' ? window[dimension] : 0;
  }
}
