import type { StreamChannel, StreamLayoutPreset } from '../../core/models/app-settings.model';

/**
 * Represents the number of columns and rows for a rendered grid.
 *
 * @property {number} cols Number of grid columns.
 * @property {number} rows Number of grid rows.
 * @remarks Used to describe the grid layout for stream placement.
 */
export interface GridLayout {
  cols: number;
  rows: number;
}

/**
 * Describes an optional CSS grid placement override for a single tile.
 *
 * @property {string | undefined} column Optional CSS grid column override.
 * @property {string | undefined} row Optional CSS grid row override.
 */
export interface GridItemPlacement {
  column?: string;
  row?: string;
}

/**
 * Combines the grid dimensions with per-stream placement metadata.
 *
 * @property {GridItemPlacement[]} placements Placement overrides for rendered stream tiles.
 * @remarks Used for advanced stream grid layouts with custom placements.
 */
export interface StreamGridLayout extends GridLayout {
  placements: GridItemPlacement[];
}

/**
 * Calculates the grid layout with the largest effective video area for the given streams.
 *
 * @param {StreamChannel[]} streams List of stream channels to display.
 * @param {number} containerWidth Width of the container in pixels.
 * @param {number} containerHeight Height of the container in pixels.
 * @returns {GridLayout} Optimal grid layout with column and row counts.
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
 * Resolves the grid layout for the selected preset.
 *
 * @param {StreamChannel[]} streams List of stream channels to display.
 * @param {number} containerWidth Width of the container in pixels.
 * @param {number} containerHeight Height of the container in pixels.
 * @param {StreamLayoutPreset} preset Selected layout preset.
 * @returns {StreamGridLayout} Computed stream grid layout with placements.
   */
export function calculateStreamGridLayout(
  streams: StreamChannel[],
  containerWidth: number,
  containerHeight: number,
  preset: StreamLayoutPreset,
): StreamGridLayout {
  const count = streams.length;

  if (count === 0) {
    return { cols: 1, rows: 1, placements: [] };
  }

  if (preset === 'stage') {
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
 *
 * @param {number} count Number of streams.
 * @param {GridLayout} layout Grid layout to use.
 * @returns {StreamGridLayout} Stream grid layout with uniform placements.
 */
function buildUniformLayout(count: number, layout: GridLayout): StreamGridLayout {
  return {
    ...layout,
    placements: Array.from({ length: count }, () => ({})),
  };
}

/**
 * Creates a square-like grid for the balanced layout preset.
 *
 * @param {number} count Number of streams.
 * @returns {GridLayout} Calculated grid layout.
 */
function calculateBalancedGrid(count: number): GridLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  return { cols, rows };
}

/**
 * Chooses a chat-friendly grid layout based on the viewport aspect ratio.
 *
 * @param {number} count Number of streams.
 * @param {number} containerWidth Width of the container in pixels.
 * @param {number} containerHeight Height of the container in pixels.
 * @returns {GridLayout} Calculated grid layout for chat mode.
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
 *
 * @param {number} count Number of streams.
 * @param {number} containerWidth Width of the container in pixels.
 * @param {number} containerHeight Height of the container in pixels.
 * @returns {StreamGridLayout} Featured stream grid layout.
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
 *
 * @param {number} cellWidth Width of the cell in pixels.
 * @param {number} cellHeight Height of the cell in pixels.
 * @param {boolean} showChat Whether the stream has chat enabled and therefore changes the target aspect ratio.
 * @returns {number} Estimated video area in square pixels.
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
