import { Injectable, inject } from '@angular/core';
import { StreamStateService } from './stream-state.service';

@Injectable({ providedIn: 'root' })
/**
 * Centralizes global keyboard shortcuts that interact with the settings menu.
 *
 * @remarks Handles global hotkeys for opening and closing the settings menu and prevents conflicts with text input fields.
 */
export class HotkeyService {
  private readonly _state = inject(StreamStateService);

  /**
   * Handles supported window-level shortcuts and returns whether one was consumed.
   *
   * @param {KeyboardEvent} event Keyboard event raised at the window level.
   * @param {Element | null} activeElement Currently focused element in the document.
   * @returns {boolean} `true` when a supported shortcut was handled and consumed.
   * @remarks Ignores IME input, already handled events, and shortcuts fired inside editable contexts.
   */
  public handleWindowKeydown(event: KeyboardEvent, activeElement: Element | null): boolean {
    if (event.defaultPrevented || event.isComposing || event.key === 'Process') {
      return false;
    }

    if (!event.key) {
      return false;
    }

    if (event.key === 'Escape' && this._state.menuOpen()) {
      this._state.closeMenu();
      return true;
    }

    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    if (event.key.toLowerCase() === 'm' && !this._state.menuOpen() && !this._isTypingContext(activeElement)) {
      this._state.openMenu();
      return true;
    }

    return false;
  }

  /**
   * Detects whether keyboard input currently targets an editable element.
   *
   * @param {Element | null} activeElement Currently focused element in the document.
   * @returns {boolean} `true` when the element accepts text input, such as an input, select, or `contentEditable` node.
   * @remarks Prevents global shortcuts from interfering with regular typing.
   */
  private _isTypingContext(activeElement: Element | null): boolean {
    if (!(activeElement instanceof HTMLElement)) {
      return false;
    }

    const activeTag = activeElement.tagName.toUpperCase();

    return activeTag === 'INPUT'
      || activeTag === 'TEXTAREA'
      || activeTag === 'SELECT'
      || activeElement.isContentEditable;
  }
}
