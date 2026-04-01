import { Injectable, computed, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { StreamQuality, StreamStatistic } from '../models/app-settings.model';

@Injectable({ providedIn: 'root' })
export class StreamStateService {
  private readonly streamsKey = 'streams_v2';
  private readonly qualityKey = 'quality_v2';
  private readonly showChatKey = 'showChat_v2';
  private readonly statsKey = 'stats_v2';

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

  constructor() {
    this.init();
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
    this.persist();

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
    this.persist();
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
    this.persist();
  }

  setQuality(value: StreamQuality): void {
    this._quality.set(value);
    this.persist();
  }

  setShowChat(value: boolean): void {
    this._showChat.set(value);
    this.persist();
  }

  getTopStatistics(limit = 10): StreamStatistic[] {
    return [...this._statistics()]
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  private init(): void {
    this.migrateLegacyKeys();

    const rawStreams = this.storage.getJson<unknown[]>(this.streamsKey, []);
    const cleanStreams = rawStreams
      .map(item => {
        if (typeof item === 'object' && item !== null) {
          const candidate = item as { name?: string; id?: string };
          return candidate.name || candidate.id || '';
        }

        return String(item ?? '');
      })
      .map(value => value.trim())
      .filter(value => value.length > 0 && value !== '[object Object]');

    this._streams.set(cleanStreams);
    this._quality.set(this.storage.getString(this.qualityKey, 'auto') as StreamQuality);
    this._showChat.set(this.storage.getBoolean(this.showChatKey, false));
    this._statistics.set(this.storage.getJson<StreamStatistic[]>(this.statsKey, []));
  }

  private migrateLegacyKeys(): void {
    const hasOldStreams = localStorage.getItem('streams');
    const hasNewStreams = localStorage.getItem(this.streamsKey);

    if (!hasOldStreams || hasNewStreams) {
      return;
    }

    const oldStreams = this.storage.getJson<string[]>('streams', []);
    const oldQuality =
      localStorage.getItem('streams_qualities') ||
      localStorage.getItem('streams_qualies') ||
      'auto';

    this.storage.setJson(this.streamsKey, oldStreams);
    this.storage.setString(this.qualityKey, oldQuality);
  }

  private persist(): void {
    this.storage.setJson(this.streamsKey, this._streams());
    this.storage.setString(this.qualityKey, this._quality());
    this.storage.setBoolean(this.showChatKey, this._showChat());
    this.storage.setJson(this.statsKey, this._statistics());
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

  private isValidChannelName(value: string): boolean {
    return /^[a-z0-9_]{1,25}$/.test(value);
  }
}