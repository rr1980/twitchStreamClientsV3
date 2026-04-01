import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { StreamQuality, StreamStatistic } from '../models/app-settings.model';

interface PersistedStreamState {
  streams: string[];
  quality: StreamQuality;
  showChat: boolean;
  statistics: StreamStatistic[];
}

@Injectable({ providedIn: 'root' })
export class StreamStateService {
  private readonly streamsKey = 'streams_v2';
  private readonly qualityKey = 'quality_v2';
  private readonly showChatKey = 'showChat_v2';
  private readonly statsKey = 'stats_v2';
  private readonly availableQualities: readonly StreamQuality[] = ['auto', '480p', '720p60', 'chunked'];

  private readonly _streams = signal<string[]>([]);
  private readonly _quality = signal<StreamQuality>('auto');
  private readonly _showChat = signal(false);
  private readonly _statistics = signal<StreamStatistic[]>([]);
  private readonly _menuOpen = signal(false);

  readonly streams = computed(() => this._streams());
  readonly quality = computed(() => this._quality());
  readonly showChat = computed(() => this._showChat());
  readonly statistics = computed(() => this._statistics());
  readonly menuOpen = computed(() => this._menuOpen());
  readonly streamCount = computed(() => this._streams().length);

  private readonly storage = inject(StorageService);
  private pendingPersistState?: PersistedStreamState;
  private persistScheduled = false;

  constructor() {
    this.init();

    effect(() => {
      this.schedulePersist({
        streams: this._streams(),
        quality: this._quality(),
        showChat: this._showChat(),
        statistics: this._statistics(),
      });
    });
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

  addStream(rawName: string): { ok: boolean; reason?: string; name?: string } {
    const name = this.normalizeChannelName(rawName);

    if (!name) {
      return { ok: false, reason: 'empty' };
    }

    if (!this.isValidChannelName(name)) {
      return { ok: false, reason: 'invalid' };
    }

    if (this._streams().includes(name)) {
      return { ok: false, reason: 'duplicate', name };
    }

    this._streams.update(values => [...values, name]);
    this.bumpStatistic(name);

    return { ok: true, name };
  }

  removeStream(index: number): string | null {
    const current = [...this._streams()];
    const removed = current[index];

    if (removed === undefined) {
      return null;
    }

    current.splice(index, 1);
    this._streams.set(current);
    return removed;
  }

  moveStream(index: number, direction: -1 | 1): void {
    const current = [...this._streams()];
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= current.length) {
      return;
    }

    [current[index], current[newIndex]] = [current[newIndex], current[index]];
    this._streams.set(current);
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
    this.migrateLegacyKeys();

    this._streams.set(this.normalizeStoredStreams(this.storage.getJson<unknown[]>(this.streamsKey, [])));
    this._quality.set(this.readStoredQuality());
    this._showChat.set(this.storage.getBoolean(this.showChatKey, false));
    this._statistics.set(this.storage.getJson<StreamStatistic[]>(this.statsKey, []));
  }

  private migrateLegacyKeys(): void {
    const hasOldStreams = this.storage.hasKey('streams');
    const hasNewStreams = this.storage.hasKey(this.streamsKey);

    if (!hasOldStreams || hasNewStreams) {
      return;
    }

    const oldStreams = this.storage.getJson<string[]>('streams', []);
    const oldQuality =
      this.storage.getItem('streams_qualities') ||
      this.storage.getItem('streams_qualies') ||
      'auto';

    this.storage.setJson(this.streamsKey, oldStreams);
    this.storage.setString(this.qualityKey, oldQuality);
  }

  private readStoredQuality(): StreamQuality {
    const storedQuality = this.storage.getString(this.qualityKey, 'auto');

    return this.availableQualities.includes(storedQuality as StreamQuality)
      ? storedQuality as StreamQuality
      : 'auto';
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
    return /^[a-z0-9_]{1,25}$/.test(value);
  }

  private schedulePersist(state: PersistedStreamState): void {
    this.pendingPersistState = {
      streams: [...state.streams],
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
    this.storage.setJson(this.streamsKey, state.streams);
    this.storage.setString(this.qualityKey, state.quality);
    this.storage.setBoolean(this.showChatKey, state.showChat);
    this.storage.setJson(this.statsKey, state.statistics);
  }
}