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

  /**
   * Returns a bound private method from the component for white-box test access.
   *
   * @param {object} instance - Component instance that owns the requested method.
   * @param {string} propertyName - Name of the private method.
   * @returns {T} Bound method with the expected function type.
   * @remarks Binding ensures that the method keeps the correct `this` context.
   */
  function getPrivateMethod<T extends (...args: never[]) => unknown>(
    instance: object,
    propertyName: string,
  ): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  /**
   * Reads a private numeric field from the component instance.
   *
   * @param {object} instance - Component instance that owns the requested field.
   * @param {string} propertyName - Name of the private numeric field.
   * @returns {number} Current numeric field value.
   * @remarks Used by white-box assertions that inspect internal counters.
   */
  function getPrivateNumber(instance: object, propertyName: string): number {
    return (instance as Record<string, number>)[propertyName];
  }

  /**
   * Writes a private numeric field on the component instance.
   *
   * @param {object} instance - Component instance that owns the target field.
   * @param {string} propertyName - Name of the private numeric field.
   * @param {number} value - New numeric value.
   * @remarks Allows internal state to be prepared for targeted test paths.
    * @returns {void}
   */
  function setPrivateNumber(instance: object, propertyName: string, value: number): void {
    (instance as Record<string, number>)[propertyName] = value;
  }

  /**
   * Writes an arbitrary private member on the component instance.
   *
   * @param {object} instance - Component instance that owns the target member.
   * @param {string} propertyName - Name of the private member.
   * @param {T} value - New value.
   * @remarks Used to inject test doubles and internal flags directly.
    * @returns {void}
   */
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

    expect(twitch.loadScript).not.toHaveBeenCalled();
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
    fixture.detectChanges();
    await fixture.whenStable();
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
      muted: false,
      onAvailableQualities: expect.any(Function),
    }));
  });

  it('uses Twitch-compatible minimum grid tracks for autoplay', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const component = fixture.componentInstance;

    expect(getPrivateMethod<() => string>(component, '_gridTemplateColumns')()).toContain(
      'minmax(var(--twitch-embed-min-width), 1fr)',
    );
    expect(getPrivateMethod<() => string>(component, '_gridTemplateRows')()).toContain(
      'minmax(var(--twitch-embed-min-height), 1fr)',
    );
  });

  it('defers embed startup while the menu overlay is open', async () => {
    state.menuOpen.set(true);
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    expect(twitch.loadScript).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();

    state.menuOpen.set(false);
    await syncComponent();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      muted: false,
    }));
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, expect.objectContaining({
      elementId: 'twitch-embed-rocketbeanstv',
      muted: false,
    }));
  });

  it('defers embed startup while the document is hidden and retries when it becomes visible', async () => {
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    try {
      state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
      await syncComponent();

      expect(twitch.loadScript).not.toHaveBeenCalled();
      expect(twitch.createEmbed).not.toHaveBeenCalled();

      visibilitySpy.mockReturnValue('visible');
      getPrivateMethod<() => void>(fixture.componentInstance, '_onDocumentVisibilityChange')();
      await syncComponent();

      expect(twitch.loadScript).toHaveBeenCalledTimes(1);
      expect(twitch.createEmbed).toHaveBeenCalledWith(expect.objectContaining({
        elementId: 'twitch-embed-shroud',
      }));
    } finally {
      visibilitySpy.mockRestore();
    }
  });

  it('ignores visibility changes before the view is ready or while the document is still hidden', async () => {
    const component = fixture.componentInstance;
    const syncEmbedsSpy = vi.spyOn(
      component as unknown as Record<string, (...args: never[]) => Promise<void>>,
      '_syncEmbeds',
    ).mockResolvedValue(undefined);

    getPrivateMethod<() => void>(component, '_onDocumentVisibilityChange')();
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();

    component.ngAfterViewInit();
    TestBed.tick();
    await Promise.resolve();
    syncEmbedsSpy.mockClear();
    setPrivateMember(component, '_hostRef', () => ({ nativeElement: { ownerDocument: { visibilityState: 'hidden' } } }));

    getPrivateMethod<() => void>(component, '_onDocumentVisibilityChange')();
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();
  });

  it('updates mute-all mode through existing embed handles without recreating streams', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');

    twitch.createEmbed.mockClear();
    firstHandle?.destroy.mockClear();
    secondHandle?.destroy.mockClear();
    state.muteAllStreams.set(true);
    await syncComponent();

    expect(firstHandle?.destroy).not.toHaveBeenCalled();
    expect(secondHandle?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(firstHandle?.setMuted).toHaveBeenCalledWith(true);
    expect(secondHandle?.setMuted).toHaveBeenCalledWith(true);

    firstHandle?.setMuted.mockClear();
    secondHandle?.setMuted.mockClear();

    state.muteAllStreams.set(false);
    await syncComponent();

    expect(firstHandle?.destroy).not.toHaveBeenCalled();
    expect(secondHandle?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(firstHandle?.setMuted).toHaveBeenCalledWith(false);
    expect(secondHandle?.setMuted).toHaveBeenCalledWith(false);
  });

  it('defers mute changes while the menu is open and applies them after closing', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');

    twitch.loadScript.mockClear();
    twitch.createEmbed.mockClear();
    firstHandle?.setMuted.mockClear();
    secondHandle?.setMuted.mockClear();

    state.menuOpen.set(true);
    state.muteAllStreams.set(true);
    await syncComponent();

    expect(twitch.loadScript).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(firstHandle?.setMuted).not.toHaveBeenCalled();
    expect(secondHandle?.setMuted).not.toHaveBeenCalled();

    state.menuOpen.set(false);
    await syncComponent();

    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(firstHandle?.setMuted).toHaveBeenCalledWith(true);
    expect(secondHandle?.setMuted).toHaveBeenCalledWith(true);
  });

  it('defers quality and mute changes while the menu is open and applies them after closing', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    const handle = twitch.handles.get('twitch-embed-shroud');

    twitch.loadScript.mockClear();
    twitch.createEmbed.mockClear();
    handle?.destroy.mockClear();
    handle?.setMuted.mockClear();
    handle?.setQuality.mockClear();

    state.menuOpen.set(true);
    state.quality.set('720p60');
    state.muteAllStreams.set(true);
    await syncComponent();

    expect(twitch.loadScript).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(handle?.destroy).not.toHaveBeenCalled();
    expect(handle?.setMuted).not.toHaveBeenCalled();
    expect(handle?.setQuality).not.toHaveBeenCalled();

    state.menuOpen.set(false);
    await syncComponent();

    expect(handle?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(handle?.setMuted).toHaveBeenCalledWith(true);
    expect(handle?.setQuality).toHaveBeenCalledWith('720p60');
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
    state.setAvailableQualities.mockClear();

    twitch.reportQualities('twitch-embed-shroud', [
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
    ]);

    expect(state.setAvailableQualities).not.toHaveBeenCalled();

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
      muted: false,
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

  it('preserves muted state on reorder and destroys all handles on component teardown', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');
    firstHandle?.destroy.mockClear();
    secondHandle?.destroy.mockClear();
    twitch.createEmbed.mockClear();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('rocketbeanstv'), channel('shroud')] });
    await syncComponent();

    expect(firstHandle?.destroy).not.toHaveBeenCalled();
    expect(secondHandle?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(firstHandle?.setMuted).not.toHaveBeenCalled();
    expect(secondHandle?.setMuted).not.toHaveBeenCalled();

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

  it('skips pending embed creation when the wrapper disappears after the script resolves', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    fixture.detectChanges();

    let resolveLoadScript!: () => void;
    twitch.loadScript.mockReturnValueOnce(new Promise<undefined>(resolve => {
      resolveLoadScript = () => resolve(undefined);
    }));

    const component = fixture.componentInstance;
    const runId = getPrivateNumber(component, '_syncRunId') + 1;

    setPrivateNumber(component, '_syncRunId', runId);
    const syncPromise = getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(runId);

    await Promise.resolve();
    fixture.nativeElement.querySelector('#twitch-embed-shroud')?.remove();
    resolveLoadScript();
    await syncPromise;

    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('rechecks pending embeds after the script resolves and reuses compatible handles', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    fixture.detectChanges();

    let resolveLoadScript!: () => void;
    twitch.loadScript.mockReturnValueOnce(new Promise<undefined>(resolve => {
      resolveLoadScript = () => resolve(undefined);
    }));

    const component = fixture.componentInstance;
    const runId = getPrivateNumber(component, '_syncRunId') + 1;
    const handle = new MockTwitchEmbedHandle();
    const renderedEmbeds = (component as unknown as Record<string, Map<string, {
      elementId: string;
      quality: StreamQuality;
      showChat: boolean;
      muted: boolean;
      handle: TwitchEmbedHandle;
    }>>)['_renderedEmbeds'];

    setPrivateNumber(component, '_syncRunId', runId);
    const syncPromise = getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(runId);

    await Promise.resolve();
    renderedEmbeds.set('shroud', {
      elementId: 'twitch-embed-shroud',
      quality: 'auto',
      showChat: false,
      muted: false,
      handle,
    });
    resolveLoadScript();
    await syncPromise;

    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(handle.destroy).not.toHaveBeenCalled();
  });

  it('recreates embeds when chat layout changes and syncs quality without recreation', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    await syncComponent();

    const initialHandle = twitch.handles.get('twitch-embed-shroud');
    initialHandle?.destroy.mockClear();
    initialHandle?.setQuality.mockClear();
    twitch.createEmbed.mockClear();

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud', true)] });
    await syncComponent();

    expect(initialHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledWith(expect.objectContaining({
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: 'auto',
      showChat: true,
      muted: false,
    }));

    const newHandle = twitch.handles.get('twitch-embed-shroud');
    newHandle?.destroy.mockClear();
    newHandle?.setQuality.mockClear();
    twitch.createEmbed.mockClear();

    state.quality.set('720p60');
    await syncComponent();

    expect(newHandle?.destroy).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(newHandle?.setQuality).toHaveBeenCalledWith('720p60');
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

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud', true), channel('rocketbeanstv', true)] });
    setPrivateNumber(component, '_syncRunId', nextRunId);
    await expect(getPrivateMethod<(runId: number) => Promise<void>>(component, '_syncEmbeds')(nextRunId)).resolves.toBeUndefined();

    expect(twitch.createEmbed).toHaveBeenCalledTimes(1);
  });

  it('renders featured placements without player overlays', async () => {
    state.layoutPreset.set('stage');
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv'), channel('gronkh')] });
    await syncComponent();

    const wrappers = fixture.nativeElement.querySelectorAll('.twitch-embed-wrapper') as NodeListOf<HTMLElement>;

    expect(wrappers[0].style.gridColumn).toBe('1 / span 3');
    expect(wrappers[0].style.gridRow).toBe('1 / span 2');
    expect(fixture.nativeElement.querySelector('.stream-overlay')).toBeNull();
  });

  it('renders a larger hero and a right-side rail for four stage streams', async () => {
    state.layoutPreset.set('stage');
    state.setActiveList({
      id: 1,
      name: 'Liste 1',
      streams: [channel('shroud'), channel('rocketbeanstv'), channel('gronkh'), channel('papaplatte')],
    });
    await syncComponent();

    const wrappers = fixture.nativeElement.querySelectorAll('.twitch-embed-wrapper') as NodeListOf<HTMLElement>;

    expect(wrappers[0].style.gridColumn).toBe('1 / span 3');
    expect(wrappers[0].style.gridRow).toBe('1 / span 3');
    expect(wrappers[1].style.gridColumn).toBe('4');
    expect(wrappers[1].style.gridRow).toBe('1');
    expect(wrappers[3].style.gridRow).toBe('3');
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

  /**
   * Creates a stream fixture with an optional chat flag.
   *
   * @param {string} name - Channel name of the fixture stream.
    * @param {boolean} [showChat] - Whether the stream should be created with chat enabled.
   * @returns {StreamChannel} Stream fixture used in grid tests.
   * @remarks The helper keeps layout and focus tests compact.
   */
  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  /**
   * Creates a quality option fixture for embed quality reporting.
   *
   * @param {string} value - Normalized quality value.
    * @param {string} [label] - Optional display label.
   * @returns {StreamQualityOption} Quality fixture used by embed mocks.
   * @remarks When no label is provided, the quality value itself is displayed.
   */
  function quality(value: string, label = value): StreamQualityOption {
    return { value, label };
  }

  /**
   * Flushes change detection and pending microtasks for the component fixture.
   *
   * @returns {Promise<void>} Promise that resolves once the fixture update becomes stable.
   * @remarks Combines change detection, fakeAsync timers, and microtask flushing for reproducible UI tests.
   */
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
  public readonly menuOpen = signal(false);
  public readonly muteAllStreams = signal(false);
  public readonly availableQualities = signal<StreamQualityOption[]>([{ value: 'auto', label: 'Auto' }]);
  public readonly setAvailableQualities = vi.fn((values: StreamQualityOption[]) => {
    this.availableQualities.set([{ value: 'auto', label: 'Auto' }, ...values]);
  });
  private readonly _activeList = signal<StreamList | null>(null);

  /**
   * Replaces the active list fixture and keeps the active id in sync.
   *
   * @param {StreamList | null} list - New active list fixture or `null`.
   * @remarks The mock method updates both the active list and the active list id.
    * @returns {void}
   */
  public setActiveList(list: StreamList | null): void {
    this._activeList.set(list);
    this.activeListId.set(list?.id ?? null);
  }
}

/**
 * Test double for [`TwitchEmbedService`](src/app/core/services/twitch-embed.service.ts:91) used by grid component specs.
 *
 * @remarks Records created handles and exposes a helper to push available-quality callbacks manually.
 */
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

  /**
   * Pushes reported qualities into the callback registered for an embed.
   *
   * @param {string} elementId - Element id of the affected embed.
   * @param {StreamQualityOption[]} qualities - Reported quality options.
   * @remarks Simulates Twitch embed quality callbacks without a real player instance.
    * @returns {void}
   */
  public reportQualities(elementId: string, qualities: StreamQualityOption[]): void {
    this._qualityCallbacks.get(elementId)?.(qualities);
  }
}

/**
 * Minimal mock implementation of [`TwitchEmbedHandle`](src/app/core/services/twitch-embed.service.ts:69) for grid tests.
 *
 * @remarks Exposes spies for lifecycle and state synchronization assertions.
 */
class MockTwitchEmbedHandle implements TwitchEmbedHandle {
  public readonly destroy = vi.fn();
  public readonly setMuted = vi.fn();
  public readonly setQuality = vi.fn();
}

/**
 * Minimal toast service mock used to observe UI feedback side effects.
 *
 * @remarks The mock keeps only the [`show`](src/app/features/stream-grid/stream-grid.component.spec.ts:940) spy required by these tests.
 */
class MockToastService {
  public readonly show = vi.fn();
}
