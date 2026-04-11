import type { StreamChannel, StreamLayoutPreset } from '../../core/models/app-settings.model';

/**
 * Represents the number of columns and rows for a rendered grid.
 * @remarks Used to describe the grid layout for stream placement.
 */
export interface GridLayout {
  cols: number;
  rows: number;
}

/**
 * Describes an optional CSS grid placement override for a single tile.
 * @property column - The CSS grid column override (optional).
 * @property row - The CSS grid row override (optional).
 */
export interface GridItemPlacement {
  column?: string;
  row?: string;
}

/**
 * Combines the grid dimensions with per-stream placement metadata.
 * @remarks Used for advanced stream grid layouts with custom placements.
 */
export interface StreamGridLayout extends GridLayout {
  placements: GridItemPlacement[];
}

/**
 * Calculates the grid layout with the largest effective video area for the given streams.
 * @param streams - The list of stream channels to display.
 * @param containerWidth - The width of the container in pixels.
 * @param containerHeight - The height of the container in pixels.
 * @returns The optimal grid layout (columns and rows).
 * @remarks Takes into account streams with and without chat.
 */
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

/**
 * Resolves the grid layout for the selected preset and current focus state.
 * @param streams - The list of stream channels to display.
 * @param containerWidth - The width of the container in pixels.
 * @param containerHeight - The height of the container in pixels.
 * @param preset - The selected layout preset.
 * @param hasFocusedStream - Whether a stream is currently focused.
 * @returns The computed stream grid layout with placements.
 */
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

/**
 * Builds a layout where every stream occupies one uniform grid cell.
 * @param count - The number of streams.
 * @param layout - The grid layout to use.
 * @returns The stream grid layout with uniform placements.
 */
function buildUniformLayout(count: number, layout: GridLayout): StreamGridLayout {
  return {
    ...layout,
    placements: Array.from({ length: count }, () => ({})),
  };
}

/**
 * Creates a square-like grid for the balanced layout preset.
 * @param count - The number of streams.
 * @returns The calculated grid layout.
 */
function calculateBalancedGrid(count: number): GridLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  return { cols, rows };
}

/**
 * Chooses a chat-friendly grid layout based on the viewport aspect ratio.
 * @param count - The number of streams.
 * @param containerWidth - The width of the container in pixels.
 * @param containerHeight - The height of the container in pixels.
 * @returns The calculated grid layout for chat mode.
 */
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

/**
 * Creates the stage-style layout where the first stream gets extra space.
 * @param count - The number of streams.
 * @param containerWidth - The width of the container in pixels.
 * @param containerHeight - The height of the container in pixels.
 * @returns The featured stream grid layout.
 */
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

/**
 * Estimates the usable video area for one cell, accounting for chat width.
 * @param cellWidth - The width of the cell in pixels.
 * @param cellHeight - The height of the cell in pixels.
 * @param showChat - Whether the stream has chat enabled (affects aspect ratio).
 * @returns The estimated video area in pixels squared.
 */
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