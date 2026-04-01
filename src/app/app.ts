import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
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
})
export class App {
  readonly state = inject(StreamStateService);

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    const activeTag = (document.activeElement?.tagName || '').toUpperCase();

    if (event.key === 'Escape') {
      this.state.closeMenu();
      return;
    }

    if (event.key.toLowerCase() === 'm' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
      this.state.toggleMenu();
    }
  }

  openMenu(): void {
    this.state.openMenu();
  }
}