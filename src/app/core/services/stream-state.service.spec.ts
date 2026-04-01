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
  }
});