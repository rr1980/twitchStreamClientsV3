import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { AppSettings, StreamList, StreamQuality, StreamStatistic } from '../models/app-settings.model';

type PersistedStreamState = AppSettings;

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
  private readonly stateKey = 'app_state_v3';
  private readonly availableQualities: readonly StreamQuality[] = ['auto', '480p', '720p60', 'chunked'];

  private readonly _lists = signal<StreamList[]>([]);
  private readonly _activeListId = signal<number | null>(null);
  private readonly _quality = signal<StreamQuality>('auto');
  private readonly _showChat = signal(false);
  private readonly _statistics = signal<StreamStatistic[]>([]);
  private readonly _menuOpen = signal(false);

  readonly lists = computed(() => this._lists());
  readonly activeListId = computed(() => this._activeListId());
  readonly activeList = computed(() => this._lists().find(list => list.id === this._activeListId()) ?? null);
  readonly streams = computed(() => this.activeList()?.streams ?? []);
  readonly quality = computed(() => this._quality());
  readonly showChat = computed(() => this._showChat());
  readonly statistics = computed(() => this._statistics());
  readonly menuOpen = computed(() => this._menuOpen());
  readonly streamCount = computed(() => this.streams().length);
  readonly listCount = computed(() => this._lists().length);

  private readonly storage = inject(StorageService);
  private pendingPersistState?: PersistedStreamState;
  private persistScheduled = false;
  private initialized = false;

  constructor() {
    effect(() => {
      if (!this.initialized) {
        return;
      }

      this.schedulePersist({
        lists: this._lists(),
        quality: this._quality(),
        showChat: this._showChat(),
        statistics: this._statistics(),
      });
    });
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.init();
    this.initialized = true;
  }

  openMenu(): void {
    this._menuOpen.set(true);
  }

  closeMenu(): void {
    this._menuOpen.set(false);
  }

  toggleMenu(): void {
    this._menuOpen.update(value => !value);
  }

  setActiveListId(listId: number | null): void {
    this._activeListId.set(listId);
  }

  createList(rawName: string): ListMutationResult {
    const name = this.normalizeListName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    if (this.hasListName(name)) {
      return { ok: false, reason: 'duplicate' };
    }

    const list: StreamList = {
      id: this.getNextListId(),
      name,
      streams: [],
    };

    this._lists.update(values => [...values, list]);

    return { ok: true, list };
  }

  renameList(listId: number, rawName: string): ListMutationResult {
    const name = this.normalizeListName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    const currentList = this._lists().find(list => list.id === listId);

    if (!currentList) {
      return { ok: false, reason: 'not-found' };
    }

    if (this.hasListName(name, listId)) {
      return { ok: false, reason: 'duplicate' };
    }

    const list = {
      ...currentList,
      name,
    };

    this._lists.update(values => values.map(item => item.id === listId ? list : item));

    return { ok: true, list };
  }

  deleteList(listId: number): StreamList | null {
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

  addStream(rawName: string): StreamMutationResult {
    const name = this.normalizeChannelName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    const activeList = this.activeList();

    if (!activeList) {
      return { ok: false, reason: 'no-list' };
    }

    if (!this.isValidChannelName(name)) {
      return { ok: false, reason: 'invalid' };
    }

    if (activeList.streams.includes(name)) {
      return { ok: false, reason: 'duplicate', name };
    }

    this.updateList(activeList.id, list => ({
      ...list,
      streams: [...list.streams, name],
    }));
    this.bumpStatistic(name);

    return { ok: true, name };
  }

  removeStream(index: number): string | null {
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
    this.updateList(activeList.id, list => ({
      ...list,
      streams: current,
    }));

    return removed;
  }

  moveStream(index: number, direction: -1 | 1): void {
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

    this.updateList(activeList.id, list => ({
      ...list,
      streams: current,
    }));
  }

  setQuality(value: StreamQuality): void {
    this._quality.set(value);
  }

  setShowChat(value: boolean): void {
    this._showChat.set(value);
  }

  getTopStatistics(limit = 10): StreamStatistic[] {
    return [...this._statistics()]
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  private init(): void {
    const persistedState = this.readPersistedState();

    this._lists.set(this.normalizeStoredLists(persistedState.lists));
    this._quality.set(this.normalizeStoredQuality(persistedState.quality));
    this._showChat.set(Boolean(persistedState.showChat));
    this._statistics.set(this.normalizeStoredStatistics(persistedState.statistics));
  }

  private readPersistedState(): PersistedStreamState {
    if (this.storage.hasKey(this.stateKey)) {
      return this.storage.getJson<PersistedStreamState>(this.stateKey, this.createDefaultState());
    }

    return this.migrateLegacyState();
  }

  private migrateLegacyState(): PersistedStreamState {
    const legacyStreams = this.normalizeStoredStreams(this.storage.getJson<unknown[]>('streams_v2', []));
    const olderStreams = this.normalizeStoredStreams(this.storage.getJson<unknown[]>('streams', []));
    const migratedStreams = legacyStreams.length > 0 ? legacyStreams : olderStreams;
    const migratedState: PersistedStreamState = {
      lists: migratedStreams.length > 0
        ? [{ id: 1, name: 'Liste 1', streams: migratedStreams }]
        : [],
      quality: this.normalizeStoredQuality(
        this.storage.getItem('quality_v2') ||
        this.storage.getItem('streams_qualities') ||
        this.storage.getItem('streams_qualies') ||
        'auto',
      ),
      showChat: this.storage.getBoolean('showChat_v2', false),
      statistics: this.normalizeStoredStatistics(this.storage.getJson<StreamStatistic[]>('stats_v2', [])),
    };

    this.storage.setJson(this.stateKey, migratedState);

    return migratedState;
  }

  private normalizeStoredQuality(value: unknown): StreamQuality {
    const storedQuality = typeof value === 'string' ? value : 'auto';

    return this.availableQualities.includes(storedQuality as StreamQuality)
      ? storedQuality as StreamQuality
      : 'auto';
  }

  private normalizeStoredStatistics(value: unknown): StreamStatistic[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const candidate = item as { name?: unknown; value?: unknown };
        const name = this.normalizeChannelName(String(candidate.name ?? ''));
        const rawValue = Number(candidate.value ?? 0);

        if (!name || !this.isValidChannelName(name)) {
          return null;
        }

        return {
          name,
          value: Number.isFinite(rawValue) && rawValue > 0 ? Math.floor(rawValue) : 1,
        } satisfies StreamStatistic;
      })
      .filter((item): item is StreamStatistic => item !== null);
  }

  private normalizeStoredLists(value: unknown): StreamList[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const usedIds = new Set<number>();

    return value
      .map((item, index) => this.normalizeStoredList(item, index, usedIds))
      .filter((item): item is StreamList => item !== null);
  }

  private normalizeStoredList(value: unknown, index: number, usedIds: Set<number>): StreamList | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as { id?: unknown; name?: unknown; streams?: unknown };
    const id = this.normalizeStoredListId(candidate.id, usedIds);
    const name = this.normalizeListName(typeof candidate.name === 'string' ? candidate.name : '') || `Liste ${index + 1}`;
    const streams = this.normalizeStoredStreams(Array.isArray(candidate.streams) ? candidate.streams : []);

    usedIds.add(id);

    return {
      id,
      name,
      streams,
    };
  }

  private normalizeStoredListId(value: unknown, usedIds: Set<number>): number {
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

  private bumpStatistic(channelName: string): void {
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

  private normalizeChannelName(value: string): string {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/,/g, '');
  }

  private normalizeListName(value: string): string {
    return String(value)
      .trim()
      .replace(/\s+/g, ' ');
  }

  private normalizeStoredStreams(values: unknown[]): string[] {
    return values
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          const candidate = item as { name?: string; id?: string };
          return candidate.name || candidate.id || '';
        }

        return String(item ?? '');
      })
      .map(value => this.normalizeChannelName(value))
      .filter((value, index, items) => value.length > 0 && value !== '[object Object]' && items.indexOf(value) === index)
      .filter(value => this.isValidChannelName(value));
  }

  private isValidChannelName(value: string): boolean {
    return /^[a-zäöü0-9_]{1,25}$/.test(value);
  }

  private hasListName(name: string, ignoredListId?: number): boolean {
    const normalizedName = name.toLocaleLowerCase();

    return this._lists().some(list =>
      list.id !== ignoredListId && list.name.toLocaleLowerCase() === normalizedName,
    );
  }

  private getNextListId(): number {
    return this._lists().reduce((maxId, list) => Math.max(maxId, list.id), 0) + 1;
  }

  private updateList(listId: number, updater: (list: StreamList) => StreamList): void {
    this._lists.update(values => values.map(list => list.id === listId ? updater(list) : list));
  }

  private schedulePersist(state: PersistedStreamState): void {
    this.pendingPersistState = {
      lists: state.lists.map(list => ({
        ...list,
        streams: [...list.streams],
      })),
      quality: state.quality,
      showChat: state.showChat,
      statistics: [...state.statistics],
    };

    if (this.persistScheduled) {
      return;
    }

    this.persistScheduled = true;

    queueMicrotask(() => {
      this.persistScheduled = false;

      if (!this.pendingPersistState) {
        return;
      }

      this.persistState(this.pendingPersistState);
      this.pendingPersistState = undefined;
    });
  }

  private persistState(state: PersistedStreamState): void {
    this.storage.setJson(this.stateKey, state);
  }

  private createDefaultState(): PersistedStreamState {
    return {
      lists: [],
      quality: 'auto',
      showChat: false,
      statistics: [],
    };
  }
}