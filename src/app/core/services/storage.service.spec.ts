import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads and writes browser storage values', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(StorageService);

    service.setString('name', 'shroud');
    service.setBoolean('showChat', true);
    service.setJson('streams', ['shroud']);

    expect(service.getString('name', 'fallback')).toBe('shroud');
    expect(service.getBoolean('showChat')).toBe(true);
    expect(service.getJson('streams', [])).toEqual(['shroud']);
    expect(service.hasKey('name')).toBe(true);
  });

  it('falls back safely when storage is unavailable', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const service = TestBed.inject(StorageService);

    expect(service.getItem('missing')).toBeNull();
    expect(service.getString('missing', 'fallback')).toBe('fallback');
    expect(service.getBoolean('missing', true)).toBe(true);
    expect(service.getJson('missing', ['fallback'])).toEqual(['fallback']);

    expect(() => service.setString('name', 'value')).not.toThrow();
    expect(() => service.remove('name')).not.toThrow();
  });

  it('swallows storage access failures and returns fallbacks', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(StorageService);

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(service.getItem('missing')).toBeNull();
    expect(service.getString('missing', 'fallback')).toBe('fallback');
    expect(service.getBoolean('missing', true)).toBe(true);
    expect(service.getJson('missing', ['fallback'])).toEqual(['fallback']);
    expect(() => service.setString('name', 'value')).not.toThrow();
    expect(() => service.setBoolean('showChat', true)).not.toThrow();
    expect(() => service.setJson('streams', ['shroud'])).not.toThrow();
    expect(() => service.remove('name')).not.toThrow();
  });
});