import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HotkeyService } from './hotkey.service';
import { StreamStateService } from './stream-state.service';

describe('HotkeyService', () => {
  let service: HotkeyService;
  let state: MockStreamStateService;

  beforeEach(() => {
    state = new MockStreamStateService();

    TestBed.configureTestingModule({
      providers: [
        { provide: StreamStateService, useValue: state },
      ],
    });

    service = TestBed.inject(HotkeyService);
  });

  it('closes the menu on escape even when an input is focused', () => {
    state.menuOpen.set(true);
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    const handled = service.handleWindowKeydown(event, input);

    expect(handled).toBe(true);
    expect(state.closeMenu).toHaveBeenCalledTimes(1);
  });

  it('ignores escape when the menu is already closed', () => {
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    const handled = service.handleWindowKeydown(event, button);

    expect(handled).toBe(false);
    expect(state.closeMenu).not.toHaveBeenCalled();
  });

  it('opens the menu on m outside typing contexts', () => {
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    const handled = service.handleWindowKeydown(event, button);

    expect(handled).toBe(true);
    expect(state.openMenu).toHaveBeenCalledTimes(1);
  });

  it('ignores m inside typing contexts', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    const handled = service.handleWindowKeydown(event, input);

    expect(handled).toBe(false);
    expect(state.openMenu).not.toHaveBeenCalled();
  });

  it('ignores m when the menu is already open', () => {
    state.menuOpen.set(true);
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    const handled = service.handleWindowKeydown(event, button);

    expect(handled).toBe(false);
    expect(state.openMenu).not.toHaveBeenCalled();
  });

  it('ignores repeated and modified shortcuts', () => {
    const button = document.createElement('button');

    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true }), button)).toBe(false);
    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', metaKey: true }), button)).toBe(false);
    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', altKey: true }), button)).toBe(false);

    const repeatEvent = new KeyboardEvent('keydown', { key: 'm' });
    Object.defineProperty(repeatEvent, 'repeat', { value: true });

    expect(service.handleWindowKeydown(repeatEvent, button)).toBe(false);
    expect(state.openMenu).not.toHaveBeenCalled();
  });

  it('ignores prevented, composing and keyless keyboard events', () => {
    const button = document.createElement('button');
    const preventedEvent = new KeyboardEvent('keydown', { key: 'm', cancelable: true });
    const composingEvent = new KeyboardEvent('keydown', { key: 'm' });
    const keylessEvent = new KeyboardEvent('keydown', { key: 'm' });

    preventedEvent.preventDefault();
    Object.defineProperty(composingEvent, 'isComposing', { value: true });
    Object.defineProperty(keylessEvent, 'key', { value: '' });

    expect(service.handleWindowKeydown(preventedEvent, button)).toBe(false);
    expect(service.handleWindowKeydown(composingEvent, button)).toBe(false);
    expect(service.handleWindowKeydown(keylessEvent, button)).toBe(false);
    expect(state.openMenu).not.toHaveBeenCalled();
    expect(state.closeMenu).not.toHaveBeenCalled();
  });

  it('treats textarea, select and contenteditable elements as typing contexts', () => {
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    Object.defineProperty(editable, 'isContentEditable', { value: true });

    expect(service.handleWindowKeydown(event, textarea)).toBe(false);
    expect(service.handleWindowKeydown(event, select)).toBe(false);
    expect(service.handleWindowKeydown(event, editable)).toBe(false);
    expect(state.openMenu).not.toHaveBeenCalled();
  });

  it('treats non-html elements as non-typing contexts', () => {
    const getTypingContext = ((service as unknown as Record<string, unknown>)['_isTypingContext'] as (value: Element | null) => boolean)
      .bind(service);
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    expect(getTypingContext(svgElement)).toBe(false);
  });
});

class MockStreamStateService {
  public readonly menuOpen = signal(false);
  public readonly openMenu = vi.fn(() => {
    this.menuOpen.set(true);
  });
  public readonly closeMenu = vi.fn(() => {
    this.menuOpen.set(false);
  });
}