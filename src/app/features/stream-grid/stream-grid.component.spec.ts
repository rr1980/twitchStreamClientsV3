import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedHandle, TwitchEmbedService } from '../../core/services/twitch-embed.service';
import { StreamGridComponent } from './stream-grid.component';

describe('StreamGridComponent', () => {
  let fixture: ComponentFixture<StreamGridComponent>;
  let state: MockStreamStateService;
  let twitch: MockTwitchEmbedService;

  beforeEach(async () => {
    state = new MockStreamStateService();
    twitch = new MockTwitchEmbedService();

    await TestBed.configureTestingModule({
      imports: [StreamGridComponent],
      providers: [
        { provide: StreamStateService, useValue: state },
        { provide: TwitchEmbedService, useValue: twitch },
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
      syncEmbeds(streams: string[], quality: StreamQuality, showChat: boolean): Promise<void>;
    }).syncEmbeds(['shroud'], 'auto', false)).resolves.toBeUndefined();

    expect(twitch.loadScript).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('creates embeds for the initial stream list', async () => {
    state.streams.set(['shroud', 'rocketbeanstv']);
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
    state.streams.set(['shroud']);
    await syncComponent();

    twitch.createEmbed.mockClear();
    twitch.handles.get('twitch-embed-shroud')?.destroy.mockClear();

    state.streams.set(['shroud', 'rocketbeanstv']);
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
    state.streams.set(['shroud', 'rocketbeanstv']);
    await syncComponent();

    twitch.createEmbed.mockClear();
    const removedHandle = twitch.handles.get('twitch-embed-rocketbeanstv');
    removedHandle?.destroy.mockClear();

    state.streams.set(['shroud']);
    await syncComponent();

    expect(removedHandle?.destroy).toHaveBeenCalledTimes(1);
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('recreates affected embeds on reorder and destroys all handles on component teardown', async () => {
    state.streams.set(['shroud', 'rocketbeanstv']);
    await syncComponent();

    const firstHandle = twitch.handles.get('twitch-embed-shroud');
    const secondHandle = twitch.handles.get('twitch-embed-rocketbeanstv');
    firstHandle?.destroy.mockClear();
    secondHandle?.destroy.mockClear();
    twitch.createEmbed.mockClear();

    state.streams.set(['rocketbeanstv', 'shroud']);
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
    state.streams.set(['shroud']);
    await syncComponent();

    fixture.nativeElement.querySelector('#twitch-embed-shroud')?.remove();
    twitch.createEmbed.mockClear();

    state.quality.set('720p60');
    await syncComponent();

    expect(twitch.loadScript).toHaveBeenCalled();
    expect(twitch.createEmbed).not.toHaveBeenCalled();
  });

  it('recreates embeds when quality or chat layout changes', async () => {
    state.streams.set(['shroud']);
    await syncComponent();

    const initialHandle = twitch.handles.get('twitch-embed-shroud');
    initialHandle?.destroy.mockClear();
    twitch.createEmbed.mockClear();

    state.quality.set('720p60');
    state.showChat.set(true);
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

  async function syncComponent(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }
});

class MockStreamStateService {
  readonly streams = signal<string[]>([]);
  readonly quality = signal<StreamQuality>('auto');
  readonly showChat = signal(false);
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