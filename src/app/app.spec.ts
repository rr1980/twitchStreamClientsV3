import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { HotkeyService } from './core/services/hotkey.service';
import { StreamStateService } from './core/services/stream-state.service';

describe('App', () => {
  beforeEach(async () => {
    window.location.hash = '#/List/null';
    document.title = 'Test';

    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
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

    app.onWindowKeydown(event);

    expect(spy).toHaveBeenCalledWith(event, document.activeElement);
  });

  it('prevents the default key behavior when a hotkey was handled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const hotkeys = TestBed.inject(HotkeyService);
    const event = new KeyboardEvent('keydown', { key: 'm' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    vi.spyOn(hotkeys, 'handleWindowKeydown').mockReturnValue(true);

    app.onWindowKeydown(event);

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves the default key behavior alone when no hotkey was handled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const hotkeys = TestBed.inject(HotkeyService);
    const event = new KeyboardEvent('keydown', { key: 'x' });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    vi.spyOn(hotkeys, 'handleWindowKeydown').mockReturnValue(false);

    app.onWindowKeydown(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('opens the menu through the state service', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const state = TestBed.inject(StreamStateService);
    const spy = vi.spyOn(state, 'openMenu');

    app.openMenu();

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

  it('normalizes list hashes to the canonical #/List/<id> format', () => {
    window.location.hash = '#/list/001';

    TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    expect(window.location.hash).toBe('#/List/1');
    expect(state.activeListId()).toBe(1);
  });

  it('normalizes invalid list hashes to #/List/null', () => {
    window.location.hash = '#/Streams/abc';

    TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    expect(window.location.hash).toBe('#/List/null');
    expect(state.activeListId()).toBeNull();
  });

  it('shows the active list name in the browser tab title', () => {
    TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    state.createList('Favoriten');
    state.setActiveListId(1);
    TestBed.flushEffects();

    expect(document.title).toBe('Favoriten | Twitch Multi-Viewer');
  });

  it('shows a fallback title when the active list does not exist', () => {
    TestBed.createComponent(App);
    const state = TestBed.inject(StreamStateService);

    state.setActiveListId(9);
    TestBed.flushEffects();

    expect(document.title).toBe('Liste 9 nicht gefunden | Twitch Multi-Viewer');
  });
});
