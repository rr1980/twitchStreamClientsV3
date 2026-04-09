import type { StreamChannel, StreamLayoutPreset } from '../../core/models/app-settings.model';

export interface GridLayout {
  cols: number;
  rows: number;
}

export interface GridItemPlacement {
  column?: string;
  row?: string;
}

export interface StreamGridLayout extends GridLayout {
  placements: GridItemPlacement[];
}

export function calculateOptimalGrid(
  streams: StreamChannel[],
  containerWidth: number,
  containerHeight: number,
): GridLayout {
  const count = streams.length;

  if (count === 0) {
    return { cols: 1, rows: 1 };
  }

  let bestCols = 1;
  let bestRows = 1;
  let maxArea = 0;

  const chatCount = streams.filter(stream => stream.showChat).length;
  const plainCount = count - chatCount;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellWidth = containerWidth / cols;
    const cellHeight = containerHeight / rows;
    const totalArea = thisCellArea(cellWidth, cellHeight, true) * chatCount
                    + thisCellArea(cellWidth, cellHeight, false) * plainCount;

    if (totalArea > maxArea) {
      maxArea = totalArea;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return { cols: bestCols, rows: bestRows };
}

export function calculateStreamGridLayout(
  streams: StreamChannel[],
  containerWidth: number,
  containerHeight: number,
  preset: StreamLayoutPreset,
  hasFocusedStream: boolean,
): StreamGridLayout {
  const count = streams.length;

  if (count === 0) {
    return { cols: 1, rows: 1, placements: [] };
  }

  if (hasFocusedStream || preset === 'stage') {
    return calculateFeaturedGrid(count, containerWidth, containerHeight);
  }

  if (preset === 'balanced') {
    return buildUniformLayout(count, calculateBalancedGrid(count));
  }

  if (preset === 'chat') {
    return buildUniformLayout(count, calculateChatGrid(count, containerWidth, containerHeight));
  }

  return buildUniformLayout(count, calculateOptimalGrid(streams, containerWidth, containerHeight));
}

function buildUniformLayout(count: number, layout: GridLayout): StreamGridLayout {
  return {
    ...layout,
    placements: Array.from({ length: count }, () => ({})),
  };
}

function calculateBalancedGrid(count: number): GridLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  return { cols, rows };
}

function calculateChatGrid(count: number, containerWidth: number, containerHeight: number): GridLayout {
  if (count <= 1) {
    return { cols: 1, rows: 1 };
  }

  const prefersSingleColumn = containerWidth < containerHeight || count <= 2;
  const cols = prefersSingleColumn ? 1 : Math.min(2, count);

  return {
    cols,
    rows: Math.ceil(count / cols),
  };
}

function calculateFeaturedGrid(count: number, containerWidth: number, containerHeight: number): StreamGridLayout {
  if (count === 1) {
    return buildUniformLayout(1, { cols: 1, rows: 1 });
  }

  if (count === 2) {
    return {
      cols: 2,
      rows: 2,
      placements: [
        { column: '1', row: '1 / span 2' },
        {},
      ],
    };
  }

  const cols = containerWidth >= containerHeight ? 4 : 3;
  const normalizedCols = Math.min(Math.max(3, cols), Math.max(3, count));

  return {
    cols: normalizedCols,
    rows: Math.max(2, Math.ceil((count + 3) / normalizedCols)),
    placements: [
      { column: 'span 2', row: 'span 2' },
      ...Array.from({ length: count - 1 }, () => ({})),
    ],
  };
}

function thisCellArea(cellWidth: number, cellHeight: number, showChat: boolean): number {
  const targetRatio = showChat ? 21 / 9 : 16 / 9;

  let videoWidth = cellWidth;
  let videoHeight = cellWidth / targetRatio;

  if (videoHeight > cellHeight) {
    videoHeight = cellHeight;
    videoWidth = cellHeight * targetRatio;
  }

  return videoWidth * videoHeight;
}