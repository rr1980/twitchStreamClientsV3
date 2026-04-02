import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AppSettings, StreamChannel, StreamList, StreamQuality, StreamStatistic } from '../models/app-settings.model';
import { StorageService } from './storage.service';
import { ToastService } from '../../features/toast/toast.service';

type PersistedStreamState = AppSettings;
type StoredState = PersistedStreamState & { showChat?: unknown };

type StreamMutationResultReason = 'empty' | 'invalid' | 'duplicate' | 'no-list';
type ListMutationResultReason = 'empty' | 'duplicate' | 'not-found';

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
export class StreamStateService {
  private readonly _stateKey = 'app_state_v3';

  private readonly _lists = signal<StreamList[]>([]);
  private readonly _activeListId = signal<number | null>(null);
  private readonly _quality = signal<StreamQuality>('auto');
  private readonly _reportedAvailableQualities = signal<StreamQuality[]>([]);
  private readonly _statistics = signal<StreamStatistic[]>([]);
  private readonly _menuOpen = signal(false);

  public readonly lists = computed(() => this._lists());
  public readonly activeListId = computed(() => this._activeListId());
  public readonly activeList = computed(() => this._lists().find(list => list.id === this._activeListId()) ?? null);
  public readonly streams = computed(() => this.activeList()?.streams ?? []);
  public readonly quality = computed(() => this._quality());
  public readonly availableQualities = computed(() => this._buildAvailableQualityOptions(
    this._reportedAvailableQualities(),
    this._quality(),
  ));
  public readonly statistics = computed(() => this._statistics());
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
        quality: this._quality(),
        statistics: this._statistics(),
      });
    });
  }

  public initialize(): void {
    if (this._initialized) {
      return;
    }

    this._init();
    this._initialized = true;
  }

  public openMenu(): void {
    this._menuOpen.set(true);
  }

  public closeMenu(): void {
    this._menuOpen.set(false);
  }

  public toggleMenu(): void {
    this._menuOpen.update(value => !value);
  }

  public setActiveListId(listId: number | null): void {
    this._activeListId.set(listId);
  }

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
    };

    this._lists.update(values => [...values, list]);

    return { ok: true, list };
  }

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

    return removed;
  }

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

    return { ok: true, name };
  }

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
    }));

    return removed.name;
  }

  public moveStream(index: number, direction: -1 | 1): void {
    const activeList = this.activeList();

    if (!activeList) {
      return;
    }

    const current = [...activeList.streams];
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= current.length) {
      return;
    }

    [current[index], current[newIndex]] = [current[newIndex], current[index]];

    this._updateList(activeList.id, list => ({
      ...list,
      streams: current,
    }));
  }

  public setQuality(value: StreamQuality): void {
    this._quality.set(this._normalizeStoredQuality(value));
  }

  public setAvailableQualities(values: StreamQuality[]): void {
    this._reportedAvailableQualities.set(this._normalizeAvailableQualities(values));
  }

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

  public getTopStatistics(limit = 10): StreamStatistic[] {
    return [...this._statistics()]
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  private _init(): void {
    const persistedState = this._readPersistedState();
    const legacyShowChat = Boolean(persistedState.showChat);

    this._lists.set(this._normalizeStoredLists(persistedState.lists, legacyShowChat));
    this._quality.set(this._normalizeStoredQuality(persistedState.quality));
    this._statistics.set(this._normalizeStoredStatistics(persistedState.statistics));
  }

  private _readPersistedState(): StoredState {
    if (this._storage.hasKey(this._stateKey)) {
      return this._storage.getJson<StoredState>(this._stateKey, this._createDefaultState());
    }

    return this._migrateLegacyState();
  }

  private _migrateLegacyState(): PersistedStreamState {
    const legacyStreams = this._normalizeStoredStreams(this._storage.getJson<unknown[]>('streams_v2', []));
    const olderStreams = this._normalizeStoredStreams(this._storage.getJson<unknown[]>('streams', []));
    const migratedStreams = legacyStreams.length > 0 ? legacyStreams : olderStreams;
    const showChat = this._storage.getBoolean('showChat_v2', false);
    const migratedState: PersistedStreamState = {
      lists: migratedStreams.length > 0
        ? [{
          id: 1,
          name: 'Liste 1',
          streams: migratedStreams.map(stream => ({ ...stream, showChat })),
        }]
        : [],
      quality: this._normalizeStoredQuality(
        this._storage.getItem('quality_v2') ||
        this._storage.getItem('streams_qualities') ||
        this._storage.getItem('streams_qualies') ||
        'auto',
      ),
      statistics: this._normalizeStoredStatistics(this._storage.getJson<StreamStatistic[]>('stats_v2', [])),
    };

    this._storage.setJson(this._stateKey, migratedState);

    return migratedState;
  }

  private _normalizeStoredQuality(value: unknown): StreamQuality {
    const storedQuality = typeof value === 'string' ? value.trim() : 'auto';

    return this._isSupportedQuality(storedQuality) ? storedQuality : 'auto';
  }

  private _normalizeAvailableQualities(values: StreamQuality[]): StreamQuality[] {
    const uniqueQualities = new Map<string, StreamQuality>();

    values.forEach(value => {
      const normalizedValue = this._normalizeStoredQuality(value);

      if (normalizedValue === 'auto') {
        return;
      }

      uniqueQualities.set(normalizedValue.toLowerCase(), normalizedValue);
    });

    return [...uniqueQualities.values()].sort((left, right) => this._compareQualityOptions(left, right));
  }

  private _buildAvailableQualityOptions(reportedQualities: StreamQuality[], selectedQuality: StreamQuality): StreamQuality[] {
    const qualityOptions = new Map<string, StreamQuality>();
    const normalizedSelectedQuality = this._normalizeStoredQuality(selectedQuality);

    qualityOptions.set('auto', 'auto');

    if (normalizedSelectedQuality !== 'auto') {
      qualityOptions.set(normalizedSelectedQuality.toLowerCase(), normalizedSelectedQuality);
    }

    this._normalizeAvailableQualities(reportedQualities).forEach(quality => {
      qualityOptions.set(quality.toLowerCase(), quality);
    });

    return [
      'auto',
      ...[...qualityOptions.values()]
        .filter(quality => quality !== 'auto')
        .sort((left, right) => this._compareQualityOptions(left, right)),
    ];
  }

  private _compareQualityOptions(left: StreamQuality, right: StreamQuality): number {
    const leftToken = this._getQualitySortToken(left);
    const rightToken = this._getQualitySortToken(right);

    if (leftToken.group !== rightToken.group) {
      return leftToken.group - rightToken.group;
    }

    if (leftToken.resolution !== rightToken.resolution) {
      return rightToken.resolution - leftToken.resolution;
    }

    if (leftToken.frameRate !== rightToken.frameRate) {
      return rightToken.frameRate - leftToken.frameRate;
    }

    return left.localeCompare(right);
  }

  private _getQualitySortToken(value: StreamQuality): { group: number; resolution: number; frameRate: number } {
    if (value === 'chunked') {
      return { group: 0, resolution: Number.MAX_SAFE_INTEGER, frameRate: Number.MAX_SAFE_INTEGER };
    }

    if (value === 'audio_only') {
      return { group: 2, resolution: -1, frameRate: -1 };
    }

    const qualityMatch = value.match(/^(\d+)p(?:.*?(\d+))?$/i);

    return {
      group: 1,
      resolution: qualityMatch ? Number(qualityMatch[1]) : -1,
      frameRate: value.includes('60') ? 60 : qualityMatch?.[2] ? Number(qualityMatch[2]) : 0,
    };
  }

  private _isSupportedQuality(value: string): boolean {
    return value === 'auto'
      || value === 'chunked'
      || value === 'audio_only'
      || /^\d+p(?:\d+(?:-\d+)?)?$/i.test(value);
  }

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

  private _normalizeStoredLists(value: unknown, defaultShowChat = false): StreamList[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const usedIds = new Set<number>();

    return value
      .map((item, index) => this._normalizeStoredList(item, index, usedIds, defaultShowChat))
      .filter((item): item is StreamList => item !== null);
  }

  private _normalizeStoredList(
    value: unknown,
    index: number,
    usedIds: Set<number>,
    defaultShowChat: boolean,
  ): StreamList | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as { id?: unknown; name?: unknown; streams?: unknown };
    const id = this._normalizeStoredListId(candidate.id, usedIds);
    const name = this._normalizeListName(typeof candidate.name === 'string' ? candidate.name : '') || `Liste ${index + 1}`;
    const streams = this._normalizeStoredStreams(Array.isArray(candidate.streams) ? candidate.streams : [], defaultShowChat);

    usedIds.add(id);

    return {
      id,
      name,
      streams,
    };
  }

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

  private _normalizeChannelName(value: string): string {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/,/g, '');
  }

  private _normalizeListName(value: string): string {
    return String(value)
      .trim()
      .replace(/\s+/g, ' ');
  }

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

  private _isValidChannelName(value: string): boolean {
    return /^[a-zäöü0-9_]{1,25}$/.test(value);
  }

  private _hasListName(name: string, ignoredListId?: number): boolean {
    const normalizedName = name.toLocaleLowerCase();

    return this._lists().some(list =>
      list.id !== ignoredListId && list.name.toLocaleLowerCase() === normalizedName,
    );
  }

  private _getNextListId(): number {
    return this._lists().reduce((maxId, list) => Math.max(maxId, list.id), 0) + 1;
  }

  private _updateList(listId: number, updater: (list: StreamList) => StreamList): void {
    this._lists.update(values => values.map(list => list.id === listId ? updater(list) : list));
  }

  private _schedulePersist(state: PersistedStreamState): void {
    this._pendingPersistState = {
      lists: state.lists.map(list => ({
        ...list,
        streams: list.streams.map(stream => ({ ...stream })),
      })),
      quality: state.quality,
      statistics: [...state.statistics],
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

  private _persistState(state: PersistedStreamState): void {
    if (this._storage.setJson(this._stateKey, state)) {
      this._persistFailureVisible = false;
      return;
    }

    if (this._persistFailureVisible) {
      return;
    }

    this._persistFailureVisible = true;
    this._toast.show('Änderungen konnten nicht gespeichert werden. Prüfe den verfügbaren Browser-Speicher.', 'error');
  }

  private _createDefaultState(): PersistedStreamState {
    return {
      lists: [],
      quality: 'auto',
      statistics: [],
    };
  }
}