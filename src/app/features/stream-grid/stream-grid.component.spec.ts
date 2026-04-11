import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import type { StreamChannel, StreamLayoutPreset, StreamList, StreamQuality, StreamQualityOption } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedService } from '../../core/services/twitch-embed.service';
import type { TwitchEmbedHandle } from '../../core/services/twitch-embed.service';
import { StreamGridComponent } from './stream-grid.component';
import { ToastService } from '../toast/toast.service';

describe('StreamGridComponent', () => {
  let fixture: ComponentFixture<StreamGridComponent>;
  let state: MockStreamStateService;
  let twitch: MockTwitchEmbedService;
  let toast: MockToastService;

  function getPrivateMethod<T extends (...args: never[]) => unknown>(
    instance: object,
    propertyName: string,
  ): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  function getPrivateNumber(instance: object, propertyName: string): number {
    return (instance as Record<string, number>)[propertyName];
  }

  function setPrivateNumber(instance: object, propertyName: string, value: number): void {
    (instance as Record<string, number>)[propertyName] = value;
  }

  function setPrivateMember<T>(instance: object, propertyName: string, value: T): void {
    (instance as Record<string, unknown>)[propertyName] = value;
  }

  beforeEach(async () => {
    state = new MockStreamStateService();
    twitch = new MockTwitchEmbedService();
    toast = new MockToastService();

    await TestBed.configureTestingModule({
      imports: [StreamGridComponent],
      providers: [
        { provide: StreamStateService, useValue: state },
        { provide: TwitchEmbedService, useValue: twitch },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamGridComponent);
  });

  it('renders the empty state without creating embeds', async () => {
    await syncComponent();

    expect(fixture.nativeElement.querySelector('.empty-state h1')?.textContent).toContain('Dein Setup ist leer');
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('returns safely when embeds are synced before wrapper elements exist', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });

    const component = fixture.componentInstance;
    const runId = getPrivateNumber(component, '_syncRunId') + 1;

    setPrivateNumber(component, '_syncRunId', runId);

    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(runId)).resolves.toBeUndefined();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('returns immediately when syncEmbeds is already stale before doing any work', async () => {
    const component = fixture.componentInstance;

    setPrivateNumber(component, '_syncRunId', 5);

    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(4)).resolves.toBeUndefined();

    expect(twitch.loadScript).not.toHaveBeenCalled();
  });

  it('returns early when syncEmbeds has no host element', async () => {
    const component = fixture.componentInstance;

    setPrivateMember(component, '_hostRef', () => undefined);

    const runId = getPrivateNumber(component, '_syncRunId') + 1;
    setPrivateNumber(component, '_syncRunId', runId);

    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(runId)).resolves.toBeUndefined();

    expect(twitch.loadScript).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('shows a single toast and skips embed creation when the Twitch script fails to load', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    twitch.loadScript.mockRejectedValue(new Error('network'));

    const firstRunId = getPrivateNumber(component, '_syncRunId') + 1;
    setPrivateNumber(component, '_syncRunId', firstRunId);
    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(firstRunId)).resolves.toBeUndefined();

    const secondRunId = getPrivateNumber(component, '_syncRunId') + 1;
    setPrivateNumber(component, '_syncRunId', secondRunId);
    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(secondRunId)).resolves.toBeUndefined();

    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('Twitch-Embed konnte nicht geladen werden. Bitte versuche es erneut.', 'error');
  });

  it('suppresses the toast when a failed load belongs to a stale sync run', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    const component = fixture.componentInstance;
    const runId = getPrivateNumber(component, '_syncRunId') + 1;

    twitch.loadScript.mockImplementationOnce(async () => {
      setPrivateNumber(component, '_syncRunId', runId + 1);
      throw new Error('network');
    });

    setPrivateNumber(component, '_syncRunId', runId);

    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(runId)).resolves.toBeUndefined();

    expect(toast.show).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('ignores stale sync runs after the Twitch script resolves', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    fixture.detectChanges();

    let resolveLoadScript!: (value?: undefined) => void;
    const pendingLoadScript = new Promise<undefined>(resolve => {
      resolveLoadScript = resolve;
    });
    const component = fixture.componentInstance;

    twitch.loadScript.mockReturnValueOnce(pendingLoadScript);
    twitch.createEmbed.mockClear();

    const staleRunId = getPrivateNumber(component, '_syncRunId') + 1;
    setPrivateNumber(component, '_syncRunId', staleRunId);
    const syncPromise = getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(staleRunId);

    setPrivateNumber(component, '_syncRunId', staleRunId + 1);
    resolveLoadScript(undefined);
    await syncPromise;

    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('drops stale constructor sync runs before syncEmbeds executes', async () => {
    const component = fixture.componentInstance;
    const syncEmbedsSpy = vi.spyOn(
      component as unknown as Record<string, (...args: never[]) => Promise<void>>,
      '_syncEmbeds',
    ).mockResolvedValue(undefined);

    (component as unknown as Record<string, unknown>)['_viewReady'] = true;
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    TestBed.tick();
    setPrivateNumber(component, '_syncRunId', getPrivateNumber(component, '_syncRunId') + 1);
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();
  });

  it('drops stale after-view-init sync runs before syncEmbeds executes', async () => {
    const component = fixture.componentInstance;
    const syncEmbedsSpy = vi.spyOn(
      component as unknown as Record<string, (...args: never[]) => Promise<void>>,
      '_syncEmbeds',
    ).mockResolvedValue(undefined);

    component.ngAfterViewInit();
    setPrivateNumber(component, '_syncRunId', getPrivateNumber(component, '_syncRunId') + 1);
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();
  });

  it('creates embeds for the initial stream list', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: 'auto',
      showChat: false,
      muted: false,
    }));
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      channel: 'rocketbeanstv',
      quality: 'auto',
      showChat: false,
      muted: true,
      onAvailableQualities: expect.any(Function),
    }));
  });

  it('recreates embeds when mute-all mode is enabled or disabled', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');

    twitch.createEmbed.mockClear();
    firstHandle?.destroy.mockClear();
    secondHandle?.destroy.mockClear();
    state.muteAllStreams.set(true);
    await syncComponent();

    expect(firstHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(secondHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      muted: true,
    }));
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      muted: true,
    }));

    const mutedFirstHandle = twitch.handles.get('twitch-embed-shroud');
    const mutedSecondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');

    twitch.createEmbed.mockClear();
    mutedFirstHandle?.destroy.mockClear();
    mutedSecondHandle?.destroy.mockClear();

    state.muteAllStreams.set(false);
    await syncComponent();

    expect(mutedFirstHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(mutedSecondHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      muted: false,
    }));
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      muted: true,
    }));
  });

  it('publishes Twitch quality options from active embeds and clears them when no streams remain', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    twitch.reportQualities('twitch-embed-shroud', [
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
    ]);
    twitch.reportQualities('twitch-embed-rocketbeanstv', [
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);

    expect(state.setAvailableQualities).toHaveBeenLastCalledWith([
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [] });
    await syncComponent();

    expect(state.setAvailableQualities).toHaveBeenLastCalledWith([]);
  });

  it('adds only the new embed when streams are appended', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    twitch.createEmbed.mockClear();
    twitch.handles.get('twitch-embed-shroud')?.destroy.mockClear();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    expect(twitch.handles.get('twitch-embed-shroud')?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledWith(expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      channel: 'rocketbeanstv',
      quality: 'auto',
      showChat: false,
      muted: true,
    }));
  });

  it('clears removed embeds without recreating unchanged streams', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    twitch.createEmbed.mockClear();
    const removedHandle = twitch.handles.get('twitch-embed-rocketbeanstv');
    removedHandle?.destroy.mockClear();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    expect(removedHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('recreates embeds on reorder and destroys all handles on component teardown', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');
    firstHandle?.destroy.mockClear();
    secondHandle?.destroy.mockClear();
    twitch.createEmbed.mockClear();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('rocketbeanstv'), channel('shroud')] });
    await syncComponent();

    expect(firstHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(secondHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      muted: false,
    }));
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      muted: true,
    }));

    twitch.handles.get('twitch-embed-rocketbeanstv')?.destroy.mockClear();
    twitch.handles.get('twitch-embed-shroud')?.destroy.mockClear();

    fixture.destroy();

    expect(twitch.handles.get('twitch-embed-rocketbeanstv')?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.handles.get('twitch-embed-shroud')?.destroy).toHaveBeenCalledTimes(1);
  });

  it('skips embed creation when a stream wrapper is missing in the DOM', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    fixture.nativeElement.querySelector('#twitch-embed-shroud')?.remove();
    twitch.createEmbed.mockClear();

    state.quality.set('720p60');
    await syncComponent();

    expect(twitch.loadScript).toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('recreates embeds when quality or chat layout changes', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    const initialHandle = twitch.handles.get('twitch-embed-shroud');
    initialHandle?.destroy.mockClear();
    twitch.createEmbed.mockClear();

    state.quality.set('720p60');
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud', true)] });
    await syncComponent();

    expect(initialHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledWith(expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: '720p60',
      showChat: true,
      muted: false,
    }));
  });

  it('stops creating further embeds when the run becomes stale during iteration', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const component = fixture.componentInstance;
    const originalCreateEmbed = twitch.createEmbed.getMockImplementation();
    const nextRunId = getPrivateNumber(component, '_syncRunId') + 1;

    twitch.createEmbed.mockClear();
    twitch.createEmbed.mockImplementation(options => {
      setPrivateNumber(component, '_syncRunId', nextRunId + 1);
      return originalCreateEmbed ? originalCreateEmbed(options) : new MockTwitchEmbedHandle();
    });
    twitch.handles.get('twitch-embed-shroud')?.destroy.mockClear();
    twitch.handles.get('twitch-embed-rocketbeanstv')?.destroy.mockClear();

    state.quality.set('720p60');
    setPrivateNumber(component, '_syncRunId', nextRunId);
    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(nextRunId)).resolves.toBeUndefined();

    expect(twitch.createEmbed).toHaveBeenCalledTimes(1);
  });

  it('renders featured placements and toggles the focused channel through the overlay action', async () => {
    state.layoutPreset.set('stage');
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv'), channel('gronkh')] });
    await syncComponent();

    const wrappers = fixture.nativeElement.querySelectorAll('.twitch-embed-wrapper') as NodeListOf<HTMLElement>;
    const focusButton = fixture.nativeElement.querySelector('[aria-label="shroud fokussieren"]') as HTMLButtonElement;

    expect(wrappers[0].style.gridColumn).toBe('span 2');
    expect(wrappers[0].style.gridRow).toBe('span 2');

    focusButton.click();

    expect(state.setFocusedChannel).toHaveBeenCalledWith('shroud');
  });

  it('updates the viewport signals on resize', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;

    window.innerWidth = 1440;
    window.innerHeight = 900;

    getPrivateMethod<() => void>(component, '_onResize')();
    vi.advanceTimersByTime(150);

    expect(getPrivateMethod<() => number>(component, '_viewportWidth')()).toBe(1440);
    expect(getPrivateMethod<() => number>(component, '_viewportHeight')()).toBe(900);
    vi.useRealTimers();
  });

  it('debounces rapid resize events and only applies the last values', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    const onResize = getPrivateMethod<() => void>(component, '_onResize');

    window.innerWidth = 800;
    window.innerHeight = 600;
    onResize();

    window.innerWidth = 1024;
    window.innerHeight = 768;
    onResize();

    window.innerWidth = 1440;
    window.innerHeight = 900;
    onResize();

    vi.advanceTimersByTime(150);

    expect(getPrivateMethod<() => number>(component, '_viewportWidth')()).toBe(1440);
    expect(getPrivateMethod<() => number>(component, '_viewportHeight')()).toBe(900);
    vi.useRealTimers();
  });

  it('clears the resize timer on destroy', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;

    getPrivateMethod<() => void>(component, '_onResize')();

    fixture.destroy();

    expect(() => vi.advanceTimersByTime(150)).not.toThrow();
    vi.useRealTimers();
  });

  it('returns zero viewport dimensions outside the browser platform', () => {
    const component = fixture.componentInstance;

    setPrivateMember(component, '_platformId', 'server');

    expect(getPrivateMethod<(dimension: 'innerWidth' | 'innerHeight') => number>(component, '_readViewportDimension')('innerWidth')).toBe(0);
    expect(getPrivateMethod<(dimension: 'innerWidth' | 'innerHeight') => number>(component, '_readViewportDimension')('innerHeight')).toBe(0);
  });

  it('reorders displayed streams to put the focused stream first', async () => {
    state.setActiveList({ id: 1, name: 'Test', streams: [channel('a'), channel('b'), channel('c')] });
    state.focusedChannel.set('b');
    await syncComponent();

    const component = fixture.componentInstance;
    const displayedStreams = getPrivateMethod<() => StreamChannel[]>(component, '_displayedStreams')();

    expect(displayedStreams[0].name).toBe('b');
    expect(displayedStreams.map(s => s.name)).toEqual(['b', 'a', 'c']);
  });

  it('falls back to default order when focused stream is not in the list', async () => {
    state.setActiveList({ id: 1, name: 'Test', streams: [channel('a'), channel('b')] });
    state.focusedChannel.set('nonexistent');
    await syncComponent();

    const component = fixture.componentInstance;
    const displayedStreams = getPrivateMethod<() => StreamChannel[]>(component, '_displayedStreams')();

    expect(displayedStreams.map(s => s.name)).toEqual(['a', 'b']);
  });

  it('clears the resize timer in ngOnDestroy when one is active', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    getPrivateMethod<() => void>(component, '_onResize')();
    component.ngOnDestroy();

    expect(clearSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores stale quality callbacks after a stream is replaced', async () => {
    state.setActiveList({ id: 1, name: 'Test', streams: [channel('streamer')] });
    await syncComponent();

    const staleHandle = twitch.handles.get('twitch-embed-streamer');

    state.setActiveList({ id: 1, name: 'Test', streams: [channel('other')] });
    await syncComponent();

    state.setAvailableQualities.mockClear();
    twitch.reportQualities('twitch-embed-streamer', [quality('720p60')]);

    expect(state.setAvailableQualities).not.toHaveBeenCalled();
    expect(staleHandle?.destroy).toHaveBeenCalled();
  });

  it('clears quality data when receiving only empty quality values', async () => {
    state.setActiveList({ id: 1, name: 'Test', streams: [channel('streamer')] });
    await syncComponent();

    twitch.reportQualities('twitch-embed-streamer', [quality('720p60')]);

    state.setAvailableQualities.mockClear();
    twitch.reportQualities('twitch-embed-streamer', [
      quality('', ''),
      quality('  ', '  '),
    ]);

    expect(state.setAvailableQualities).toHaveBeenLastCalledWith([]);
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  function quality(value: string, label = value): StreamQualityOption {
    return { value, label };
  }

  async function syncComponent(): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }
});

