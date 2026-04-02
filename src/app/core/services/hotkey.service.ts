import { Injectable, inject } from '@angular/core';
import { StreamStateService } from './stream-state.service';

@Injectable({ providedIn: 'root' })
export class HotkeyService {
  private readonly state = inject(StreamStateService);

  public handleWindowKeydown(event: KeyboardEvent, activeElement: Element | null): boolean {
    if (event.defaultPrevented || event.isComposing) {
      return false;
    }

    if (!event.key) {
      return false;
    }

    if (event.key === 'Escape') {
      this.state.closeMenu();
      return true;
    }

    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    if (event.key.toLowerCase() === 'm' && !this.isTypingContext(activeElement)) {
      this.state.toggleMenu();
      return true;
    }

    return false;
  }

  private isTypingContext(activeElement: Element | null): boolean {
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