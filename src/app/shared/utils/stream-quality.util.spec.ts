import type { StreamQualityOption } from '../../core/models/app-settings.model';
import {
  areStreamQualityOptionsEqual,
  buildAvailableStreamQualityOptions,
  normalizeAvailableStreamQualities,
  normalizeStreamQuality,
} from './stream-quality.util';

describe('stream-quality.util', () => {
  it('normalizes supported and localized quality values', () => {
    expect(normalizeStreamQuality('1080p60 (Quelle)')).toBe('chunked');
    expect(normalizeStreamQuality('1080p60 (Source)')).toBe('chunked');
    expect(normalizeStreamQuality('720p60')).toBe('720p60');
    expect(normalizeStreamQuality('invalid')).toBe('auto');
  });

  it('deduplicates and sorts available qualities with normalized labels', () => {
    expect(normalizeAvailableStreamQualities([
      quality('chunked', 'Source'),
      quality('chunked', '1080p60'),
      quality('720p60', '   '),
      quality('audio_only', 'Audio Only'),
      quality('auto', 'Auto'),
    ])).toEqual([
      quality('chunked', '1080p60 (Quelle)'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);
  });

  it('keeps the selected quality visible in the built option list', () => {
    expect(buildAvailableStreamQualityOptions([
      quality('1080p60'),
      quality('chunked', '1080p60 (Quelle)'),
    ], '936p60')).toEqual([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('936p60'),
    ]);
  });

  it('compares quality lists by normalized order and content', () => {
    const left = [quality('chunked', 'Quelle'), quality('720p60')];
    const right = [quality('chunked', 'Quelle'), quality('720p60')];
    const changed = [quality('chunked', '1080p60 (Quelle)'), quality('720p60')];

    expect(areStreamQualityOptionsEqual(left, right)).toBe(true);
    expect(areStreamQualityOptionsEqual(left, changed)).toBe(false);
  });

  it('sorts qualities with same resolution by frame rate', () => {
    expect(normalizeAvailableStreamQualities([
      quality('720p30', '720p30'),
      quality('720p60', '720p60'),
    ])).toEqual([
      quality('720p60'),
      quality('720p30'),
    ]);
  });

  it('sorts low-resolution qualities by their actual frame rate', () => {
    expect(normalizeAvailableStreamQualities([
      quality('160p30', '160p30'),
      quality('160p60', '160p60'),
    ])).toEqual([
      quality('160p60'),
      quality('160p30'),
    ]);
  });

  it('falls back to locale comparison for qualities with same token', () => {
    expect(normalizeAvailableStreamQualities([
      quality('480p30', '480p30'),
      quality('480p', '480p'),
    ])).toEqual([
      quality('480p30'),
      quality('480p'),
    ]);
  });

  /**
   * Creates a quality option fixture with a default label matching the value.
   *
   * @param {string} value - Normalized quality value for the fixture entry.
    * @param {string} [label] - Optional display label for the quality.
   * @returns {StreamQualityOption} Quality fixture used in assertions.
   * @remarks When no explicit label is provided, the quality value itself is used as the display text.
   */
  function quality(value: string, label = value): StreamQualityOption {
    return { value, label };
  }
});
