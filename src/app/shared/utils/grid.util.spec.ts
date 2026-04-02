import { calculateOptimalGrid } from './grid.util';

describe('calculateOptimalGrid', () => {
  it('returns a 1x1 layout for empty stream sets', () => {
    expect(calculateOptimalGrid([], 1920, 1080)).toEqual({ cols: 1, rows: 1 });
  });

  it('prefers two columns for four 16:9 streams on a 16:9 viewport', () => {
    expect(calculateOptimalGrid([
      channel('shroud'),
      channel('gronkh'),
      channel('rocketbeanstv'),
      channel('papaplatte'),
    ], 1920, 1080)).toEqual({ cols: 2, rows: 2 });
  });

  it('uses a taller grid when chat is enabled', () => {
    expect(calculateOptimalGrid([
      channel('shroud', true),
      channel('gronkh', true),
      channel('rocketbeanstv', true),
      channel('papaplatte', true),
    ], 1920, 1080)).toEqual({ cols: 2, rows: 2 });
    expect(calculateOptimalGrid([
      channel('shroud', true),
      channel('gronkh', true),
    ], 1200, 800)).toEqual({ cols: 1, rows: 2 });
  });

  it('never exceeds the number of requested streams', () => {
    const layout = calculateOptimalGrid([
      channel('one'),
      channel('two'),
      channel('three'),
      channel('four'),
      channel('five'),
      channel('six'),
      channel('seven'),
    ], 1440, 900);

    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(7);
    expect(layout.cols).toBeLessThanOrEqual(7);
    expect(layout.rows).toBeGreaterThanOrEqual(1);
  });

  function channel(name: string, showChat = false) {
    return { name, showChat };
  }
});