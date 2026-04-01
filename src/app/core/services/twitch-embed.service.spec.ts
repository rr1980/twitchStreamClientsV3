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

  it('fails when the script loads without exposing Twitch.Embed', async () => {
    const attempt = service.loadScript();
    const script = document.head.querySelector('script[data-twitch-embed="true"]') as HTMLScriptElement;

    script.dispatchEvent(new Event('load'));

    await expect(attempt).rejects.toThrow('Twitch embed script loaded without exposing Twitch.Embed.');
    expect(document.head.querySelector('script[data-twitch-embed="true"]')).toBeNull();
  });
});