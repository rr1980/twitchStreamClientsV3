import type { StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';

/**
 * Sort token used to order quality values consistently.
 *
 * @remarks Lower `group` values sort first, then resolution and frame rate are compared in descending order to keep higher-quality options ahead of weaker matches.
 */
interface QualitySortToken {
  /** Priority group for source, standard, and audio-only qualities. */
  group: number;

  /** Numeric resolution extracted from the quality value. */
  resolution: number;

  /** Numeric frame rate extracted from the quality value. */
  frameRate: number;
}

/**
 * Normalizes persisted or user-provided quality values to supported Twitch identifiers.
 *
 * @param {unknown} value - Quality value to normalize.
 * @returns {StreamQuality} Normalized stream quality identifier.
 * @remarks Legacy labels such as `Source` or `Quelle` are collapsed into the canonical `chunked` quality so persistence and menu comparison stay stable.
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
 *
 * @param {string} value - Quality string to validate.
 * @returns {boolean} `true` when the value is a supported stream quality.
 * @remarks Supported values are the explicit `auto`, `chunked`, and `audio_only` markers plus Twitch resolution strings such as `720p`, `720p60`, or similar frame-rate variants. Keeping this predicate narrow prevents unknown Twitch labels from being persisted as if they were stable app settings.
 */
function isSupportedStreamQuality(value: string): boolean {
  return value === 'auto'
    || value === 'chunked'
    || value === 'audio_only'
    || /^\d+p(?:\d+(?:-\d+)?)?$/i.test(value);
}

/**
 * Produces a stable German label for a normalized quality option.
 *
 * @param {StreamQuality} value - Normalized stream quality value.
 * @param {string} [label] - Optional label provided by Twitch.
 * @returns {string} Normalized German label.
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
 *
 * @param {StreamQuality} value - Stream quality value.
 * @returns {string} Default label for the given quality.
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
 *
 * @param {StreamQualityOption[]} values - Reported stream quality options.
 * @returns {StreamQualityOption[]} Normalized and sorted array of unique stream quality options.
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
 *
 * @param {StreamQualityOption[]} reportedQualities - Reported stream quality options.
 * @param {StreamQuality} selectedQuality - Currently selected stream quality value.
 * @returns {StreamQualityOption[]} Combined and deduplicated list of stream quality options.
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
 *
 * @param {StreamQualityOption[]} left - First array of stream quality options.
 * @param {StreamQualityOption[]} right - Second array of stream quality options.
 * @returns {boolean} `true` when both option lists are equal.
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
 *
 * @param {StreamQualityOption} option - Stream quality option to score.
 * @returns {number} Relative score used to prefer more descriptive duplicate labels.
 * @remarks Source labels that preserve both resolution and source context rank highest so deduplication keeps the most informative caption returned by Twitch even when different embeds expose the same quality with different localized labels.
 */
function getStreamQualityLabelScore(option: StreamQualityOption): number {
  if (option.value === 'chunked' && /^\d+p/i.test(option.label)) {
    return 3;
  }

  return option.label === getDefaultStreamQualityLabel(option.value) ? 1 : 2;
}

/**
 * Sorts qualities by semantic priority, resolution, frame rate, and name.
 *
 * @param {StreamQuality} left - First stream quality value.
 * @param {StreamQuality} right - Second stream quality value.
 * @returns {number} Negative when `left` sorts before `right`, positive when after, or `0` when equal.
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
 *
 * @param {StreamQuality} value - Stream quality value to convert.
 * @returns {QualitySortToken} Sort token used for quality ordering.
 */
function getQualitySortToken(value: StreamQuality): QualitySortToken {
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
