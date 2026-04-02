import type { StreamChannel } from '../../core/models/app-settings.model';

export interface GridLayout {
  cols: number;
  rows: number;
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

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cellWidth = containerWidth / cols;
    const cellHeight = containerHeight / rows;
    const totalArea = streams.reduce((sum, stream) => sum + thisCellArea(cellWidth, cellHeight, stream.showChat), 0);

    if (totalArea > maxArea) {
      maxArea = totalArea;
      bestCols = cols;
      bestRows = rows;
    }
  }

  return { cols: bestCols, rows: bestRows };
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