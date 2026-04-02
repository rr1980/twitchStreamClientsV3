import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamChannel, StreamList, StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedHandle, TwitchEmbedService } from '../../core/services/twitch-embed.service';
import { StreamGridComponent } from './stream-grid.component';
import { ToastService } from '../toast/toast.service';

describe('StreamGridComponent', () => {
  let fixture: ComponentFixture<StreamGridComponent>;
  let state: MockStreamStateService;
  let twitch: MockTwitchEmbedService;
  let toast: MockToastService;

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
    await expect((fixture.componentInstance as unknown as {
      syncEmbeds(streams: StreamChannel[], quality: StreamQuality): Promise<void>;
    }).syncEmbeds([channel('shroud')], 'auto')).resolves.toBeUndefined();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('returns early when syncEmbeds has no host element', async () => {
    const component = fixture.componentInstance as unknown as {
      hostRef: () => undefined;
      syncEmbeds(streams: StreamChannel[], quality: StreamQuality): Promise<void>;
    };

    component.hostRef = () => undefined;

    await expect(component.syncEmbeds([channel('shroud')], 'auto')).resolves.toBeUndefined();

    expect(twitch.loadScript).not.toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('shows a single toast and skips embed creation when the Twitch script fails to load', async () => {
    const component = fixture.componentInstance as unknown as {
      syncEmbeds(streams: StreamChannel[], quality: StreamQuality): Promise<void>;
    };

    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    twitch.loadScript.mockRejectedValue(new Error('network'));

    fixture.detectChanges();
    await fixture.whenStable();

    await expect(component.syncEmbeds([channel('shroud')], 'auto')).resolves.toBeUndefined();
    await expect(component.syncEmbeds([channel('shroud')], 'auto')).resolves.toBeUndefined();

    expect(twitch.createEmbed).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('Twitch-Embed konnte nicht geladen werden. Bitte versuche es erneut.', 'error');
  });

  it('drops stale constructor sync runs before syncEmbeds executes', async () => {
    const component = fixture.componentInstance as unknown as {
      viewReady: boolean;
      syncRunId: number;
      syncEmbeds: (streams: StreamChannel[], quality: StreamQuality) => Promise<void>;
    };
    const syncEmbedsSpy = vi.spyOn(component, 'syncEmbeds').mockResolvedValue(undefined);

    component.viewReady = true;
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });
    TestBed.flushEffects();
    component.syncRunId += 1;
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();
  });

  it('drops stale after-view-init sync runs before syncEmbeds executes', async () => {
    const component = fixture.componentInstance as unknown as {
      syncRunId: number;
      syncEmbeds: (streams: StreamChannel[], quality: StreamQuality) => Promise<void>;
      ngAfterViewInit(): void;
    };
    const syncEmbedsSpy = vi.spyOn(component, 'syncEmbeds').mockResolvedValue(undefined);

    component.ngAfterViewInit();
    component.syncRunId += 1;
    await Promise.resolve();

    expect(syncEmbedsSpy).not.toHaveBeenCalled();
  });

  it('creates embeds for the initial stream list', async () => {
    state.setActiveList({ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] });
    await syncComponent();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).toHaveBeenCalledTimes(2);
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(1, {
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: 'auto',
      showChat: false,
      muted: false,
    });
    expect(twitch.createEmbed).toHaveBeenNthCalledWith(2, {
      elementId: 'twitch-embed-rocketbeanstv',
      channel: 'rocketbeanstv',
      quality: 'auto',
      showChat: false,
      muted: true,
    });
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
    expect(twitch.createEmbed).toHaveBeenCalledWith({
      elementId: 'twitch-embed-rocketbeanstv',
      channel: 'rocketbeanstv',
      quality: 'auto',
      showChat: false,
      muted: true,
    });
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

  it('recreates affected embeds on reorder and destroys all handles on component teardown', async () => {
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
    expect(twitch.createEmbed).toHaveBeenCalledWith({
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: '720p60',
      showChat: true,
      muted: false,
    });
  });

  it('updates the viewport signals on resize', () => {
    const component = fixture.componentInstance;

    window.innerWidth = 1440;
    window.innerHeight = 900;

    component.onResize();

    expect(component.viewportWidth()).toBe(1440);
    expect(component.viewportHeight()).toBe(900);
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  async function syncComponent(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }
});

class MockStreamStateService {
  readonly activeListId = signal<number | null>(null);
  readonly activeList = computed<StreamList | null>(() => this._activeList());
  readonly listCount = computed(() => this._activeList() ? 1 : 0);
  readonly streams = computed(() => this._activeList()?.streams ?? []);
  readonly quality = signal<StreamQuality>('auto');
  private readonly _activeList = signal<StreamList | null>(null);

  setActiveList(list: StreamList | null): void {
    this._activeList.set(list);
    this.activeListId.set(list?.id ?? null);
  }
}

class MockTwitchEmbedService {
  readonly loadScript = vi.fn(async () => undefined);
  readonly handles = new Map<string, MockTwitchEmbedHandle>();
  readonly createEmbed = vi.fn((options: { elementId: string }) => {
    const handle = new MockTwitchEmbedHandle();
    this.handles.set(options.elementId, handle);
    return handle;
  });
}

class MockTwitchEmbedHandle implements TwitchEmbedHandle {
  readonly destroy = vi.fn();
}

class MockToastService {
  readonly show = vi.fn();
}