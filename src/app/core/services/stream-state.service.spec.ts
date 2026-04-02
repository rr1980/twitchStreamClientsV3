import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamStateService } from './stream-state.service';
import { StorageService } from './storage.service';

describe('StreamStateService', () => {
  let service: StreamStateService;

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

  it('normalizes valid channel names before adding them', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);

    const result = service.addStream('  RocketBeansTV,  ');

    expect(result).toEqual({ ok: true, name: 'rocketbeanstv' });
    expect(service.streams()).toEqual(['rocketbeanstv']);
  });

  it('rejects duplicate channel names after normalization', () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('shroud');

    const result = service.addStream('  SHROUD  ');

    expect(result).toEqual({ ok: false, reason: 'duplicate', name: 'shroud' });
    expect(service.streams()).toEqual(['shroud']);
  });

  it('filters invalid persisted data during initialization', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [
        {
          id: 9,
          name: ' Favoriten ',
          streams: [' valid_name ', 'INVALID-NAME', { name: 'second_one' }, null, 'valid_name'],
        },
      ],
      quality: 'not-a-quality',
      showChat: true,
      statistics: [{ name: 'Shroud', value: 2 }, { name: 'invalid-name', value: 1 }],
    }));

    service = createService();
    service.setActiveListId(9);

    expect(service.streams()).toEqual(['valid_name', 'second_one']);
    expect(service.quality()).toBe('auto');
    expect(service.showChat()).toBe(true);
    expect(service.getTopStatistics(10)).toEqual([{ name: 'shroud', value: 2 }]);
  });

  it('persists stream order and options automatically', async () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.moveStream(1, -1);
    service.setQuality('720p60');
    service.setShowChat(true);
    TestBed.flushEffects();
    await flushPersistence();

    expect(JSON.parse(localStorage.getItem('app_state_v3') ?? '{}')).toEqual({
      lists: [
        { id: 1, name: 'Liste 1', streams: ['second_channel', 'first_channel'] },
      ],
      quality: '720p60',
      showChat: true,
      statistics: [
        { name: 'first_channel', value: 1 },
        { name: 'second_channel', value: 1 },
      ],
    });
  });

  it('initializes only once even when called repeatedly', () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 1, name: 'Liste 1', streams: ['first_channel'] }],
      quality: 'auto',
      showChat: false,
      statistics: [],
    }));
    service = createService();
    service.setActiveListId(1);

    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 1, name: 'Liste 1', streams: ['second_channel'] }],
      quality: 'auto',
      showChat: false,
      statistics: [],
    }));
    service.initialize();
    TestBed.flushEffects();

    expect(service.streams()).toEqual(['first_channel']);
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
    service.setShowChat(true);
    TestBed.flushEffects();

    expect(setJsonSpy).not.toHaveBeenCalled();

    await flushPersistence();

    expect(setJsonSpy).toHaveBeenCalledTimes(1);
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

    expect(service.streams()).toEqual(['shroud']);
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
      showChat: false,
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

    service = createService();
    service.setActiveListId(1);
    await flushPersistence();

    expect(service.streams()).toEqual(['legacy_channel']);
    expect(service.quality()).toBe('480p');
    expect(service.lists()).toEqual([{ id: 1, name: 'Liste 1', streams: ['legacy_channel'] }]);
  });

  function createService(): StreamStateService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const instance = TestBed.inject(StreamStateService);
    instance.initialize();
    TestBed.flushEffects();

    return instance;
  }

  async function flushPersistence(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }
});