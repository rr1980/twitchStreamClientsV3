import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StreamGridComponent } from './features/stream-grid/stream-grid.component';
import { SettingsModalComponent } from './features/settings-modal/settings-modal.component';
import { ToastContainerComponent } from './features/toast/toast-container.component';
import { StreamStateService } from './core/services/stream-state.service';

@Component({
  selector: 'app-root',
  imports: [StreamGridComponent, SettingsModalComponent, ToastContainerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'onWindowKeydown($event)',
  },
})
export class App {
  readonly state = inject(StreamStateService);

  onWindowKeydown(event: KeyboardEvent): void {
    if (this.isTypingContext(document.activeElement)) {
      return;
    }

    if (event.key === 'Escape') {
      this.state.closeMenu();
      return;
    }

    if (event.key.toLowerCase() === 'm') {
      this.state.toggleMenu();
    }
  }

  openMenu(): void {
    this.state.openMenu();
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