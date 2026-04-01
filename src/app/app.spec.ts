import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { HotkeyService } from './core/services/hotkey.service';
import { StreamStateService } from './core/services/stream-state.service';

describe('App', () => {
  beforeEach(async () => {
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

  it('opens the menu through the state service', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const state = TestBed.inject(StreamStateService);
    const spy = vi.spyOn(state, 'openMenu');

    app.openMenu();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
