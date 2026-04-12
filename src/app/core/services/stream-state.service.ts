import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type {
  AppSettings,
  StreamChannel,
  StreamLayoutPreset,
  StreamList,
  StreamQuality,
  StreamQualityOption,
  StreamStatistic,
} from '../models/app-settings.model';
import { StorageService } from './storage.service';
import { ToastService } from '../../features/toast/toast.service';
import {
  buildAvailableStreamQualityOptions,
  normalizeAvailableStreamQualities,
  normalizeStreamQuality,
} from '../../shared/utils/stream-quality.util';

type PersistedStreamState = AppSettings;
type StoredState = Partial<PersistedStreamState> & {
  showChat?: unknown;
  quality?: unknown;
  layoutPreset?: unknown;
  focusedChannel?: unknown;
};

type StreamMutationResultReason = 'empty' | 'invalid' | 'duplicate' | 'no-list';
type ListMutationResultReason = 'empty' | 'duplicate' | 'not-found';

interface NormalizeStoredListsOptions {
  defaultShowChat: boolean;
  defaultQuality: StreamQuality;
  defaultLayoutPreset: StreamLayoutPreset;
  defaultFocusedChannel: string | null;
  defaultFocusedListId: number | null;
}

interface StreamMutationResult {
  ok: boolean;
  reason?: StreamMutationResultReason;
  name?: string;
}

interface ListMutationResult {
  ok: boolean;
  reason?: ListMutationResultReason;
  list?: StreamList;
}

@Injectable({ providedIn: 'root' })
/**
 * Owns the normalized application state and persists it to localStorage.
 *
 * @remarks Centralizes list, stream, favorites, and persistence logic behind the application's state signals.
 */
export class StreamStateService {
  private readonly _stateKey = 'app_state_v3';
  private readonly _maxRecentChannels = 24;

  private readonly _lists = signal<StreamList[]>([]);
  private readonly _activeListId = signal<number | null>(null);
  private readonly _reportedAvailableQualities = signal<StreamQualityOption[]>([]);
  private readonly _statistics = signal<StreamStatistic[]>([]);
  private readonly _favoriteChannels = signal<string[]>([]);
  private readonly _recentChannels = signal<string[]>([]);
  private readonly _lastActiveListId = signal<number | null>(null);
  private readonly _menuOpen = signal(false);

  public readonly lists = computed(() => this._lists());
  public readonly activeListId = computed(() => this._activeListId());
  public readonly activeList = computed(() => this._lists().find(list => list.id === this._activeListId()) ?? null);
  public readonly streams = computed(() => this.activeList()?.streams ?? []);
  public readonly quality = computed(() => normalizeStreamQuality(this.activeList()?.quality ?? 'auto'));
  public readonly availableQualities = computed(() => buildAvailableStreamQualityOptions(
    this._reportedAvailableQualities(),
    this.quality(),
  ));
  public readonly statistics = computed(() => this._statistics());
  public readonly favoriteChannels = computed(() => this._favoriteChannels());
  public readonly recentChannels = computed(() => this._recentChannels());
  public readonly layoutPreset = computed(() => this._normalizeStoredLayoutPreset(this.activeList()?.layoutPreset));
  public readonly focusedChannel = computed(() => this.activeList()?.focusedChannel ?? null);
  public readonly muteAllStreams = computed(() => this.activeList()?.muteAllStreams === true);
  public readonly lastActiveListId = computed(() => this._lastActiveListId());
  public readonly menuOpen = computed(() => this._menuOpen());
  public readonly streamCount = computed(() => this.streams().length);
  public readonly listCount = computed(() => this._lists().length);

  private readonly _storage = inject(StorageService);
  private readonly _toast = inject(ToastService);
  private _pendingPersistState?: PersistedStreamState;
  private _persistScheduled = false;
  private _persistFailureVisible = false;
  private _initialized = false;

  constructor() {
    effect(() => {
      if (!this._initialized) {
        return;
      }

      this._schedulePersist({
        lists: this._lists(),
        statistics: this._statistics(),
        favoriteChannels: this._favoriteChannels(),
        recentChannels: this._recentChannels(),
        lastActiveListId: this._lastActiveListId(),
      });
    });
  }

