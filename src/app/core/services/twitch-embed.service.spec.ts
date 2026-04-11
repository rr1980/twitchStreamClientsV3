import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TwitchEmbedService } from './twitch-embed.service';

describe('TwitchEmbedService', () => {
  let service: TwitchEmbedService;

  beforeEach(() => {
    document.head?.querySelectorAll('script[data-twitch-embed="true"]').forEach(script => script.remove());
    delete window.Twitch;

    TestBed.configureTestingModule({});
    service = TestBed.inject(TwitchEmbedService);
  });

  function setWindowTwitchEmbed(embed: ReturnType<typeof vi.fn>): void {
    const twitchApi = {} as NonNullable<Window['Twitch']>;
    twitchApi.Embed = embed as never;
    window.Twitch = twitchApi;
  }

  function setWindowTwitchEmbedWithReadyEvent(embed: ReturnType<typeof vi.fn>, readyEvent = 'VIDEO_READY_EVENT'): void {
    const twitchApi = {} as NonNullable<Window['Twitch']>;
    const embedConstructor = embed as ReturnType<typeof vi.fn> & Record<string, string | undefined>;
    embedConstructor['VIDEO_PLAY'] = 'VIDEO_PLAY_EVENT';
    embedConstructor['VIDEO_READY'] = readyEvent;
    twitchApi.Embed = embedConstructor as never;
    window.Twitch = twitchApi;
  }

  function getServiceMethod<T extends (...args: never[]) => unknown>(propertyName: string): T {
    return ((service as unknown as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(service) as T;
  }

  function setServiceMember<T>(propertyName: string, value: T): void {
    (service as unknown as Record<string, unknown>)[propertyName] = value;
  }

  it('reuses the already loaded Twitch API', async () => {
    setWindowTwitchEmbed(vi.fn());

    await expect(service.loadScript()).resolves.toBeUndefined();
    expect(document.head.querySelector('script[data-twitch-embed="true"]')).toBeNull();
  });

  it('short-circuits script loading on the server platform', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const serverService = TestBed.inject(TwitchEmbedService);

    await expect(serverService.loadScript()).resolves.toBeUndefined();
    expect(document.head.querySelector('script[data-twitch-embed="true"]')).toBeNull();
  });

  it('reuses the pending script promise while the script is still loading', () => {
    const firstAttempt = service.loadScript();
    const secondAttempt = service.loadScript();

    expect(secondAttempt).toBe(firstAttempt);
  });

  it('retries loading after a failed script request', async () => {
    const firstAttempt = service.loadScript();
    const firstScript = document.head.querySelector('script[data-twitch-embed="true"]') as HTMLScriptElement;

    firstScript.dispatchEvent(new Event('error'));
    await expect(firstAttempt).rejects.toThrow('Twitch embed script failed.');
    expect(document.head.querySelector('script[data-twitch-embed="true"]')).toBeNull();

    const secondAttempt = service.loadScript();
    const secondScript = document.head.querySelector('script[data-twitch-embed="true"]') as HTMLScriptElement;

    expect(secondScript).not.toBe(firstScript);

    setWindowTwitchEmbed(vi.fn());

    secondScript.dispatchEvent(new Event('load'));
    await expect(secondAttempt).resolves.toBeUndefined();
  });

  it('attaches to an existing loading script instead of creating a second one', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);

    const attempt = service.loadScript();

    setWindowTwitchEmbed(vi.fn());

    existingScript.dispatchEvent(new Event('load'));

    await expect(attempt).resolves.toBeUndefined();
    expect(document.head.querySelectorAll('script[data-twitch-embed="true"]')).toHaveLength(1);
  });

  it('resolves immediately when Twitch is available and an old script tag already exists', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);
    setWindowTwitchEmbed(vi.fn());

    await expect(service.loadScript()).resolves.toBeUndefined();
    expect(document.head.querySelectorAll('script[data-twitch-embed="true"]')).toHaveLength(1);
  });

  it('fails when the script loads without exposing Twitch.Embed', async () => {
    const attempt = service.loadScript();
    const script = document.head.querySelector('script[data-twitch-embed="true"]') as HTMLScriptElement;

    script.dispatchEvent(new Event('load'));

    await expect(attempt).rejects.toThrow('Twitch embed script loaded without exposing Twitch.Embed.');
    expect(document.head.querySelector('script[data-twitch-embed="true"]')).toBeNull();
  });

  it('replaces an existing failed script tag before retrying', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    existingScript.dataset['loadState'] = 'error';
    document.head.appendChild(existingScript);

    const attempt = service.loadScript();
    const replacementScript = document.head.querySelector('script[data-twitch-embed="true"]') as HTMLScriptElement;

    expect(replacementScript).not.toBe(existingScript);
    expect(document.head.contains(existingScript)).toBe(false);

    setWindowTwitchEmbed(vi.fn());

    replacementScript.dispatchEvent(new Event('load'));

    await expect(attempt).resolves.toBeUndefined();
  });

  it('resolves from createScriptPromise when a script tag exists and Twitch is already available', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);
    setWindowTwitchEmbed(vi.fn());

    await expect((service as unknown as Record<string, () => Promise<void>>)['_createScriptPromise']()).resolves.toBeUndefined();
  });

  it('resolves createScriptPromise immediately when no browser window is available', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const serverService = TestBed.inject(TwitchEmbedService);
    const createScriptPromise = ((serverService as unknown as Record<string, unknown>)['_createScriptPromise'] as () => Promise<void>)
      .bind(serverService);

    await expect(createScriptPromise()).resolves.toBeUndefined();
  });

  it('fails cleanly when the document head is unavailable during script creation', async () => {
    const headSpy = vi.spyOn(document, 'head', 'get').mockReturnValue(null as never);

    try {
      await expect(service.loadScript()).rejects.toThrow('Document head is unavailable.');
    } finally {
      headSpy.mockRestore();
    }
  });

  it('returns a destroyable handle for created embeds', () => {
    const addEventListener = vi.fn();
    const getPlayer = vi.fn(() => ({
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    }));
    const EmbedMock = vi.fn(function MockEmbed() {
      return { addEventListener, getPlayer };
    });

    setWindowTwitchEmbed(EmbedMock);

    const host = document.createElement('div');
    host.id = 'twitch-embed-shroud';
    host.appendChild(document.createElement('div'));
    document.body.appendChild(host);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-shroud',
      channel: 'shroud',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    expect(typeof handle.destroy).toBe('function');
    expect(typeof handle.setMuted).toBe('function');

    handle.destroy();

    expect(host.childElementCount).toBe(0);

    host.remove();
  });

  it('starts embeds muted so browser autoplay is allowed', async () => {
    let muted = false;
    let volume = 0.5;
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
      setQuality: vi.fn(),
    };
    const readyEvent = 'VIDEO_READY_EVENT';
    let readyCallback: (() => void) | undefined;
    let playCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }

          if (event === 'VIDEO_PLAY_EVENT') {
            playCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    service.createEmbed({
      elementId: 'twitch-embed-autoplay',
      channel: 'autoplay',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    expect(EmbedMock).toHaveBeenCalledWith('twitch-embed-autoplay', expect.objectContaining({
      autoplay: true,
      muted: true,
    }));

    readyCallback?.();
    await Promise.resolve();

    expect(player.setMuted).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();

    playCallback?.();
    await Promise.resolve();

    expect(player.setMuted).toHaveBeenCalledWith(false);
    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it('returns a no-op handle when Twitch is unavailable', () => {
    const host = document.createElement('div');
    host.id = 'twitch-embed-missing';
    host.appendChild(document.createElement('div'));
    document.body.appendChild(host);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-missing',
      channel: 'missing',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    handle.setMuted(true);
    handle.destroy();
    handle.destroy();

    expect(host.childElementCount).toBe(0);

    host.remove();
  });

  it('reports available qualities when the embed becomes ready', async () => {
    const onAvailableQualities = vi.fn();
    const player = {
      getQualities: vi.fn(() => [
        { name: 'chunked', label: '1080p60 (Quelle)' },
        { name: '1080p60' },
        { name: '' },
        'audio_only',
      ]),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({
      elementId: 'twitch-embed-reported-qualities',
      channel: 'reported-qualities',
      quality: '720p60',
      showChat: false,
      muted: false,
      onAvailableQualities,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(onAvailableQualities).toHaveBeenCalledWith([
      { value: 'chunked', label: '1080p60 (Quelle)' },
      { value: '1080p60', label: '1080p60' },
      { value: 'audio_only', label: 'Nur Audio' },
    ]);
  });

  it('syncs the requested muted state through the player API when the embed is ready', async () => {
    let muted = false;
    let volume = 0.5;
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const readyEvent = 'VIDEO_READY_EVENT';
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    service.createEmbed({
      elementId: 'twitch-embed-muted',
      channel: 'muted',
      quality: 'auto',
      showChat: false,
      muted: true,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(player.setMuted).toHaveBeenCalledWith(true);
    expect(player.setVolume).toHaveBeenCalledWith(0);
  });

  it('applies queued mute changes once the player becomes ready', async () => {
    let muted = false;
    let volume = 0.5;
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const readyEvent = 'VIDEO_READY_EVENT';
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-queued-muted',
      channel: 'queued-muted',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    handle.setMuted(true);
    readyCallback?.();
    await Promise.resolve();

    expect(player.setMuted).toHaveBeenCalledWith(true);
    expect(player.setVolume).toHaveBeenCalledWith(0);
  });

  it('updates the player mute state directly after the embed is ready', async () => {
    let muted = false;
    let volume = 0.5;
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const readyEvent = 'VIDEO_READY_EVENT';
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-direct-muted',
      channel: 'direct-muted',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();
    player.setMuted.mockClear();
    player.setVolume.mockClear();

    handle.setMuted(true);

    expect(player.setMuted).toHaveBeenCalledWith(true);
    expect(player.setVolume).toHaveBeenCalledWith(0);
  });

  it('restores the previous volume when a muted player is unmuted again', async () => {
    let muted = true;
    let volume = 0;
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const readyEvent = 'VIDEO_READY_EVENT';
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-restored-volume',
      channel: 'restored-volume',
      quality: 'auto',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();
    handle.setMuted(true);
    await Promise.resolve();
    player.setMuted.mockClear();
    player.setVolume.mockClear();

    handle.setMuted(false);

    expect(player.setMuted).toHaveBeenCalledWith(false);
    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it('reapplies the muted state even when the player already reports the same value', async () => {
    const syncRequestedMutedState = getServiceMethod<(
      player: {
        setMuted?: (value: boolean) => void;
        getMuted?: () => boolean;
        setVolume?: (value: number) => void;
        getVolume?: () => number;
      },
      getRequestedMuted: () => boolean,
      getRestoredVolume: () => number,
      setRestoredVolume: (value: number) => void,
      isCancelled: () => boolean,
    ) => Promise<void>>(
      '_syncRequestedMutedState',
    );
    let muted = true;
    let volume = 0;
    const player = {
      getMuted: vi.fn(() => muted),
      getVolume: vi.fn(() => volume),
      setMuted: vi.fn((value: boolean) => {
        muted = value;
      }),
      setVolume: vi.fn((value: number) => {
        volume = value;
      }),
    };

    await syncRequestedMutedState(player, () => true, () => 0.5, () => undefined, () => false);

    expect(player.setMuted).toHaveBeenCalledWith(true);
    expect(player.setVolume).toHaveBeenCalledWith(0);
  });

  it('stops mute syncing immediately when the run is already cancelled', async () => {
    const syncRequestedMutedState = getServiceMethod<(
      player: { setMuted?: (value: boolean) => void; getMuted?: () => boolean },
      getRequestedMuted: () => boolean,
      getRestoredVolume: () => number,
      setRestoredVolume: (value: number) => void,
      isCancelled: () => boolean,
    ) => Promise<void>>(
      '_syncRequestedMutedState',
    );
    const player = {
      getMuted: vi.fn(() => false),
      setMuted: vi.fn(),
    };

    await syncRequestedMutedState(player, () => true, () => 0.5, () => undefined, () => true);

    expect(player.setMuted).not.toHaveBeenCalled();
  });

  it('skips mute syncing when the player does not expose setMuted', async () => {
    const syncRequestedMutedState = getServiceMethod<(
      player: { getMuted?: () => boolean; setVolume?: (value: number) => void; getVolume?: () => number },
      getRequestedMuted: () => boolean,
      getRestoredVolume: () => number,
      setRestoredVolume: (value: number) => void,
      isCancelled: () => boolean,
    ) => Promise<void>>(
      '_syncRequestedMutedState',
    );
    const player = {
      getMuted: vi.fn(() => false),
      getVolume: vi.fn(() => 0.5),
      setVolume: vi.fn(),
    };

    await expect(syncRequestedMutedState(player, () => true, () => 0.5, () => undefined, () => false)).resolves.toBeUndefined();
    expect(player.setVolume).not.toHaveBeenCalled();
  });

  it('normalizes Twitch quality descriptors from labels and prefers the richest source label', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const readAvailableQualities = getServiceMethod<(player: { getQualities(): unknown[] }) => { value: string; label: string }[]>('_readAvailableQualities');

    try {
      expect(readAvailableQualities({
        getQualities: () => [
          'chunked',
          { name: 'chunked', label: '1080p60 (Source)' },
          { label: '720p60' },
          { quality: 'audio_only', label: 'Audio Only' },
          { title: 'unsupported' },
        ],
      })).toEqual([
        { value: 'chunked', label: '1080p60 (Quelle)' },
        { value: '720p60', label: '720p60' },
        { value: 'audio_only', label: 'Nur Audio' },
      ]);

      expect(infoSpy).toHaveBeenCalledWith('[Twitch] Raw quality descriptors:', expect.any(Array));
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('maps source-style labels and localized quality labels correctly', () => {
    const mapRequestedQuality = getServiceMethod<(value: string) => string | null>('_mapRequestedQuality');
    const normalizeQualityDescriptor = getServiceMethod<(descriptor: unknown) => { value: string; label: string } | null>('_normalizeQualityDescriptor');

    expect(mapRequestedQuality('1080p60 (Quelle)')).toBe('chunked');
    expect(normalizeQualityDescriptor({ name: 'chunked', label: 'Source' })).toEqual({ value: 'chunked', label: 'Quelle' });
    expect(normalizeQualityDescriptor({ name: 'chunked', label: '1080p60' })).toEqual({ value: 'chunked', label: '1080p60 (Quelle)' });
    expect(normalizeQualityDescriptor({ value: 'audio_only', label: 'Audio Only' })).toEqual({ value: 'audio_only', label: 'Nur Audio' });
    expect(normalizeQualityDescriptor({ title: 'unsupported' })).toBeNull();
  });

  it('sets the requested quality when it becomes available on ready', async () => {
    const player = {
      getQualities: vi.fn()
        .mockReturnValueOnce([])
        .mockReturnValueOnce(['720p60'])
        .mockReturnValue(['720p60']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({
      elementId: 'twitch-embed-quality',
      channel: 'quality',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(player.setQuality).toHaveBeenCalledWith('720p60');

    rafSpy.mockRestore();
  });

  it('supports 480p and chunked quality mappings', async () => {
    const createReadyHarness = (): {
      player: {
        getQualities: ReturnType<typeof vi.fn>;
        getQuality: ReturnType<typeof vi.fn>;
        setQuality: ReturnType<typeof vi.fn>;
      };
      triggerReady: () => void;
    } => {
      const player = {
        getQualities: vi.fn(() => ['480p', 'chunked']),
        getQuality: vi.fn(() => 'auto'),
        setQuality: vi.fn(),
      };
      let readyCallback: (() => void) | undefined;
      const EmbedMock = vi.fn(function MockEmbed() {
        return {
          addEventListener: vi.fn((event: string, callback: () => void) => {
            if (event === 'video.ready') {
              readyCallback = callback;
            }
          }),
          getPlayer: vi.fn(() => player),
        };
      });

      setWindowTwitchEmbed(EmbedMock);

      return { player, triggerReady: () => readyCallback?.() };
    };

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });

    const first = createReadyHarness();
    service.createEmbed({ elementId: 'q480', channel: 'c1', quality: '480p', showChat: false, muted: false });
    first.triggerReady();
    await Promise.resolve();

    const second = createReadyHarness();
    service.createEmbed({ elementId: 'qchunked', channel: 'c2', quality: 'chunked', showChat: false, muted: false });
    second.triggerReady();
    await Promise.resolve();

    expect(first.player.setQuality).toHaveBeenCalledWith('480p');
    expect(second.player.setQuality).toHaveBeenCalledWith('chunked');

    rafSpy.mockRestore();
  });

  it('falls back from 720p60 to another 720p variant when needed', async () => {
    const player = {
      getQualities: vi.fn(() => ['720p', '480p']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const readyEvent = 'VIDEO_READY_EVENT';
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === readyEvent) {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbedWithReadyEvent(EmbedMock, readyEvent);

    service.createEmbed({
      elementId: 'fallback-720',
      channel: 'fallback-720',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(player.setQuality).toHaveBeenCalledWith('720p');
  });

  it('falls back to another variant in the same quality family', async () => {
    const player = {
      getQualities: vi.fn(() => ['480p30', '360p']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({
      elementId: 'fallback-480',
      channel: 'fallback-480',
      quality: '480p',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(player.setQuality).toHaveBeenCalledWith('480p30');
  });

  it('skips quality changes for auto mode and unsupported quality values', async () => {
    const player = {
      getQualities: vi.fn(() => ['chunked']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({ elementId: 'auto', channel: 'auto', quality: 'auto', showChat: false, muted: false });
    readyCallback?.();
    await Promise.resolve();

    service.createEmbed({ elementId: 'invalid', channel: 'invalid', quality: 'not-real' as never, showChat: false, muted: false });
    readyCallback?.();
    await Promise.resolve();

    expect(player.setQuality).not.toHaveBeenCalled();
  });

  it('keeps polling qualities in auto mode until Twitch reports them', async () => {
    const onAvailableQualities = vi.fn();
    const player = {
      getQualities: vi.fn()
        .mockReturnValueOnce([])
        .mockReturnValueOnce(['1080p60', 'chunked'])
        .mockReturnValue(['1080p60', 'chunked']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({
      elementId: 'auto-reported-qualities',
      channel: 'auto-reported-qualities',
      quality: 'auto',
      showChat: false,
      muted: false,
      onAvailableQualities,
    });

    readyCallback?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onAvailableQualities).toHaveBeenLastCalledWith([
      { value: 'chunked', label: 'Quelle' },
      { value: '1080p60', label: '1080p60' },
    ]);
    expect(player.setQuality).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it('stops quality syncing when the embed is destroyed before ready completes', async () => {
    const player = {
      getQualities: vi.fn(() => ['720p60']),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbed(EmbedMock);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-destroyed',
      channel: 'destroyed',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    handle.destroy();
    readyCallback?.();
    await Promise.resolve();

    expect(player.setQuality).not.toHaveBeenCalled();
  });

  it('stops quality syncing when the embed is destroyed between animation frames', async () => {
    const player = {
      getQualities: vi.fn(() => []),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const rafCallbacks: FrameRequestCallback[] = [];
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });

    setWindowTwitchEmbed(EmbedMock);

    const handle = service.createEmbed({
      elementId: 'twitch-embed-frame-destroyed',
      channel: 'frame-destroyed',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(rafCallbacks.length).toBeGreaterThanOrEqual(1);

    handle.destroy();

    while (rafCallbacks.length > 0) {
      rafCallbacks.shift()?.(0);
      await Promise.resolve();
    }

    expect(player.setQuality).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });

  it('warns when the requested quality never becomes available', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const player = {
      getQualities: vi.fn(() => ['480p']),
      getQuality: vi.fn(() => '480p'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });

    setWindowTwitchEmbed(EmbedMock);

    (service as unknown as Record<string, number>)['_maxQualitySyncFrames'] = 2;

    service.createEmbed({
      elementId: 'twitch-embed-unavailable',
      channel: 'missing-quality',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      "[Twitch] Quality '720p60' für Channel 'missing-quality' nicht verfügbar.",
      ['480p'],
    );

    rafSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('warns when quality inspection throws unexpectedly', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const player = {
      getQualities: vi.fn(() => {
        throw new Error('boom');
      }),
      getQuality: vi.fn(() => 'auto'),
      setQuality: vi.fn(),
    };
    let readyCallback: (() => void) | undefined;
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'video.ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    setWindowTwitchEmbed(EmbedMock);

    service.createEmbed({
      elementId: 'throwing-quality',
      channel: 'throwing-quality',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('[Twitch] Quality Set Error:', expect.any(Error));

    warnSpy.mockRestore();
  });

  it('falls back to setTimeout when requestAnimationFrame is unavailable', async () => {
    const waitForNextFrame = getServiceMethod<() => Promise<void>>('_waitForNextFrame');
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const originalDocument = (service as unknown as Record<string, unknown>)['_document'];

    try {
      setServiceMember('_document', { defaultView: {} } as Document);

      await waitForNextFrame();

      expect(timeoutSpy).toHaveBeenCalled();
    } finally {
      setServiceMember('_document', originalDocument);
      timeoutSpy.mockRestore();
    }
  });

  it('returns null when a requested quality has no family match', () => {
    const resolveRequestedQuality = getServiceMethod<(requestedQuality: string, availableQualities: string[]) => string | null>('_resolveRequestedQuality');

    expect(resolveRequestedQuality('audio_only', ['chunked', '480p'])).toBeNull();
    expect(resolveRequestedQuality('720p60', ['480p', '360p'])).toBeNull();
  });

  it('scores and ranks quality candidates by actual frame rate', () => {
    const getQualityMatchScore = getServiceMethod<(
      candidate: string,
      requestedQuality: string,
      qualityFamily: string,
    ) => number>('_getQualityMatchScore');
    const rankQualityMatches = getServiceMethod<(
      requestedQuality: string,
      qualityFamily: string,
      matches: string[],
    ) => string[]>('_rankQualityMatches');

    expect(getQualityMatchScore('720p60', '720p60', '720p')).toBe(0);
    expect(getQualityMatchScore('720p', '720p60', '720p')).toBe(1);
    expect(getQualityMatchScore('720p30-60', '720p60', '720p')).toBe(2);
    expect(getQualityMatchScore('720p30', '720p60', '720p')).toBe(3);
    expect(getQualityMatchScore('360p30', '360p60', '360p')).toBe(3);
    expect(rankQualityMatches('720p60', '720p', ['720p30', '720p', '720p30-60', '720p60'])).toEqual([
      '720p60',
      '720p',
      '720p30-60',
      '720p30',
    ]);
    expect(rankQualityMatches('360p60', '360p', ['360p30', '360p', '360p30-60'])).toEqual([
      '360p',
      '360p30-60',
      '360p30',
    ]);
  });
});
