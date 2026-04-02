import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withHashLocation } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { appRoutes } from './app.config';
import { HotkeyService } from './core/services/hotkey.service';
import { StreamStateService } from './core/services/stream-state.service';

describe('App', () => {
  let router: Router;

  function getAppMethod<T extends (...args: never[]) => unknown>(instance: object, propertyName: string): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  beforeEach(async () => {
    document.title = 'Test';

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
    expect(compiled.querySelector('.menu-trigger')?.getAttribute('aria-haspopup')).toBe('dialog');
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

    const trigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;
    trigger.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes list routes to the canonical #/List/<id> format', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigateByUrl('/list/001');
    await fixture.whenStable();
    TestBed.flushEffects();

    const state = TestBed.inject(StreamStateService);

    expect(router.url).toBe('/List/1');
    expect(state.activeListId()).toBe(1);
  });

  it('normalizes invalid routes to #/List/null', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await router.navigateByUrl('/Streams/abc');
    await fixture.whenStable();
    TestBed.flushEffects();

    const state = TestBed.inject(StreamStateService);

    expect(router.url).toBe('/List/null');
    expect(state.activeListId()).toBeNull();
  });

  it('preserves query parameters and fragments while canonicalizing list routes', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await router.navigateByUrl('/list/001?layout=compact#stats');
    await fixture.whenStable();
    TestBed.flushEffects();

    expect(router.url).toBe('/List/1?layout=compact#stats');
  });

  it('shows the active list name in the browser tab title', async () => {
    const fixture = TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    state.createList('Favoriten');
    fixture.detectChanges();
    await router.navigateByUrl('/List/1');
    await fixture.whenStable();
    TestBed.flushEffects();

    expect(document.title).toBe('Favoriten | Twitch Multi-Viewer');
  });

  it('shows a fallback title when the active list does not exist', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await router.navigateByUrl('/List/9');
    await fixture.whenStable();
    TestBed.flushEffects();

    expect(document.title).toBe('Liste 9 nicht gefunden | Twitch Multi-Viewer');
  });
});