  /**
   * Loads persisted state once and enables subsequent automatic persistence.
   *
   * @returns {void}
   */
  public initialize(): void {
    if (this._initialized) {
      return;
    }

    this._init();
    this._initialized = true;
  }

  /**
   * Opens the settings menu.
   *
   * @returns {void}
   */
  public openMenu(): void {
    this._menuOpen.set(true);
  }

  /**
   * Closes the settings menu.
   *
   * @returns {void}
   */
  public closeMenu(): void {
    this._menuOpen.set(false);
  }

  /**
   * Toggles the settings menu visibility.
   *
   * @returns {void}
   */
  public toggleMenu(): void {
    this._menuOpen.update(value => !value);
  }

  /**
   * Updates the active list id and tracks it as the last active list when valid.
   *
   * @param {number | null} listId Id of the list that should become active, or `null` to clear the selection.
   * @returns {void}
   */
  public setActiveListId(listId: number | null): void {
    this._activeListId.set(listId);

    if (listId !== null && this._isKnownListId(listId)) {
      this._lastActiveListId.set(listId);
    }
  }

  /**
   * Creates a new empty list after validating and normalizing the requested name.
   *
   * @param {string} rawName Raw list name from the UI.
   * @returns {ListMutationResult} Result of the list creation, including a failure reason or the created list.
   */
  public createList(rawName: string): ListMutationResult {
    const name = this._normalizeListName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    if (this._hasListName(name)) {
      return { ok: false, reason: 'duplicate' };
    }

    const list: StreamList = {
      id: this._getNextListId(),
      name,
      streams: [],
      quality: 'auto',
      layoutPreset: 'auto',
      focusedChannel: null,
      muteAllStreams: false,
    };

    this._lists.update(values => [...values, list]);

    return { ok: true, list };
  }

  /**
   * Renames an existing list when the target name is valid and unique.
   *
   * @param {number} listId Id of the list to rename.
   * @param {string} rawName Raw new list name.
   * @returns {ListMutationResult} Result of the rename operation, including a failure reason or the updated list.
   */
  public renameList(listId: number, rawName: string): ListMutationResult {
    const name = this._normalizeListName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    const currentList = this._lists().find(list => list.id === listId);

    if (!currentList) {
      return { ok: false, reason: 'not-found' };
    }

    if (this._hasListName(name, listId)) {
      return { ok: false, reason: 'duplicate' };
    }

    const list = {
      ...currentList,
      name,
    };

    this._lists.update(values => values.map(item => item.id === listId ? list : item));

    return { ok: true, list };
  }

  /**
   * Clones the selected list, including stream configuration and list-scoped settings.
   *
   * @param {number} listId Id of the list to duplicate.
   * @returns {ListMutationResult} Result of the duplication, including a failure reason or the new list.
   */
  public duplicateList(listId: number): ListMutationResult {
    const sourceList = this._lists().find(list => list.id === listId);

    if (!sourceList) {
      return { ok: false, reason: 'not-found' };
    }

    const list: StreamList = {
      id: this._getNextListId(),
      name: this._buildDuplicateListName(sourceList.name),
      streams: sourceList.streams.map(stream => ({ ...stream })),
      quality: normalizeStreamQuality(sourceList.quality ?? 'auto'),
      layoutPreset: this._normalizeStoredLayoutPreset(sourceList.layoutPreset),
      focusedChannel: this._normalizeStoredFocusedChannel(sourceList.focusedChannel, sourceList.streams),
      muteAllStreams: sourceList.muteAllStreams === true,
    };

    this._lists.update(values => [...values, list]);

    return { ok: true, list };
  }

  /**
   * Deletes a list and clears active references that pointed to it.
   *
   * @param {number} listId Id of the list to delete.
   * @returns {StreamList | null} Removed list, or `null` when no list with that id exists.
   */
  public deleteList(listId: number): StreamList | null {
    const current = this._lists();
    const removed = current.find(list => list.id === listId) ?? null;

    if (!removed) {
      return null;
    }

    this._lists.set(current.filter(list => list.id !== listId));

    if (this._activeListId() === listId) {
      this._activeListId.set(null);
    }

    if (this._lastActiveListId() === listId) {
      this._lastActiveListId.set(this._lists()[0]?.id ?? null);
    }

    return removed;
  }

