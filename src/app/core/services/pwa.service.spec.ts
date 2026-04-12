import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { VersionEvent } from '@angular/service-worker';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }

    delete (window.navigator as Navigator & { standalone?: boolean }).standalone;
  });

  it('shows the startup hint once and persists dismissal', () => {
    const service = createService();

    expect(service.startupHintVisible()).toBe(true);

    service.dismissStartupHint();

    expect(service.startupHintVisible()).toBe(false);
    expect(localStorage.getItem('pwa_startup_hint_seen_v1')).toBe('true');
  });

  it('captures install prompts and clears them after installation', async () => {
    const service = createService();
    const prompt = vi.fn(async () => undefined);
    const installEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
    };

    installEvent.prompt = prompt;
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    window.dispatchEvent(installEvent);

    expect(service.canInstall()).toBe(true);

    await service.install();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(service.canInstall()).toBe(false);
    expect(service.startupHintVisible()).toBe(false);
  });

  it('publishes update availability from the Angular service worker', () => {
    const updates = new Subject<VersionEvent>();
    const service = createService({
      isEnabled: true,
      versionUpdates: updates.asObservable(),
    } satisfies Pick<SwUpdate, 'isEnabled' | 'versionUpdates'>);

    updates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });

    expect(service.updateAvailable()).toBe(true);

    service.dismissUpdateNotice();

    expect(service.updateAvailable()).toBe(false);
    updates.complete();
  });

  it('hides the startup hint when the app already runs in iOS standalone mode', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: true,
    });

    const service = createService();

    expect(service.startupHintVisible()).toBe(false);
  });

  it('clears the install prompt when the browser rejects it', async () => {
    const service = createService();
    const installEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'dismissed'; platform: string }>;
    };

    installEvent.prompt = vi.fn(async () => { throw new Error('user gesture required'); });
    installEvent.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });

    window.dispatchEvent(installEvent);

    expect(service.canInstall()).toBe(true);

    await service.install();

    expect(service.canInstall()).toBe(false);
    expect(service.startupHintVisible()).toBe(true);
  });

  it('does nothing when install is called without a prompt event', async () => {
    const service = createService();

    expect(service.canInstall()).toBe(false);

    await expect(service.install()).resolves.toBeUndefined();
  });

  it('reloadForUpdate calls window.location.reload', () => {
    const service = createService();
    const reloadSpy = vi.fn();
    const originalLocation = window.location;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    service.reloadForUpdate();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('clears the install prompt when appinstalled is dispatched', () => {
    const service = createService();
    const installEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted'; platform: string }>;
    };

    installEvent.prompt = vi.fn(async () => undefined);
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    window.dispatchEvent(installEvent);
    expect(service.canInstall()).toBe(true);

    window.dispatchEvent(new Event('appinstalled'));
    expect(service.canInstall()).toBe(false);
    expect(service.startupHintVisible()).toBe(false);
  });

  it('hides the startup hint when matchMedia reports standalone mode', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;

    const service = createService();

    expect(service.startupHintVisible()).toBe(false);
  });

  it('keeps the startup hint hidden after it was previously dismissed', () => {
    localStorage.setItem('pwa_startup_hint_seen_v1', 'true');

    const service = createService();

    expect(service.startupHintVisible()).toBe(false);
  });

  it('returns safely on the server platform without registering any events', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: new Subject<VersionEvent>().asObservable() } },
      ],
    });

    const service = TestBed.inject(PwaService);

    expect(service.startupHintVisible()).toBe(false);
    expect(service.canInstall()).toBe(false);
    expect(service.updateAvailable()).toBe(false);

    service.reloadForUpdate();
  });

  /**
   * Creates a fresh PWA service with an optional mocked service worker update source.
   *
   * @param {Pick<SwUpdate, 'isEnabled' | 'versionUpdates'>} [swUpdateOverride] Test double for Angular service worker update access.
   * @returns {PwaService} Fresh service instance created from the TestBed.
   * @remarks The TestBed is reset before each creation so providers do not leak between tests.
   */
  function createService(
    swUpdateOverride: Pick<SwUpdate, 'isEnabled' | 'versionUpdates'> = {
      isEnabled: true,
      versionUpdates: new Subject<VersionEvent>().asObservable(),
    },
  ): PwaService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdateOverride },
      ],
    });

    return TestBed.inject(PwaService);
  }
});
