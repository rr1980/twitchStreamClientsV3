import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
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
});