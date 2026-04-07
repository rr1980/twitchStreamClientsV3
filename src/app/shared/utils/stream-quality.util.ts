import type { StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';

export function normalizeStreamQuality(value: unknown): StreamQuality {
  const storedQuality = typeof value === 'string' ? value.trim() : 'auto';
  const sourceQualityMatch = storedQuality.match(/^(\d+p(?:\d+(?:-\d+)?)?)\s*\((?:source|quelle)\)$/i);

  if (sourceQualityMatch) {
    return 'chunked';
  }

  return isSupportedStreamQuality(storedQuality) ? storedQuality : 'auto';
}

export function isSupportedStreamQuality(value: string): boolean {
  return value === 'auto'
    || value === 'chunked'
    || value === 'audio_only'
    || /^\d+p(?:\d+(?:-\d+)?)?$/i.test(value);
}

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

export function areStreamQualityOptionsEqual(
  left: StreamQualityOption[],
  right: StreamQualityOption[],
): boolean {
  return left.length === right.length
    && left.every((quality, index) =>
      quality.value === right[index]?.value && quality.label === right[index]?.label);
}

function getStreamQualityLabelScore(option: StreamQualityOption): number {
  if (option.value === 'chunked' && /^\d+p/i.test(option.label)) {
    return 3;
  }

  return option.label === getDefaultStreamQualityLabel(option.value) ? 1 : 2;
}

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
    frameRate: value.includes('60') ? 60 : qualityMatch?.[2] ? Number(qualityMatch[2]) : 0,
  };
}
