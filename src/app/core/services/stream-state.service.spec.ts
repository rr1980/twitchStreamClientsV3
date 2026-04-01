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

  it('normalizes valid channel names before adding them', () => {
    const result = service.addStream('  RocketBeansTV,  ');

    expect(result).toEqual({ ok: true, name: 'rocketbeanstv' });
    expect(service.streams()).toEqual(['rocketbeanstv']);
  });

  it('rejects duplicate channel names after normalization', () => {
    service.addStream('shroud');

    const result = service.addStream('  SHROUD  ');

    expect(result).toEqual({ ok: false, reason: 'duplicate', name: 'shroud' });
    expect(service.streams()).toEqual(['shroud']);
  });

  it('filters invalid persisted data during initialization', () => {
    localStorage.setItem('streams_v2', JSON.stringify([' valid_name ', 'INVALID-NAME', { name: 'second_one' }, null, 'valid_name']));
    localStorage.setItem('quality_v2', 'not-a-quality');
    localStorage.setItem('showChat_v2', 'true');

    service = createService();

    expect(service.streams()).toEqual(['valid_name', 'second_one']);
    expect(service.quality()).toBe('auto');
    expect(service.showChat()).toBe(true);
  });

  it('persists stream order and options automatically', async () => {
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.moveStream(1, -1);
    service.setQuality('720p60');
    service.setShowChat(true);
    TestBed.flushEffects();
    await flushPersistence();

    expect(JSON.parse(localStorage.getItem('streams_v2') ?? '[]')).toEqual(['second_channel', 'first_channel']);
    expect(localStorage.getItem('quality_v2')).toBe('720p60');
    expect(localStorage.getItem('showChat_v2')).toBe('true');
  });

  it('initializes only once even when called repeatedly', () => {
    localStorage.setItem('streams_v2', JSON.stringify(['first_channel']));
    service = createService();

    localStorage.setItem('streams_v2', JSON.stringify(['second_channel']));
    service.initialize();
    TestBed.flushEffects();

    expect(service.streams()).toEqual(['first_channel']);
  });

  it('coalesces multiple state changes into one storage write burst', async () => {
    const storage = TestBed.inject(StorageService);
    const setJsonSpy = vi.spyOn(storage, 'setJson');
    const setStringSpy = vi.spyOn(storage, 'setString');
    const setBooleanSpy = vi.spyOn(storage, 'setBoolean');

    setJsonSpy.mockClear();
    setStringSpy.mockClear();
    setBooleanSpy.mockClear();

    service.addStream('first_channel');
    service.addStream('second_channel');
    service.setQuality('720p60');
    service.setShowChat(true);
    TestBed.flushEffects();

    expect(setJsonSpy).not.toHaveBeenCalled();
    expect(setStringSpy).not.toHaveBeenCalled();
    expect(setBooleanSpy).not.toHaveBeenCalled();

    await flushPersistence();

    expect(setJsonSpy).toHaveBeenCalledTimes(2);
    expect(setStringSpy).toHaveBeenCalledTimes(1);
    expect(setBooleanSpy).toHaveBeenCalledTimes(1);
  });

  it('handles empty, invalid and duplicate add requests', () => {
    expect(service.addStream('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(service.addStream('invalid-name')).toEqual({ ok: false, reason: 'invalid' });

    service.addStream('shroud');

    expect(service.addStream('shroud')).toEqual({ ok: false, reason: 'duplicate', name: 'shroud' });
  });

  it('returns null for invalid removals and ignores out-of-bounds moves', () => {
    service.addStream('shroud');

    expect(service.removeStream(2)).toBeNull();

    service.moveStream(0, -1);

    expect(service.streams()).toEqual(['shroud']);
  });

  it('removes valid streams and can increment an existing statistic on re-add', () => {
    service.addStream('shroud');

    expect(service.removeStream(0)).toBe('shroud');
    expect(service.streams()).toEqual([]);

    service.addStream('shroud');

    expect(service.getTopStatistics(1)).toEqual([{ name: 'shroud', value: 2 }]);
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
    localStorage.setItem('stats_v2', JSON.stringify([
      { name: 'rocketbeanstv', value: 2 },
      { name: 'shroud', value: 5 },
      { name: 'gronkh', value: 3 },
    ]));

    service = createService();

    expect(service.getTopStatistics(2)).toEqual([
      { name: 'shroud', value: 5 },
      { name: 'gronkh', value: 3 },
    ]);
  });

  it('migrates legacy storage keys once during initialization', async () => {
    localStorage.clear();
    localStorage.setItem('streams', JSON.stringify(['legacy_channel']));
    localStorage.setItem('streams_qualies', '480p');

    service = createService();
    await flushPersistence();

    expect(service.streams()).toEqual(['legacy_channel']);
    expect(service.quality()).toBe('480p');
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