import { TestBed } from '@angular/core/testing';
import type { VersionEvent } from '@angular/service-worker';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