class MockStreamStateService {
  public readonly activeListId = signal<number | null>(null);
  public readonly activeList = computed<StreamList | null>(() => this._activeList());
  public readonly listCount = computed(() => this._activeList() ? 1 : 0);
  public readonly streams = computed(() => this._activeList()?.streams ?? []);
  public readonly quality = signal<StreamQuality>('auto');
  public readonly layoutPreset = signal<StreamLayoutPreset>('auto');
  public readonly focusedChannel = signal<string | null>(null);
  public readonly muteAllStreams = signal(false);
  public readonly availableQualities = signal<StreamQualityOption[]>([{ value: 'auto', label: 'Auto' }]);
  public readonly setAvailableQualities = vi.fn((values: StreamQualityOption[]) => {
    this.availableQualities.set([{ value: 'auto', label: 'Auto' }, ...values]);
  });
  public readonly setFocusedChannel = vi.fn((channelName: string | null) => {
    this.focusedChannel.set(channelName);
  });
  private readonly _activeList = signal<StreamList | null>(null);

  public setActiveList(list: StreamList | null): void {
    this._activeList.set(list);
    this.activeListId.set(list?.id ?? null);
  }
}

class MockTwitchEmbedService {
  public readonly loadScript = vi.fn(async () => undefined);
  public readonly handles = new Map<string, MockTwitchEmbedHandle>();
  private readonly _qualityCallbacks = new Map<string, (qualities: StreamQualityOption[]) => void>();
  public readonly createEmbed = vi.fn((options: { elementId: string; onAvailableQualities?: (qualities: StreamQualityOption[]) => void }) => {
    const handle = new MockTwitchEmbedHandle();
    this.handles.set(options.elementId, handle);

    if (options.onAvailableQualities) {
      this._qualityCallbacks.set(options.elementId, options.onAvailableQualities);
    }

    return handle;
  });

  public reportQualities(elementId: string, qualities: StreamQualityOption[]): void {
    this._qualityCallbacks.get(elementId)?.(qualities);
  }
}

class MockTwitchEmbedHandle implements TwitchEmbedHandle {
  public readonly destroy = vi.fn();
  public readonly setMuted = vi.fn();
}

class MockToastService {
  public readonly show = vi.fn();
}
