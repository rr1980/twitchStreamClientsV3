import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TwitchEmbedService } from './twitch-embed.service';

describe('TwitchEmbedService', () => {
  let service: TwitchEmbedService;

  beforeEach(() => {
    document.head.querySelectorAll('script[data-twitch-embed="true"]').forEach(script => script.remove());
    delete window.Twitch;

    TestBed.configureTestingModule({});
    service = TestBed.inject(TwitchEmbedService);
  });

  it('reuses the already loaded Twitch API', async () => {
    window.Twitch = {
      Embed: vi.fn() as never,
    };

    await expect(service.loadScript()).resolves.toBeUndefined();
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

    window.Twitch = {
      Embed: vi.fn() as never,
    };

    secondScript.dispatchEvent(new Event('load'));
    await expect(secondAttempt).resolves.toBeUndefined();
  });

  it('attaches to an existing loading script instead of creating a second one', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);

    const attempt = service.loadScript();

    window.Twitch = {
      Embed: vi.fn() as never,
    };

    existingScript.dispatchEvent(new Event('load'));

    await expect(attempt).resolves.toBeUndefined();
    expect(document.head.querySelectorAll('script[data-twitch-embed="true"]')).toHaveLength(1);
  });

  it('resolves immediately when Twitch is available and an old script tag already exists', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);
    window.Twitch = {
      Embed: vi.fn() as never,
    };

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

    window.Twitch = {
      Embed: vi.fn() as never,
    };

    replacementScript.dispatchEvent(new Event('load'));

    await expect(attempt).resolves.toBeUndefined();
  });

  it('resolves from createScriptPromise when a script tag exists and Twitch is already available', async () => {
    const existingScript = document.createElement('script');
    existingScript.dataset['twitchEmbed'] = 'true';
    document.head.appendChild(existingScript);
    window.Twitch = {
      Embed: vi.fn() as never,
    };

    await expect((service as unknown as {
      createScriptPromise(): Promise<void>;
    }).createScriptPromise()).resolves.toBeUndefined();
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

    window.Twitch = {
      Embed: EmbedMock as never,
    };

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

    handle.destroy();

    expect(host.childElementCount).toBe(0);

    host.remove();
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

    handle.destroy();
    handle.destroy();

    expect(host.childElementCount).toBe(0);

    host.remove();
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
          if (event === 'ready') {
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

    window.Twitch = {
      Embed: EmbedMock as never,
    };

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
    const createReadyHarness = () => {
      const player = {
        getQualities: vi.fn(() => ['480p', 'chunked']),
        getQuality: vi.fn(() => 'auto'),
        setQuality: vi.fn(),
      };
      let readyCallback: (() => void) | undefined;
      const EmbedMock = vi.fn(function MockEmbed() {
        return {
          addEventListener: vi.fn((event: string, callback: () => void) => {
            if (event === 'ready') {
              readyCallback = callback;
            }
          }),
          getPlayer: vi.fn(() => player),
        };
      });

      window.Twitch = { Embed: EmbedMock as never };

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
    const EmbedMock = vi.fn(function MockEmbed() {
      return {
        addEventListener: vi.fn((event: string, callback: () => void) => {
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    window.Twitch = { Embed: EmbedMock as never };

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
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    window.Twitch = { Embed: EmbedMock as never };

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
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    window.Twitch = { Embed: EmbedMock as never };

    service.createEmbed({ elementId: 'auto', channel: 'auto', quality: 'auto', showChat: false, muted: false });
    readyCallback?.();
    await Promise.resolve();

    service.createEmbed({ elementId: 'invalid', channel: 'invalid', quality: 'not-real' as never, showChat: false, muted: false });
    readyCallback?.();
    await Promise.resolve();

    expect(player.setQuality).not.toHaveBeenCalled();
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
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    window.Twitch = {
      Embed: EmbedMock as never,
    };

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
          if (event === 'ready') {
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

    window.Twitch = {
      Embed: EmbedMock as never,
    };

    const handle = service.createEmbed({
      elementId: 'twitch-embed-frame-destroyed',
      channel: 'frame-destroyed',
      quality: '720p60',
      showChat: false,
      muted: false,
    });

    readyCallback?.();
    await Promise.resolve();

    expect(rafCallbacks).toHaveLength(1);

    handle.destroy();
    rafCallbacks.shift()?.(0);
    await Promise.resolve();

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
          if (event === 'ready') {
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

    window.Twitch = {
      Embed: EmbedMock as never,
    };

    (service as unknown as { maxQualitySyncFrames: number }).maxQualitySyncFrames = 2;

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
          if (event === 'ready') {
            readyCallback = callback;
          }
        }),
        getPlayer: vi.fn(() => player),
      };
    });

    window.Twitch = { Embed: EmbedMock as never };

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
});