import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamChannel } from '../models/app-settings.model';
import { ToastService } from '../../features/toast/toast.service';
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

  it('persists stream order and options automatically', async () => {
    service.createList('Liste 1');
    service.setActiveListId(1);
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.moveStream(1, -1);
    service.setQuality('720p60');
    service.setStreamShowChat(0, true);
    TestBed.flushEffects();
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
    });
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
    TestBed.flushEffects();

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
    TestBed.flushEffects();

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
    TestBed.flushEffects();
    await flushPersistence();

    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      'Änderungen konnten nicht gespeichert werden. Prüfe den verfügbaren Browser-Speicher.',
      'error',
    );

    service.setQuality('720p60');
    TestBed.flushEffects();
    await flushPersistence();

    expect(toastSpy).toHaveBeenCalledTimes(1);

    setJsonSpy.mockReturnValue(true);

    service.setQuality('480p');
    TestBed.flushEffects();
    await flushPersistence();

    setJsonSpy.mockReturnValue(false);

    service.setQuality('auto');
    TestBed.flushEffects();
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
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

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