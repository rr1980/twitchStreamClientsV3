import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withHashLocation } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { appRoutes } from './app.config';
import { HotkeyService } from './core/services/hotkey.service';
import { PwaService } from './core/services/pwa.service';
import { StreamStateService } from './core/services/stream-state.service';

describe('App', () => {
  let router: Router;

  function getAppMethod<T extends (...args: never[]) => unknown>(instance: object, propertyName: string): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  beforeEach(async () => {
    document.title = 'Test';
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(appRoutes, withHashLocation())],
    }).compileComponents();

    router = TestBed.inject(Router);
    await router.navigateByUrl('/List/null');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Dein Setup ist leer');
    expect(compiled.querySelector('.menu-trigger')).toBeNull();
  });

  it('delegates window keydown handling to the hotkey service', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const hotkeys = TestBed.inject(HotkeyService);
    const spy = vi.spyOn(hotkeys, 'handleWindowKeydown');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    getAppMethod<(event: KeyboardEvent) => void>(app, '_onWindowKeydown')(event);

    expect(spy).toHaveBeenCalledWith(event, document.activeElement);
  });

  it('prevents the default key behavior when a hotkey was handled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const hotkeys = TestBed.inject(HotkeyService);
    const event = new KeyboardEvent('keydown', { key: 'm' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    vi.spyOn(hotkeys, 'handleWindowKeydown').mockReturnValue(true);

    getAppMethod<(event: KeyboardEvent) => void>(app, '_onWindowKeydown')(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the default key behavior alone when no hotkey was handled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const hotkeys = TestBed.inject(HotkeyService);
    const event = new KeyboardEvent('keydown', { key: 'x' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    vi.spyOn(hotkeys, 'handleWindowKeydown').mockReturnValue(false);

    getAppMethod<(event: KeyboardEvent) => void>(app, '_onWindowKeydown')(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('opens the menu through the state service', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const state = TestBed.inject(StreamStateService);
    const spy = vi.spyOn(state, 'openMenu');

    getAppMethod<() => void>(app, '_openMenu')();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('opens the menu when the trigger button is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);
    const spy = vi.spyOn(state, 'openMenu');

    fixture.detectChanges();
    await fixture.whenStable();

    getAppMethod<() => void>(fixture.componentInstance, '_showMenuTrigger')();
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');

    trigger.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('shows the menu trigger when the hotspot is entered and hides it after a delay', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    try {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).toBeNull();

      getAppMethod<() => void>(app, '_showMenuTrigger')();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).not.toBeNull();

      getAppMethod<() => void>(app, '_scheduleMenuTriggerHide')();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).not.toBeNull();

      vi.advanceTimersByTime(700);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the menu trigger visible when returning to the hotspot before the hide delay ends', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const showMenuTrigger = getAppMethod<() => void>(app, '_showMenuTrigger');
    const scheduleMenuTriggerHide = getAppMethod<() => void>(app, '_scheduleMenuTriggerHide');

    try {
      fixture.detectChanges();
      await fixture.whenStable();

      showMenuTrigger();
      fixture.detectChanges();
      scheduleMenuTriggerHide();
      vi.advanceTimersByTime(350);
      showMenuTrigger();
      vi.advanceTimersByTime(700);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('wires hotspot and button pointer events through the template', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);

    try {
      fixture.detectChanges();
      await fixture.whenStable();

      const topHotspot = fixture.nativeElement.querySelector('.menu-trigger-hotspot--top') as HTMLElement;

      topHotspot.dispatchEvent(new Event('pointerenter'));
      fixture.detectChanges();

      const trigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;

      expect(trigger).not.toBeNull();

      trigger.dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(350);
      trigger.dispatchEvent(new Event('pointerenter'));
      vi.advanceTimersByTime(700);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).not.toBeNull();

      trigger.dispatchEvent(new FocusEvent('focusin'));
      trigger.dispatchEvent(new FocusEvent('focusout'));
      vi.advanceTimersByTime(700);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.menu-trigger')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores repeated hide scheduling while the menu trigger is hidden', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    fixture.detectChanges();
    await fixture.whenStable();

    getAppMethod<() => void>(app, '_scheduleMenuTriggerHide')();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.menu-trigger')).toBeNull();
  });

  it('renders and dismisses the startup hint on first load', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const notice = fixture.nativeElement.querySelector('.app-notice') as HTMLElement;
    const dismissButton = fixture.nativeElement.querySelector('[aria-label="Hinweis schließen"]') as HTMLButtonElement;

    expect(notice?.textContent).toContain('Schneller starten');

    dismissButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-label="Hinweis schließen"]')).toBeNull();
  });

  it('normalizes list routes to the canonical #/List/<id> format', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigateByUrl('/list/001');
    await fixture.whenStable();
    TestBed.tick();

    const state = TestBed.inject(StreamStateService);

    expect(router.url).toBe('/List/1');
    expect(state.activeListId()).toBe(1);
  });

  it('normalizes invalid routes to #/List/null', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigateByUrl('/Streams/abc');
    await fixture.whenStable();
    TestBed.tick();

    const state = TestBed.inject(StreamStateService);

    expect(router.url).toBe('/List/null');
    expect(state.activeListId()).toBeNull();
  });

  it('preserves query parameters and fragments while canonicalizing list routes', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await router.navigateByUrl('/list/001?layout=compact#stats');
    await fixture.whenStable();
    TestBed.tick();

    expect(router.url).toBe('/List/1?layout=compact#stats');
  });

  it('shows the active list name in the browser tab title', async () => {
    const fixture = TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    state.createList('Favoriten');
    fixture.detectChanges();
    await router.navigateByUrl('/List/1');
    await fixture.whenStable();
    TestBed.tick();

    expect(document.title).toBe('Favoriten | Twitch Multi-Viewer');
  });

  it('shows a fallback title when the active list does not exist', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await router.navigateByUrl('/List/9');
    await fixture.whenStable();
    TestBed.tick();

    expect(document.title).toBe('Liste 9 nicht gefunden | Twitch Multi-Viewer');
  });

  it('shows the default browser title when no active list is selected', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();

    expect(document.title).toBe('Twitch Multi-Viewer');
  });

  it('restores the last active list on the initial null route', async () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 2, name: 'Esports', streams: [] }],
      quality: 'auto',
      statistics: [],
      favoriteChannels: [],
      recentChannels: [],
      layoutPreset: 'auto',
      focusedChannel: null,
      lastActiveListId: 2,
    }));

    const state = TestBed.inject(StreamStateService);
    state.initialize();
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    await fixture.whenStable();

    expect(router.url).toBe('/List/2');
  });

  it('does not restore a missing last active list on the initial null route', async () => {
    localStorage.setItem('app_state_v3', JSON.stringify({
      lists: [{ id: 2, name: 'Esports', streams: [] }],
      quality: 'auto',
      statistics: [],
      favoriteChannels: [],
      recentChannels: [],
      layoutPreset: 'auto',
      focusedChannel: null,
      lastActiveListId: 9,
    }));

    const state = TestBed.inject(StreamStateService);
    state.initialize();
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    await fixture.whenStable();

    expect(router.url).toBe('/List/null');
  });

  it('does not navigate when the stored last active list is no longer present', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const navigateToList = vi.fn();

    (app as unknown as Record<string, unknown>)['_state'] = {
      lastActiveListId: () => 9,
      lists: () => [],
    };
    (app as unknown as Record<string, unknown>)['_listNavigation'] = { navigateToList };

    getAppMethod<(activeListId: number | null) => void>(app, '_restoreInitialView')(null);

    expect(navigateToList).not.toHaveBeenCalled();
  });

  it('renders and dismisses the update notice', async () => {
    const fixture = TestBed.createComponent(App);
    const pwa = TestBed.inject(PwaService);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.app-notice--update')).toBeNull();

    (pwa as unknown as Record<string, { set: (v: boolean) => void }>)['_updateAvailable'].set(true);
    fixture.detectChanges();

    const updateNotice = fixture.nativeElement.querySelector('.app-notice--update') as HTMLElement;
    expect(updateNotice?.textContent).toContain('Update verfügbar');

    const dismissBtn = fixture.nativeElement.querySelector('[aria-label="Update-Hinweis schließen"]') as HTMLButtonElement;
    dismissBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.app-notice--update')).toBeNull();
  });

  it('delegates reload to the PWA service when the update button is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    const pwa = TestBed.inject(PwaService);
    const reloadSpy = vi.spyOn(pwa, 'reloadForUpdate').mockImplementation(() => {});

    (pwa as unknown as Record<string, { set: (v: boolean) => void }>)['_updateAvailable'].set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const reloadBtn = fixture.nativeElement.querySelector('.app-notice__btn--accent') as HTMLButtonElement;
    reloadBtn.click();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('delegates install to the PWA service', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const pwa = TestBed.inject(PwaService);
    const installSpy = vi.spyOn(pwa, 'install').mockResolvedValue(undefined);

    getAppMethod<() => void>(app, '_installApp')();

    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the install button when canInstall is true', async () => {
    const pwa = TestBed.inject(PwaService);
    const fakePromptEvent = { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }) };
    (pwa as unknown as Record<string, { set: (v: unknown) => void }>)['_installPromptEvent'].set(fakePromptEvent);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    const installButton = fixture.nativeElement.querySelector('.app-notice__btn--accent') as HTMLButtonElement;
    expect(installButton?.textContent?.trim()).toBe('Installieren');
  });
});