  /**
   * Adds a normalized channel to the active list and updates recents and statistics.
   *
   * @param {string} rawName Raw channel name from user input.
   * @returns {StreamMutationResult} Result of the add operation, including the validated channel name or a failure reason.
   */
  public addStream(rawName: string): StreamMutationResult {
    const name = this._normalizeChannelName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    const activeList = this.activeList();

    if (!activeList) {
      return { ok: false, reason: 'no-list' };
    }

    if (!this._isValidChannelName(name)) {
      return { ok: false, reason: 'invalid' };
    }

    if (activeList.streams.some(stream => stream.name === name)) {
      return { ok: false, reason: 'duplicate', name };
    }

    this._updateList(activeList.id, list => ({
      ...list,
      streams: [...list.streams, { name, showChat: false }],
    }));
    this._bumpStatistic(name);
    this._touchRecentChannel(name);

    return { ok: true, name };
  }

  /**
   * Removes a stream from the active list and clears focus if needed.
   *
   * @param {number} index Index of the stream to remove from the active list.
   * @returns {string | null} Name of the removed channel, or `null` when nothing was removed.
   */
  public removeStream(index: number): string | null {
    const activeList = this.activeList();

    if (!activeList) {
      return null;
    }

    const current = [...activeList.streams];
    const removed = current[index];

    if (removed === undefined) {
      return null;
    }

    current.splice(index, 1);
    this._updateList(activeList.id, list => ({
      ...list,
      streams: current,
      focusedChannel: list.focusedChannel === removed.name ? null : list.focusedChannel ?? null,
    }));

    return removed.name;
  }

  /**
   * Moves a stream one position up or down inside the active list.
   *
   * @param {number} index Current position of the stream.
   * @param {-1 | 1} direction Movement direction relative to the current position.
   * @returns {void}
   */
  public moveStream(index: number, direction: -1 | 1): void {
    this.reorderStreams(index, index + direction);
  }

  /**
   * Reorders the active list streams when both indices are within bounds.
   *
   * @param {number} fromIndex Original index of the stream.
   * @param {number} toIndex Target index of the stream.
   * @returns {void}
   */
  public reorderStreams(fromIndex: number, toIndex: number): void {
    const activeList = this.activeList();

    if (!activeList) {
      return;
    }

    const current = [...activeList.streams];

    if (fromIndex < 0 || fromIndex >= current.length || toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) {
      return;
    }

    const [movedStream] = current.splice(fromIndex, 1);

    if (!movedStream) {
      return;
    }

    current.splice(toIndex, 0, movedStream);

    this._updateList(activeList.id, list => ({
      ...list,
      streams: current,
    }));
  }

  /**
   * Persists the active list quality after normalizing the requested value.
   *
   * @param {StreamQuality} value Requested quality level from the UI or persistence.
   * @returns {void}
   */
  public setQuality(value: StreamQuality): void {
    this._updateActiveList(list => {
      const quality = normalizeStreamQuality(value);

      if (normalizeStreamQuality(list.quality ?? 'auto') === quality) {
        return list;
      }

      return {
        ...list,
        quality,
      };
    });
  }

  /**
   * Stores the union of qualities currently reported by active embeds.
   *
   * @param {StreamQualityOption[]} values Quality options reported by active embeds.
   * @returns {void}
   */
  public setAvailableQualities(values: StreamQualityOption[]): void {
    this._reportedAvailableQualities.set(normalizeAvailableStreamQualities(values));
  }

  /**
   * Updates the active list layout preset when it changes.
   *
   * @param {StreamLayoutPreset} value New layout preset for the active list.
   * @returns {void}
   */
  public setLayoutPreset(value: StreamLayoutPreset): void {
    this._updateActiveList(list => {
      const layoutPreset = this._normalizeStoredLayoutPreset(value);

      if (this._normalizeStoredLayoutPreset(list.layoutPreset) === layoutPreset) {
        return list;
      }

      return {
        ...list,
        layoutPreset,
      };
    });
  }

