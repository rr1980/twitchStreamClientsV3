import type { StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';

/**
 * Normalizes persisted or user-provided quality values to supported Twitch identifiers.
 * @param value - The quality value to normalize (can be string or unknown).
 * @returns The normalized stream quality identifier.
 */
export function normalizeStreamQuality(value: unknown): StreamQuality {
  const storedQuality = typeof value === 'string' ? value.trim() : 'auto';
  const sourceQualityMatch = storedQuality.match(/^(\d+p(?:\d+(?:-\d+)?)?)\s*\((?:source|quelle)\)$/i);

  if (sourceQualityMatch) {
    return 'chunked';
  }

  return isSupportedStreamQuality(storedQuality) ? storedQuality : 'auto';
}

/**
 * Checks whether a quality string matches the app-supported Twitch formats.
 * @param value - The quality string to check.
 * @returns True if the value is a supported stream quality, otherwise false.
 */
function isSupportedStreamQuality(value: string): boolean {
  return value === 'auto'
    || value === 'chunked'
    || value === 'audio_only'
    || /^\d+p(?:\d+(?:-\d+)?)?$/i.test(value);
}

/**
 * Produces a stable German label for a normalized quality option.
 * @param value - The normalized stream quality value.
 * @param label - The optional label provided by Twitch.
 * @returns The normalized label in German.
 */
export function normalizeStreamQualityLabel(value: StreamQuality, label?: string): string {
  const normalizedLabel = label?.trim().replace(/\s+/g, ' ');

  if (!normalizedLabel) {
    return getDefaultStreamQualityLabel(value);
  }

  if (value === 'chunked') {
    if (/^source$/i.test(normalizedLabel)) {
      return 'Quelle';
    }

    if (/^\d+p(?:\d+(?:-\d+)?)?$/i.test(normalizedLabel)) {
      return `${normalizedLabel} (Quelle)`;
    }

    return normalizedLabel.replace(/\(Source\)/gi, '(Quelle)');
  }

  if (value === 'audio_only' && /^audio only$/i.test(normalizedLabel)) {
    return 'Nur Audio';
  }

  return normalizedLabel;
}

/**
 * Returns the fallback label used when Twitch does not provide one.
 * @param value - The stream quality value.
 * @returns The default label for the given quality.
 */
export function getDefaultStreamQualityLabel(value: StreamQuality): string {
  switch (value) {
    case 'auto':
      return 'Auto';
    case 'chunked':
      return 'Quelle';
    case 'audio_only':
      return 'Nur Audio';
    default:
      return value.replace(/_/g, ' ');
  }
}

/**
 * Deduplicates, normalizes, and sorts the qualities reported by Twitch embeds.
 * @param values - The array of reported stream quality options.
 * @returns The normalized and sorted array of unique stream quality options.
 */
export function normalizeAvailableStreamQualities(values: StreamQualityOption[]): StreamQualityOption[] {
  const uniqueQualities = new Map<string, StreamQualityOption>();

  values.forEach(value => {
    const normalizedValue = normalizeStreamQuality(value.value);

    if (normalizedValue === 'auto') {
      return;
    }

    const normalizedOption: StreamQualityOption = {
      value: normalizedValue,
      label: normalizeStreamQualityLabel(normalizedValue, value.label),
    };
    const existingOption = uniqueQualities.get(normalizedValue.toLowerCase());

    if (!existingOption || getStreamQualityLabelScore(normalizedOption) > getStreamQualityLabelScore(existingOption)) {
      uniqueQualities.set(normalizedValue.toLowerCase(), normalizedOption);
    }
  });

  return [...uniqueQualities.values()].sort((left, right) => compareStreamQualities(left.value, right.value));
}

/**
 * Merges the selected value with reported options into the menu-ready quality list.
 * @param reported - The array of reported stream quality options.
 * @param selected - The currently selected stream quality value.
 * @returns The combined and deduplicated list of stream quality options.
 */
export function buildAvailableStreamQualityOptions(
  reportedQualities: StreamQualityOption[],
  selectedQuality: StreamQuality,
): StreamQualityOption[] {
  const qualityOptions = new Map<string, StreamQualityOption>();
  const normalizedSelectedQuality = normalizeStreamQuality(selectedQuality);

  qualityOptions.set('auto', { value: 'auto', label: getDefaultStreamQualityLabel('auto') });

  if (normalizedSelectedQuality !== 'auto') {
    qualityOptions.set(normalizedSelectedQuality.toLowerCase(), {
      value: normalizedSelectedQuality,
      label: getDefaultStreamQualityLabel(normalizedSelectedQuality),
    });
  }

  normalizeAvailableStreamQualities(reportedQualities).forEach(quality => {
    qualityOptions.set(quality.value.toLowerCase(), quality);
  });

  return [
    { value: 'auto', label: getDefaultStreamQualityLabel('auto') },
    ...[...qualityOptions.values()]
      .filter(quality => quality.value !== 'auto')
      .sort((left, right) => compareStreamQualities(left.value, right.value)),
  ];
}

/**
 * Compares two option lists by value and label order.
 * @param left - The first array of stream quality options.
 * @param right - The second array of stream quality options.
 * @returns True if both option lists are equal, otherwise false.
 */
export function areStreamQualityOptionsEqual(
  left: StreamQualityOption[],
  right: StreamQualityOption[],
): boolean {
  return left.length === right.length
    && left.every((quality, index) =>
      quality.value === right[index]?.value && quality.label === right[index]?.label);
}

/**
 * Prefers more descriptive labels when duplicate quality values are reported.
 * @param left - The first stream quality option.
 * @param right - The second stream quality option.
 * @returns The preferred stream quality option.
 */
function getStreamQualityLabelScore(option: StreamQualityOption): number {
  if (option.value === 'chunked' && /^\d+p/i.test(option.label)) {
    return 3;
  }

  return option.label === getDefaultStreamQualityLabel(option.value) ? 1 : 2;
}

/**
 * Sorts qualities by semantic priority, resolution, frame rate, and name.
 * @param a - The first stream quality option.
 * @param b - The second stream quality option.
 * @returns A negative number if a < b, positive if a > b, or 0 if equal.
 */
function compareStreamQualities(left: StreamQuality, right: StreamQuality): number {
  const leftToken = getQualitySortToken(left);
  const rightToken = getQualitySortToken(right);

  if (leftToken.group !== rightToken.group) {
    return leftToken.group - rightToken.group;
  }

  if (leftToken.resolution !== rightToken.resolution) {
    return rightToken.resolution - leftToken.resolution;
  }

  if (leftToken.frameRate !== rightToken.frameRate) {
    return rightToken.frameRate - leftToken.frameRate;
  }

  return left.localeCompare(right);
}

/**
 * Converts a quality string into sortable priority tokens.
 * @param value - The stream quality value to convert.
 * @returns An array of tokens for sorting purposes.
 */
function getQualitySortToken(value: StreamQuality): { group: number; resolution: number; frameRate: number } {
  if (value === 'chunked') {
    return { group: 0, resolution: Number.MAX_SAFE_INTEGER, frameRate: Number.MAX_SAFE_INTEGER };
  }

  if (value === 'audio_only') {
    return { group: 2, resolution: -1, frameRate: -1 };
  }

  const qualityMatch = value.match(/^(\d+)p(?:.*?(\d+))?$/i);

  return {
    group: 1,
    resolution: qualityMatch ? Number(qualityMatch[1]) : -1,
    frameRate: qualityMatch?.[2] ? Number(qualityMatch[2]) : 0,
  };
}
