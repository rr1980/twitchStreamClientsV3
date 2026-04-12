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
    ], 1920, 1080, 'stage');

    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(2);
    expect(layout.placements[0]).toEqual({ column: '1 / span 3', row: '1 / span 2' });
    expect(layout.placements[1]).toEqual({ column: '4', row: '1' });
    expect(layout.placements[2]).toEqual({ column: '4', row: '2' });
  });

  it('builds a chat-friendly layout with fewer columns', () => {
    expect(calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
    ], 1400, 900, 'chat')).toMatchObject({ cols: 2, rows: 2 });
    expect(calculateStreamGridLayout([
      channel('one'),
      channel('two'),
    ], 700, 1200, 'chat')).toMatchObject({ cols: 1, rows: 2 });
  });

  it('returns a 1x1 layout with no placements for empty stream sets in all presets', () => {
    expect(calculateStreamGridLayout([], 1920, 1080, 'auto')).toEqual({ cols: 1, rows: 1, placements: [] });
    expect(calculateStreamGridLayout([], 1920, 1080, 'balanced')).toEqual({ cols: 1, rows: 1, placements: [] });
  });

  it('builds a balanced layout based on square root columns', () => {
    const layout = calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
      channel('four'),
    ], 1920, 1080, 'balanced');

    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.placements).toHaveLength(4);
  });

  it('builds a featured layout for a single stream', () => {
    const layout = calculateStreamGridLayout([channel('one')], 1920, 1080, 'stage');

    expect(layout).toEqual({ cols: 1, rows: 1, placements: [{}] });
  });

  it('builds a featured layout for two streams', () => {
    const layout = calculateStreamGridLayout([channel('one'), channel('two')], 1920, 1080, 'stage');

    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.placements[0]).toEqual({ column: '1 / span 2', row: '1 / span 2' });
    expect(layout.placements[1]).toEqual({ column: '3', row: '1 / span 2' });
  });

  it('builds a portrait featured layout with a hero row and a grid below', () => {
    const layout = calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
      channel('four'),
    ], 800, 1200, 'stage');

    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(4);
    expect(layout.placements[0]).toEqual({ column: '1 / span 2', row: '1 / span 2' });
  });

  it('builds a larger hero with a side rail for four landscape streams', () => {
    const layout = calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
      channel('four'),
    ], 1920, 1080, 'stage');

    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(3);
    expect(layout.placements).toEqual([
      { column: '1 / span 3', row: '1 / span 3' },
      { column: '4', row: '1' },
      { column: '4', row: '2' },
      { column: '4', row: '3' },
    ]);
  });

  it('uses a full-width lower row when one extra stream remains after the side rail', () => {
    const layout = calculateStreamGridLayout([
      channel('one'),
      channel('two'),
      channel('three'),
      channel('four'),
      channel('five'),
    ], 1920, 1080, 'stage');

    expect(layout.cols).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.placements[4]).toEqual({ column: '1 / span 4', row: '4' });
  });

  it('builds a single-stream chat layout', () => {
    const layout = calculateStreamGridLayout([channel('one')], 1920, 1080, 'chat');

    expect(layout).toMatchObject({ cols: 1, rows: 1 });
  });

  /**
   * Creates a stream test fixture with an optional chat flag.
   *
   * @param {string} name - Channel name of the test stream.
    * @param {boolean} [showChat] - Whether the fixture stream should be created with chat enabled.
   * @returns {StreamChannel} Stream fixture used in layout tests.
   * @remarks This helper reduces repetition across grid test cases.
   */
  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }
});
