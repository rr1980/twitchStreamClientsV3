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
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });

    const handled = service.handleWindowKeydown(event, input);

    expect(handled).toBe(true);
    expect(state.closeMenu).toHaveBeenCalledTimes(1);
  });

  it('toggles the menu on m outside typing contexts', () => {
    const button = document.createElement('button');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    const handled = service.handleWindowKeydown(event, button);

    expect(handled).toBe(true);
    expect(state.toggleMenu).toHaveBeenCalledTimes(1);
  });

  it('ignores m inside typing contexts', () => {
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'm' });

    const handled = service.handleWindowKeydown(event, input);

    expect(handled).toBe(false);
    expect(state.toggleMenu).not.toHaveBeenCalled();
  });

  it('ignores repeated and modified shortcuts', () => {
    const button = document.createElement('button');

    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', ctrlKey: true }), button)).toBe(false);
    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', metaKey: true }), button)).toBe(false);
    expect(service.handleWindowKeydown(new KeyboardEvent('keydown', { key: 'm', altKey: true }), button)).toBe(false);

    const repeatEvent = new KeyboardEvent('keydown', { key: 'm' });
    Object.defineProperty(repeatEvent, 'repeat', { value: true });

    expect(service.handleWindowKeydown(repeatEvent, button)).toBe(false);
    expect(state.toggleMenu).not.toHaveBeenCalled();
  });
});

class MockStreamStateService {
  public readonly closeMenu = vi.fn();
  public readonly toggleMenu = vi.fn();
}