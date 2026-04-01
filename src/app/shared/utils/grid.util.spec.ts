import { calculateOptimalGrid } from './grid.util';

describe('calculateOptimalGrid', () => {
  it('returns a 1x1 layout for empty stream sets', () => {
    expect(calculateOptimalGrid(0, 1920, 1080, false)).toEqual({ cols: 1, rows: 1 });
  });

  it('prefers two columns for four 16:9 streams on a 16:9 viewport', () => {
    expect(calculateOptimalGrid(4, 1920, 1080, false)).toEqual({ cols: 2, rows: 2 });
  });

  it('uses a taller grid when chat is enabled', () => {
    expect(calculateOptimalGrid(4, 1920, 1080, true)).toEqual({ cols: 2, rows: 2 });
    expect(calculateOptimalGrid(2, 1200, 800, true)).toEqual({ cols: 1, rows: 2 });
  });

  it('never exceeds the number of requested streams', () => {
    const layout = calculateOptimalGrid(7, 1440, 900, false);

    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(7);
    expect(layout.cols).toBeLessThanOrEqual(7);
    expect(layout.rows).toBeGreaterThanOrEqual(1);
  });
});