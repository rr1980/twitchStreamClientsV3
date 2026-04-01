import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { TwitchEmbedService } from '../../core/services/twitch-embed.service';
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
    twitch.clearEmbed.mockClear();

    state.streams.set(['shroud', 'rocketbeanstv']);
    await syncComponent();

    expect(twitch.clearEmbed).toHaveBeenCalledWith('twitch-embed-rocketbeanstv');
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
    twitch.clearEmbed.mockClear();

    state.streams.set(['shroud']);
    await syncComponent();

    expect(twitch.clearEmbed).toHaveBeenCalledWith('twitch-embed-rocketbeanstv');
    expect(twitch.createEmbed).not.toHaveBeenCalled();
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
  readonly createEmbed = vi.fn();
  readonly clearEmbed = vi.fn();
}