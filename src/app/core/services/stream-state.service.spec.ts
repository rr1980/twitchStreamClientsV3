import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { AppSettings, StreamChannel, StreamQualityOption } from '../models/app-settings.model';
import { ToastService } from '../../features/toast/toast.service';
import { normalizeStreamQuality } from '../../shared/utils/stream-quality.util';
import { StreamStateService } from './stream-state.service';
import { StorageService } from './storage.service';

describe('StreamStateService', () => {
  let service: StreamStateService;

  function getServiceMethod<T extends (...args: never[]) => unknown>(instance: object, propertyName: string): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  function setServiceMember<T>(instance: object, propertyName: string, value: T): void {
    (instance as Record<string, unknown>)[propertyName] = value;
  }

  beforeEach(() => {
    localStorage.clear();
    service = createService();
  });

  it('creates, selects and renames lists', () => {
    const created = service.createList('  Esports  ');

    expect(created).toEqual({
      ok: true,
      list: { id: 1, name: 'Esports', streams: [] },
    });

    service.setActiveListId(1);

    const renamed = service.renameList(1, '  Main Stage ');

    expect(renamed).toEqual({
      ok: true,
      list: { id: 1, name: 'Main Stage', streams: [] },
    });
    expect(service.activeListId()).toBe(1);
    expect(service.activeList()?.name).toBe('Main Stage');
  });

  it('rejects empty and duplicate list names and duplicate renames', () => {
    expect(service.createList('   ')).toEqual({ ok: false, reason: 'empty' });

    service.createList('Favoriten');

    expect(service.createList(' favoriten ')).toEqual({ ok: false, reason: 'duplicate' });
    expect(service.renameList(1, '   ')).toEqual({ ok: false, reason: 'empty' });

    service.createList('Esports');

    expect(service.renameList(2, ' FAVORITEN ')).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('normalizes valid channel names before adding them', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);

    const result = service.addStream('  RocketBeansTV,  ');

    expect(result).toEqual({ ok: true, name: 'rocketbeanstv' });
    expect(service.streams()).toEqual([channel('rocketbeanstv')]);
  });

  it('rejects duplicate channel names after normalization', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');

    const result = service.addStream('  SHROUD  ');

    expect(result).toEqual({ ok: false, reason: 'duplicate', name: 'shroud' });
    expect(service.streams()).toEqual([channel('shroud')]);
  });

  it('filters invalid persisted data during initialization', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [
        {
          id: 9,
          name: ' Favoriten ',
          streams: [' valid_name ', 'INVALID-NAME', { name: 'second_one', showChat: false }, null, 'valid_name'],
        },
      ],
      quality: 'not-a-quality',
      showChat: true,
      statistics: [{ name: 'Shroud', value: 2 }, { name: 'invalid-name', value: 1 }],
    }));

    service = createService();
    service.setActiveListId(9);

    expect(service.streams()).toEqual([
      channel('valid_name', true),
      channel('second_one', false),
    ]);
    expect(service.quality()).toBe('auto');
    expect(service.getTopStatistics(10)).toEqual([{ name: 'shroud', value: 2 }]);
  });

  it('builds dynamic quality options from Twitch qualities and keeps the current selection visible', () => {
    service.setAvailableQualities([
      quality('720p60'),
      quality('1080p60'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('audio_only', 'Nur Audio'),
      quality('chunked', 'Quelle'),
      quality('1080p60'),
      quality('not-a-quality'),
    ]);

    expect(service.availableQualities()).toEqual([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);

    service.setQuality('936p60');

    expect(service.quality()).toBe('936p60');
    expect(service.availableQualities()).toEqual([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('936p60'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);

    service.setQuality('not-a-quality');

    expect(service.quality()).toBe('auto');
    expect(service.availableQualities()).toEqual([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);
  });

  it('normalizes Twitch quality labels and prefers richer source labels', () => {
    service.setAvailableQualities([
      quality('chunked', 'Source'),
      quality('chunked', '1080p60'),
      quality('audio_only', 'Audio Only'),
      quality('720p60', '   '),
      quality('auto', 'Auto'),
    ]);

    expect(service.availableQualities()).toEqual([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);

    service.setQuality('chunked');

    expect(service.availableQualities()[1]).toEqual(quality('chunked', '1080p60 (Quelle)'));
  });

  it('normalizes duplicate ids, fallback names and legacy stream objects from persisted lists', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [
        {
          id: 1,
          name: ' Favoriten ',
          streams: [{ id: ' Shroud ', showChat: true }, { name: 'INVALID-NAME' }, { name: 'Shroud', showChat: false }],
        },
        {
          id: 1,
          name: '   ',
          streams: [' RocketBeansTV '],
        },
        {
          id: 0,
          name: 42,
          streams: ['gronkh'],
        },
        {
          id: 3,
          name: 'Weekend',
          streams: [],
        },
      ],
      quality: 'chunked',
      statistics: [],
    }));

    service = createService();
    service.setActiveListId(2);

    expect(service.lists()).toEqual([
      { id: 1, name: 'Favoriten', streams: [channel('shroud', true)] },
      { id: 2, name: 'Liste 2', streams: [channel('rocketbeanstv')] },
      { id: 3, name: 'Liste 3', streams: [channel('gronkh')] },
      { id: 4, name: 'Weekend', streams: [] },
    ]);
    expect(service.listCount()).toBe(4);
    expect(service.streamCount()).toBe(1);
  });

  it('persists stream order and options automatically', async () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.moveStream(1, -1);
    service.setQuality('720p60');
    service.setStreamShowChat(0, true);
    TestBed.tick();
    await flushPersistence();

    expect(JSON.parse(localStorage.getItem('app_state_v3') ?? '{}')).toEqual({
      lists: [
        {
          id: 1,
          name: 'Liste 1',
          streams: [channel('second_channel', true), channel('first_channel')],
        },
      ],
      quality: '720p60',
      statistics: [
        { name: 'first_channel', value: 1 },
        { name: 'second_channel', value: 1 },
      ],
      favoriteChannels: [],
      recentChannels: ['second_channel', 'first_channel'],
      layoutPreset: 'auto',
      focusedChannel: null,
      lastActiveListId: 1,
    });
  });

  it('duplicates lists with incremented copy names and cloned streams', () => {
    service.createList('Favoriten');
    service.setActiveListId(1);
    service.addStream('shroud');

    expect(service.duplicateList(1)).toEqual({
      ok: true,
      list: { id: 2, name: 'Favoriten Kopie', streams: [channel('shroud')] },
    });
    expect(service.duplicateList(1)).toEqual({
      ok: true,
      list: { id: 3, name: 'Favoriten Kopie 2', streams: [channel('shroud')] },
    });
  });

  it('tracks favorites, recent channels, layout presets and focused streams', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');
    service.addStream('gronkh');

    expect(service.toggleFavoriteChannel('shroud')).toBe(true);
    expect(service.favoriteChannels()).toEqual(['shroud']);
    expect(service.recentChannels()).toEqual(['gronkh', 'shroud']);

    service.setLayoutPreset('stage');
    service.setFocusedChannel('gronkh');

    expect(service.layoutPreset()).toBe('stage');
    expect(service.focusedChannel()).toBe('gronkh');

    expect(service.toggleFavoriteChannel('shroud')).toBe(false);
    expect(service.favoriteChannels()).toEqual([]);
  });

  it('initializes only once even when called repeatedly', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 1, name: 'Liste 1', streams: [channel('first_channel')] }],
      quality: 'auto',
      statistics: [],
    }));
    service = createService();
    service.setActiveListId(1);

    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 1, name: 'Liste 1', streams: [channel('second_channel')] }],
      quality: 'auto',
      statistics: [],
    }));
    service.initialize();
    TestBed.tick();

    expect(service.streams()).toEqual([channel('first_channel')]);
  });

  it('coalesces multiple state changes into one storage write burst', async () => {
    const storage = TestBed.inject(StorageService);
    const setJsonSpy = vi.spyOn(storage, 'setJson');

    setJsonSpy.mockClear();

    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.setQuality('720p60');
    service.setStreamShowChat(1, true);
    TestBed.tick();

    expect(setJsonSpy).not.toHaveBeenCalled();

    await flushPersistence();

    expect(setJsonSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the persistence error once and resets after a successful save', async () => {
    const storage = TestBed.inject(StorageService);
    const toast = TestBed.inject(ToastService);
    const setJsonSpy = vi.spyOn(storage, 'setJson');
    const toastSpy = vi.spyOn(toast, 'show');

    setJsonSpy.mockReturnValue(false);

    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    TestBed.tick();
    await flushPersistence();

    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      'Änderungen konnten nicht gespeichert werden. Prüfe den verfügbaren Browser-Speicher.',
      'error',
    );

    service.setQuality('720p60');
    TestBed.tick();
    await flushPersistence();

    expect(toastSpy).toHaveBeenCalledTimes(1);

    setJsonSpy.mockReturnValue(true);

    service.setQuality('480p');
    TestBed.tick();
    await flushPersistence();

    setJsonSpy.mockReturnValue(false);

    service.setQuality('auto');
    TestBed.tick();
    await flushPersistence();

    expect(toastSpy).toHaveBeenCalledTimes(2);
  });

  it('updates the chat visibility for an individual stream only', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    service.addStream('second_channel');

    service.setStreamShowChat(1, true);

    expect(service.streams()).toEqual([
      channel('first_channel'),
      channel('second_channel', true),
    ]);
  });

  it('handles empty, invalid, duplicate and missing-list add requests', () => {
    expect(service.addStream('shroud')).toEqual({ ok: false, reason: 'no-list' });
    expect(service.addStream('   ')).toEqual({ ok: false, reason: 'empty' });

    service.createList('Liste 1');
    service.setActiveListId(1);

    expect(service.addStream('invalid-name')).toEqual({ ok: false, reason: 'invalid' });
    service.addStream('shroud');

    expect(service.addStream('shroud')).toEqual({ ok: false, reason: 'duplicate', name: 'shroud' });
  });

  it('returns null for invalid removals and ignores out-of-bounds moves', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');

    expect(service.removeStream(2)).toBeNull();

    service.moveStream(0, -1);

    expect(service.streams()).toEqual([channel('shroud')]);
  });

  it('safely ignores list and stream mutations without the required active state', () => {
    expect(service.deleteList(99)).toBeNull();
    expect(service.removeStream(0)).toBeNull();
    expect(service.addStream('shroud')).toEqual({ ok: false, reason: 'no-list' });

    service.moveStream(0, 1);
    service.setStreamShowChat(0, true);

    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');
    service.setStreamShowChat(0, false);

    expect(service.streams()).toEqual([channel('shroud')]);
  });

  it('removes valid streams and can increment an existing statistic on re-add', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');

    expect(service.removeStream(0)).toBe('shroud');
    expect(service.streams()).toEqual([]);

    service.addStream('shroud');

    expect(service.getTopStatistics(1)).toEqual([{ name: 'shroud', value: 2 }]);
  });

  it('deletes lists and resets the active list selection when needed', () => {
    service.createList('Liste 1');
    service.createList('Liste 2');
    service.setActiveListId(2);

    expect(service.deleteList(2)).toEqual({ id: 2, name: 'Liste 2', streams: [] });
    expect(service.activeListId()).toBeNull();
    expect(service.lists()).toEqual([{ id: 1, name: 'Liste 1', streams: [] }]);
    expect(service.lastActiveListId()).toBe(1);
  });

  it('opens, closes and toggles the menu state', () => {
    expect(service.menuOpen()).toBe(false);

    service.openMenu();
    expect(service.menuOpen()).toBe(true);

    service.closeMenu();
    expect(service.menuOpen()).toBe(false);

    service.toggleMenu();
    expect(service.menuOpen()).toBe(true);
  });

  it('sorts statistics descending and respects the limit', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [],
      quality: 'auto',
      statistics: [
        { name: 'rocketbeanstv', value: 2 },
        { name: 'shroud', value: 5 },
        { name: 'gronkh', value: 3 },
      ],
    }));

    service = createService();

    expect(service.getTopStatistics(2)).toEqual([
      { name: 'shroud', value: 5 },
      { name: 'gronkh', value: 3 },
    ]);
  });

  it('migrates legacy storage keys into the new list-based state once during initialization', async () => {
    localStorage.clear();
    localStorage.setItem('streams', JSON.stringify(['legacy_channel']));
    localStorage.setItem('streams_qualies', '480p');
    localStorage.setItem('showChat_v2', 'true');

    service = createService();
    service.setActiveListId(1);
    await flushPersistence();

    expect(service.streams()).toEqual([channel('legacy_channel', true)]);
    expect(service.quality()).toBe('480p');
    expect(service.lists()).toEqual([{ id: 1, name: 'Liste 1', streams: [channel('legacy_channel', true)] }]);
    expect(service.lastActiveListId()).toBe(1);
  });

  it('prefers streams_v2 and quality_v2 when migrating legacy state', async () => {
    localStorage.clear();
    localStorage.setItem('streams_v2', JSON.stringify([{ id: ' newer_one ' }]));
    localStorage.setItem('streams', JSON.stringify(['older_one']));
    localStorage.setItem('quality_v2', '720p60');
    localStorage.setItem('streams_qualities', 'chunked');
    localStorage.setItem('streams_qualies', '480p');
    localStorage.setItem('stats_v2', JSON.stringify([
      { name: 'Shroud', value: 3.9 },
      { name: 'gronkh', value: 0 },
      { name: 'invalid-name', value: 5 },
    ]));

    service = createService();
    service.setActiveListId(1);
    await flushPersistence();

    expect(service.streams()).toEqual([channel('newer_one')]);
    expect(service.quality()).toBe('720p60');
    expect(service.getTopStatistics(10)).toEqual([
      { name: 'shroud', value: 3 },
      { name: 'gronkh', value: 1 },
    ]);
  });

  it('returns not-found for missing lists and allows case-only renames on the active list', () => {
    service.createList('Favoriten');

    expect(service.renameList(999, 'Main')).toEqual({ ok: false, reason: 'not-found' });
    expect(service.renameList(1, 'favoriten')).toEqual({
      ok: true,
      list: { id: 1, name: 'favoriten', streams: [] },
    });
  });

  it('normalizes helper values for invalid statistics, streams and qualities', () => {
    const normalizeStoredStatistics = getServiceMethod<(value: unknown) => unknown[]>(service, '_normalizeStoredStatistics');
    const normalizeStoredStreams = getServiceMethod<(values: unknown[], defaultShowChat?: boolean) => StreamChannel[]>(
      service,
      '_normalizeStoredStreams',
    );
    const normalizeStoredQuality = normalizeStreamQuality;

    expect(normalizeStoredStatistics(null)).toEqual([]);
    expect(normalizeStoredStatistics([
      { name: 'Shroud', value: 2.9 },
      { name: 'invalid-name', value: 4 },
      { name: 'gronkh', value: 0 },
      null,
    ])).toEqual([
      { name: 'shroud', value: 2 },
      { name: 'gronkh', value: 1 },
    ]);
    expect(normalizeStoredStreams([
      { name: { nested: true } },
      { id: ' Papaplatte ', showChat: true },
      { name: 'papaplatte', showChat: false },
      'INVALID-NAME',
    ], false)).toEqual([
      channel('papaplatte', true),
    ]);
    expect(normalizeStoredQuality('invalid')).toBe('auto');
  });

  it('returns empty lists for invalid list payloads and skips non-object entries', () => {
    const normalizeStoredLists = getServiceMethod<(
      value: unknown,
      defaultShowChat?: boolean,
    ) => { id: number; name: string; streams: StreamChannel[] }[]>(service, '_normalizeStoredLists');

    expect(normalizeStoredLists(null)).toEqual([]);
    expect(normalizeStoredLists([null, 'broken', { id: 2, name: 'Main', streams: ['shroud'] }], true)).toEqual([
      { id: 2, name: 'Main', streams: [channel('shroud', true)] },
    ]);
  });

  it('normalizes individual stored lists with string ids and non-array streams', () => {
    const normalizeStoredList = getServiceMethod<(
      value: unknown,
      index: number,
      usedIds: Set<number>,
      defaultShowChat: boolean,
    ) => { id: number; name: string; streams: StreamChannel[] } | null>(service, '_normalizeStoredList');

    expect(normalizeStoredList('broken', 0, new Set<number>(), false)).toBeNull();
    expect(normalizeStoredList({ id: '5', name: ' Main ', streams: 'broken' }, 0, new Set<number>(), true)).toEqual({
      id: 5,
      name: 'Main',
      streams: [],
    });
  });

  it('normalizes non-string qualities, default statistic values and legacy stream ids', () => {
    const normalizeStoredStatistics = getServiceMethod<(value: unknown) => unknown[]>(service, '_normalizeStoredStatistics');
    const normalizeStoredStreams = getServiceMethod<(values: unknown[], defaultShowChat?: boolean) => StreamChannel[]>(
      service,
      '_normalizeStoredStreams',
    );
    const normalizeStoredQuality = normalizeStreamQuality;

    expect(normalizeStoredQuality(720)).toBe('auto');
    expect(normalizeStoredStatistics([{ name: 'Shroud' }])).toEqual([{ name: 'shroud', value: 1 }]);
    expect(normalizeStoredStreams([{ id: ' Papaplatte ', showChat: true }], false)).toEqual([
      channel('papaplatte', true),
    ]);
  });

  it('updates only the targeted list and clears the active selection when deleting it', () => {
    const updateList = getServiceMethod<(
      listId: number,
      updater: (list: { id: number; name: string; streams: StreamChannel[] }) => { id: number; name: string; streams: StreamChannel[] },
    ) => void>(service, '_updateList');

    service.createList('Liste 1');
    service.createList('Liste 2');
    service.setActiveListId(2);

    updateList(1, list => ({ ...list, name: 'Main Stage' }));

    expect(service.lists()).toEqual([
      { id: 1, name: 'Main Stage', streams: [] },
      { id: 2, name: 'Liste 2', streams: [] },
    ]);

    service.deleteList(2);

    expect(service.activeListId()).toBeNull();
  });

  it('short-circuits duplicate and emptied persistence microtasks', async () => {
    const storage = TestBed.inject(StorageService);
    const setJsonSpy = vi.spyOn(storage, 'setJson');
    const schedulePersist = getServiceMethod<(
      state: AppSettings
    ) => void>(service, '_schedulePersist');

    setJsonSpy.mockClear();
    setServiceMember(service, '_persistScheduled', true);
    schedulePersist(defaultState());

    expect(setJsonSpy).not.toHaveBeenCalled();

    setServiceMember(service, '_persistScheduled', false);
    schedulePersist(defaultState());
    setServiceMember(service, '_pendingPersistState', undefined);
    await flushPersistence();

    expect(setJsonSpy).not.toHaveBeenCalled();
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  function quality(value: string, label = value): StreamQualityOption {
    return { value, label };
  }

  function defaultState(): AppSettings {
    return {
      lists: [],
      quality: 'auto',
      statistics: [],
      favoriteChannels: [],
      recentChannels: [],
      layoutPreset: 'auto',
      focusedChannel: null,
      lastActiveListId: null,
    };
  }

  function createService(): StreamStateService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const instance = TestBed.inject(StreamStateService);
    instance.initialize();
    TestBed.tick();

    return instance;
  }

  async function flushPersistence(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }
});
