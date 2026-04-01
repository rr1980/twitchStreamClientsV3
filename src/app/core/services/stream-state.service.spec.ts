import { TestBed } from '@angular/core/testing';
import { StreamStateService } from './stream-state.service';

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

  it('persists stream order and options automatically', () => {
    service.addStream('first_channel');
    service.addStream('second_channel');
    service.moveStream(1, -1);
    service.setQuality('720p60');
    service.setShowChat(true);
    TestBed.flushEffects();

    expect(JSON.parse(localStorage.getItem('streams_v2') ?? '[]')).toEqual(['second_channel', 'first_channel']);
    expect(localStorage.getItem('quality_v2')).toBe('720p60');
    expect(localStorage.getItem('showChat_v2')).toBe('true');
  });

  function createService(): StreamStateService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const instance = TestBed.inject(StreamStateService);
    TestBed.flushEffects();

    return instance;
  }
});