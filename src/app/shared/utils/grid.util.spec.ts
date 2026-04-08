import type { StreamChannel } from '../../core/models/app-settings.model';
import { calculateOptimalGrid, calculateStreamGridLayout } from './grid.util';

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

  it('builds a featured layout for stage presets', () => {
    const layout = calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
    ], 1920, 1080, 'stage', false);

    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.placements[0]).toEqual({ column: 'span 2', row: 'span 2' });
  });

  it('builds a chat-friendly layout with fewer columns', () => {
    expect(calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
    ], 1400, 900, 'chat', false)).toMatchObject({ cols: 2, rows: 2 });
    expect(calculateStreamGridLayout([
      channel('one'),
      channel('two'),
    ], 700, 1200, 'chat', false)).toMatchObject({ cols: 1, rows: 2 });
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }
});