  /**
   * Focuses a single stream in the active list or clears the focus state.
   *
   * @param {string | null} rawName Channel name to focus, or `null` to clear the focus.
   * @returns {void}
   */
  public setFocusedChannel(rawName: string | null): void {
    const activeList = this.activeList();

    if (!activeList) {
      return;
    }

    const name = rawName === null ? null : this._normalizeChannelName(rawName);
    const focusedChannel = name && activeList.streams.some(stream => stream.name === name) ? name : null;

    if ((activeList.focusedChannel ?? null) === focusedChannel) {
      return;
    }

    this._updateList(activeList.id, list => ({
      ...list,
      focusedChannel,
    }));
  }

  /**
   * Toggles whether a normalized channel is stored in the favorites list.
   *
   * @param {string} rawName Raw channel name whose favorite state should be toggled.
   * @returns {boolean} `true` when the channel is stored as a favorite after the call.
   */
  public toggleFavoriteChannel(rawName: string): boolean {
    const name = this._normalizeChannelName(rawName);

    if (!name || !this._isValidChannelName(name)) {
      return false;
    }

    let isFavorite = false;

    this._favoriteChannels.update(values => {
      if (values.includes(name)) {
        return values.filter(value => value !== name);
      }

      isFavorite = true;
      return [name, ...values];
    });

    return isFavorite;
  }

  /**
   * Enables or disables chat for a single stream in the active list.
   *
   * @param {number} index Index of the stream inside the active list.
   * @param {boolean} value Desired chat visibility for the stream.
   * @returns {void}
   */
  public setStreamShowChat(index: number, value: boolean): void {
    const activeList = this.activeList();

    if (!activeList) {
      return;
    }

    const currentStream = activeList.streams[index];

    if (!currentStream || currentStream.showChat === value) {
      return;
    }

    this._updateList(activeList.id, list => ({
      ...list,
      streams: list.streams.map((stream, streamIndex) => streamIndex === index
        ? { ...stream, showChat: value }
        : stream),
    }));
  }

  /**
   * Updates whether all embeds in the active list should be muted.
   *
   * @param {boolean} value Desired muted state for all streams in the active list.
   * @returns {void}
   */
  public setMuteAllStreams(value: boolean): void {
    this._updateActiveList(list => {
      const muteAllStreams = value === true;

      if ((list.muteAllStreams ?? false) === muteAllStreams) {
        return list;
      }

      return {
        ...list,
        muteAllStreams,
      };
    });
  }

  /**
   * Disables every enabled chat in the active list and returns how many changed.
   *
   * @returns {number} Number of streams whose chat visibility was disabled.
   */
  public disableChatsForActiveList(): number {
    const activeList = this.activeList();

    if (!activeList) {
      return 0;
    }

    const changedCount = activeList.streams.filter(stream => stream.showChat).length;

    if (changedCount === 0) {
      return 0;
    }

    this._updateList(activeList.id, list => ({
      ...list,
      streams: list.streams.map(stream => stream.showChat ? { ...stream, showChat: false } : stream),
    }));

    return changedCount;
  }

  /**
   * Adds all favorite channels missing from the active list and returns the added names.
   *
   * @returns {{ ok: boolean; reason?: 'no-list'; added: string[] }} Result with an optional failure reason and all added channels.
   */
  public addFavoriteChannelsToActiveList(): { ok: boolean; reason?: 'no-list'; added: string[] } {
    const activeList = this.activeList();

    if (!activeList) {
      return { ok: false, reason: 'no-list', added: [] };
    }

    const activeChannels = new Set(activeList.streams.map(stream => stream.name));
    const added = this._favoriteChannels().filter(channel => !activeChannels.has(channel));

    if (added.length === 0) {
      return { ok: true, added: [] };
    }

    this._updateList(activeList.id, list => ({
      ...list,
      streams: [
        ...list.streams,
        ...added.map(name => ({ name, showChat: false })),
      ],
    }));

    added.forEach(name => {
      this._bumpStatistic(name);
    });

    [...added].reverse().forEach(name => {
      this._touchRecentChannel(name);
    });

    return { ok: true, added };
  }

  /**
   * Returns the most frequently added channels in descending order.
   *
   * @param {number} [limit=10] Maximum number of statistics entries to return.
   * @returns {StreamStatistic[]} Usage statistics sorted in descending order.
   */
  public getTopStatistics(limit = 10): StreamStatistic[] {
    return [...this._statistics()]
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  /**
   * Restores persisted and migrated state into the normalized signal model.
   *
   * @returns {void}
   */
  private _init(): void {
    const persistedState = this._readPersistedState();
    const legacyShowChat = Boolean(persistedState.showChat);

    this._lists.set(this._normalizeStoredLists(persistedState.lists, {
      defaultShowChat: legacyShowChat,
      defaultQuality: normalizeStreamQuality(persistedState.quality),
      defaultLayoutPreset: this._normalizeStoredLayoutPreset(persistedState.layoutPreset),
      defaultFocusedChannel: this._normalizeStoredFocusedChannel(persistedState.focusedChannel),
      defaultFocusedListId: this._normalizeLegacyFocusedListId(persistedState.lastActiveListId),
    }));
    this._statistics.set(this._normalizeStoredStatistics(persistedState.statistics));
    this._favoriteChannels.set(this._normalizeStoredChannelList(persistedState.favoriteChannels));
    this._recentChannels.set(this._normalizeStoredChannelList(persistedState.recentChannels).slice(0, this._maxRecentChannels));
    this._lastActiveListId.set(this._normalizeStoredListReference(persistedState.lastActiveListId));
  }

  /**
   * Reads current persisted state or falls back to legacy migration sources.
   *
   * @returns {StoredState} Persisted or migrated state in the expected storage shape.
   */
  private _readPersistedState(): StoredState {
    if (this._storage.hasKey(this._stateKey)) {
      return this._storage.getJson<StoredState>(this._stateKey, this._createDefaultState());
    }

    return this._migrateLegacyState();
  }

  /**
   * Converts older storage keys into the current list-based persisted shape.
   *
   * @returns {PersistedStreamState} Migrierter Zustand im aktuellen Listenformat.
   */
  private _migrateLegacyState(): PersistedStreamState {
    const legacyStreams = this._normalizeStoredStreams(this._storage.getJson<unknown[]>('streams_v2', []));
    const olderStreams = this._normalizeStoredStreams(this._storage.getJson<unknown[]>('streams', []));
    const migratedStreams = legacyStreams.length > 0 ? legacyStreams : olderStreams;
    const showChat = this._storage.getBoolean('showChat_v2', false);
    const migratedQuality = normalizeStreamQuality(
      this._storage.getItem('quality_v2') ||
      this._storage.getItem('streams_qualities') ||
      this._storage.getItem('streams_qualies') ||
      'auto',
    );
    const migratedState: PersistedStreamState = {
      lists: migratedStreams.length > 0
        ? [{
          id: 1,
          name: 'Liste 1',
          streams: migratedStreams.map(stream => ({ ...stream, showChat })),
          quality: migratedQuality,
          layoutPreset: 'auto',
          focusedChannel: null,
          muteAllStreams: false,
        }]
        : [],
      statistics: this._normalizeStoredStatistics(this._storage.getJson<StreamStatistic[]>('stats_v2', [])),
      favoriteChannels: [],
      recentChannels: [],
      lastActiveListId: migratedStreams.length > 0 ? 1 : null,
    };

    this._storage.setJson(this._stateKey, migratedState);

    return migratedState;
  }

  /**
   * Normalizes persisted statistics and drops malformed entries.
   *
   * @param {unknown} value Raw value read from persistence.
   * @returns {StreamStatistic[]} Sanitized statistic entries.
   */
  private _normalizeStoredStatistics(value: unknown): StreamStatistic[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as { name?: unknown; value?: unknown };
        const name = this._normalizeChannelName(String(candidate.name ?? ''));
        const rawValue = Number(candidate.value ?? 0);

        if (!name || !this._isValidChannelName(name)) {
          return null;
        }

        return {
          name,
          value: Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 1,
        } satisfies StreamStatistic;
      })
      .filter((item): item is StreamStatistic => item !== null);
  }

  /**
   * Normalizes a stored channel array into unique valid channel names.
   *
   * @param {unknown} value Raw value read from persistence.
   * @returns {string[]} Unique, validated channel names.
   */
  private _normalizeStoredChannelList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const uniqueChannels = new Set<string>();

    value.forEach(item => {
      const name = this._normalizeChannelName(String(item ?? ''));

      if (!name || !this._isValidChannelName(name) || uniqueChannels.has(name)) {
        return;
      }

      uniqueChannels.add(name);
    });

    return [...uniqueChannels.values()];
  }

  /**
   * Normalizes persisted list data and drops malformed entries.
   *
   * @param {unknown} value Raw value containing persisted lists.
   * @param {NormalizeStoredListsOptions} options Default values for legacy and fallback fields.
   * @returns {StreamList[]} Sanitized lists for the in-memory state.
   */
  private _normalizeStoredLists(value: unknown, options: NormalizeStoredListsOptions): StreamList[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const usedIds = new Set<number>();

    return value
      .map((item, index) => this._normalizeStoredList(item, index, usedIds, options))
      .filter((item): item is StreamList => item !== null);
  }

  /**
   * Normalizes one stored list and fills missing values with safe defaults.
   *
   * @param {unknown} value Raw value of a single persisted list.
   * @param {number} index Position of the list inside the persisted collection.
   * @param {Set<number>} usedIds Already assigned list ids used to avoid collisions.
   * @param {NormalizeStoredListsOptions} options Default values for missing fields.
   * @returns {StreamList | null} Sanitized list or `null` when the entry is unusable.
   */
  private _normalizeStoredList(
    value: unknown,
    index: number,
    usedIds: Set<number>,
    options: NormalizeStoredListsOptions,
  ): StreamList | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as {
      id?: unknown;
      name?: unknown;
      streams?: unknown;
      quality?: unknown;
      layoutPreset?: unknown;
      focusedChannel?: unknown;
      muteAllStreams?: unknown;
    };
    const id = this._normalizeStoredListId(candidate.id, usedIds);
    const name = this._normalizeListName(typeof candidate.name === 'string' ? candidate.name : '') || `Liste ${index + 1}`;
    const streams = this._normalizeStoredStreams(
      Array.isArray(candidate.streams) ? candidate.streams : [],
      options.defaultShowChat,
    );
    const quality = normalizeStreamQuality(candidate.quality ?? options.defaultQuality);
    const layoutPreset = this._normalizeStoredLayoutPreset(candidate.layoutPreset ?? options.defaultLayoutPreset);
    const rawFocusedChannel = candidate.focusedChannel ?? (
      id === options.defaultFocusedListId
        ? options.defaultFocusedChannel
        : null
    );
    const focusedChannel = this._normalizeStoredFocusedChannel(rawFocusedChannel, streams);
    const muteAllStreams = candidate.muteAllStreams === true;

    usedIds.add(id);

    return {
      id,
      name,
      streams,
      quality,
      layoutPreset,
      focusedChannel,
      muteAllStreams,
    };
  }

  /**
   * Resolves a persisted list id or allocates the next unused positive id.
   *
   * @param {unknown} value Persisted id value.
   * @param {Set<number>} usedIds Already occupied list ids.
   * @returns {number} Valid, unique positive list id.
   */
  private _normalizeStoredListId(value: unknown, usedIds: Set<number>): number {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (Number.isInteger(parsed) && parsed > 0 && !usedIds.has(parsed)) {
      return parsed;
    }

    let nextId = 1;

    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    return nextId;
  }

  /**
   * Maps unknown persisted layout values to a supported preset.
   *
   * @param {unknown} value Persisted layout value.
   * @returns {StreamLayoutPreset} Supported layout preset.
   */
  private _normalizeStoredLayoutPreset(value: unknown): StreamLayoutPreset {
    return value === 'balanced' || value === 'stage' || value === 'chat'
      ? value
      : 'auto';
  }

  /**
   * Normalizes a stored focused channel and optionally verifies it still exists in the list.
   *
   * @param {unknown} value Persisted focused channel.
   * @param {StreamChannel[]} [streams] Optional stream list used for existence checks.
   * @returns {string | null} Normalized channel name or `null` when no valid focus exists.
   */
  private _normalizeStoredFocusedChannel(value: unknown, streams?: StreamChannel[]): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const name = this._normalizeChannelName(value);

    if (!name || !this._isValidChannelName(name)) {
      return null;
    }

    if (streams && !streams.some(stream => stream.name === name)) {
      return null;
    }

    return name;
  }

  /**
   * Normalizes a persisted list reference and verifies that it still exists.
   *
   * @param {unknown} value Persisted reference to a list.
   * @returns {number | null} Valid list id or `null` when the reference is unusable.
   */
  private _normalizeStoredListReference(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return this._isKnownListId(parsed) ? parsed : null;
  }

  /**
   * Increments the usage counter for a channel or creates it on first use.
   *
   * @param {string} channelName Already normalized channel name.
   * @returns {void}
   */
  private _bumpStatistic(channelName: string): void {
    const stats = [...this._statistics()];
    const existingIndex = stats.findIndex(item => item.name === channelName);

    if (existingIndex >= 0) {
      stats[existingIndex] = {
        ...stats[existingIndex],
        value: stats[existingIndex].value + 1,
      };
    } else {
      stats.push({ name: channelName, value: 1 });
    }

    this._statistics.set(stats);
  }

  /**
   * Moves a channel to the front of the recent list and enforces the size limit.
   *
   * @param {string} channelName Already normalized channel name.
   * @returns {void}
   */
  private _touchRecentChannel(channelName: string): void {
    this._recentChannels.update(values => [
      channelName,
      ...values.filter(value => value !== channelName),
    ].slice(0, this._maxRecentChannels));
  }

  /**
   * Normalizes channel names for storage and duplicate checks.
   *
   * @param {string} value Raw channel name.
   * @returns {string} Trimmed, lowercased channel name without commas.
   */
  private _normalizeChannelName(value: string): string {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/,/g, '');
  }

  /**
   * Normalizes list names by trimming and collapsing whitespace.
   *
   * @param {string} value Raw list name.
   * @returns {string} Sanitized list name with collapsed whitespace.
   */
  private _normalizeListName(value: string): string {
    return String(value)
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Parses the legacy focused list id format used during migration.
   *
   * @param {unknown} value Persisted legacy value.
   * @returns {number | null} Positive list id, or `null` when no legacy format can be parsed.
   */
  private _normalizeLegacyFocusedListId(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Normalizes stored stream entries into unique valid channel objects.
   *
   * @param {unknown[]} values Persisted stream entries.
   * @param {boolean} [defaultShowChat=false] Default value used when chat flags are missing.
   * @returns {StreamChannel[]} Sanitized, unique streams.
   */
  private _normalizeStoredStreams(values: unknown[], defaultShowChat = false): StreamChannel[] {
    const channels = new Map<string, StreamChannel>();

    values.forEach(item => {
      let rawName: string;
      let showChat = defaultShowChat;

      if (typeof item === 'object' && item !== null) {
        const candidate = item as { name?: unknown; id?: unknown; showChat?: unknown };
        rawName = String(candidate.name ?? candidate.id ?? '');
        showChat = typeof candidate.showChat === 'boolean' ? candidate.showChat : defaultShowChat;
      } else {
        rawName = String(item ?? '');
      }

      const name = this._normalizeChannelName(rawName);

      if (!name || name === '[object object]' || !this._isValidChannelName(name) || channels.has(name)) {
        return;
      }

      channels.set(name, { name, showChat });
    });

    return [...channels.values()];
  }

  /**
   * Validates a normalized Twitch channel name against app rules.
   *
   * @param {string} value Already normalized channel name.
   * @returns {boolean} `true` when the channel name matches the app rules.
   */
  private _isValidChannelName(value: string): boolean {
    return /^[a-z\u00E4\u00F6\u00FC0-9_]{1,25}$/.test(value);
  }

  /**
   * Checks whether another list already uses the provided normalized name.
   *
   * @param {string} name Already normalized list name.
   * @param {number} [ignoredListId] Optional list id to ignore during comparison.
   * @returns {boolean} `true` when another list already uses the same name.
   */
  private _hasListName(name: string, ignoredListId?: number): boolean {
    const normalizedName = name.toLocaleLowerCase();

    return this._lists().some(list =>
      list.id !== ignoredListId && list.name.toLocaleLowerCase() === normalizedName,
    );
  }

  /**
   * Builds the next available duplicate list name using the `Kopie` suffix scheme.
   *
   * @param {string} sourceName Display name of the source list.
   * @returns {string} Unique name for the new copy.
   */
  private _buildDuplicateListName(sourceName: string): string {
    const baseName = `${sourceName} Kopie`;

    if (!this._hasListName(baseName)) {
      return baseName;
    }

    let copyNumber = 2;

    while (this._hasListName(`${baseName} ${copyNumber}`)) {
      copyNumber += 1;
    }

    return `${baseName} ${copyNumber}`;
  }

  /**
   * Returns whether the provided id matches an existing list.
   *
   * @param {number} listId List id to check.
   * @returns {boolean} `true` when a list with that id exists.
   */
  private _isKnownListId(listId: number): boolean {
    return this._lists().some(list => list.id === listId);
  }

  /**
   * Allocates the next list id from the current maximum id.
   *
   * @returns {number} Next free positive list id.
   */
  private _getNextListId(): number {
    return this._lists().reduce((maxId, list) => Math.max(maxId, list.id), 0) + 1;
  }

  /**
   * Applies an update function to a specific list by id.
   *
   * @param {number} listId Id of the list to update.
   * @param {(list: StreamList) => StreamList} updater Pure update function for the target list.
   * @returns {void}
   */
  private _updateList(listId: number, updater: (list: StreamList) => StreamList): void {
    this._lists.update(values => values.map(list => list.id === listId ? updater(list) : list));
  }

  /**
   * Applies an update function to the currently active list when one exists.
   *
   * @param {(list: StreamList) => StreamList} updater Pure update function for the active list.
   * @returns {void}
   */
  private _updateActiveList(updater: (list: StreamList) => StreamList): void {
    const activeList = this.activeList();

    if (!activeList) {
      return;
    }

    this._updateList(activeList.id, updater);
  }

  /**
   * Debounces persistence so multiple signal updates collapse into one storage write.
   *
   * @param {PersistedStreamState} state Snapshot of the app state that should be persisted.
   * @returns {void}
   */
  private _schedulePersist(state: PersistedStreamState): void {
    this._pendingPersistState = {
      lists: state.lists.map(list => ({
        ...list,
        streams: list.streams.map(stream => ({ ...stream })),
      })),
      statistics: [...state.statistics],
      favoriteChannels: [...state.favoriteChannels],
      recentChannels: [...state.recentChannels],
      lastActiveListId: state.lastActiveListId,
    };

    if (this._persistScheduled) {
      return;
    }

    this._persistScheduled = true;

    queueMicrotask(() => {
      this._persistScheduled = false;

      if (!this._pendingPersistState) {
        return;
      }

      this._persistState(this._pendingPersistState);
      this._pendingPersistState = undefined;
    });
  }

  /**
   * Writes the current app state and shows one toast when persistence fails.
   *
   * @param {PersistedStreamState} state State to write to storage.
   * @returns {void}
   */
  private _persistState(state: PersistedStreamState): void {
    if (this._storage.setJson(this._stateKey, state)) {
      this._persistFailureVisible = false;
      return;
    }

    if (this._persistFailureVisible) {
      return;
    }

    this._persistFailureVisible = true;
    this._toast.show('\u00C4nderungen konnten nicht gespeichert werden. Pr\u00FCfe den verf\u00FCgbaren Browser-Speicher.', 'error');
  }

  /**
   * Returns the empty persisted state used as the initial fallback.
   *
   * @returns {PersistedStreamState} Empty initial state for new or invalid persisted data.
   */
  private _createDefaultState(): PersistedStreamState {
    return {
      lists: [],
      statistics: [],
      favoriteChannels: [],
      recentChannels: [],
      lastActiveListId: null,
    };
  }
}
