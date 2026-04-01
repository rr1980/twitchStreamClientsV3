import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HotkeyService } from './core/services/hotkey.service';
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
  private readonly hotkeys = inject(HotkeyService);

  onWindowKeydown(event: KeyboardEvent): void {
    this.hotkeys.handleWindowKeydown(event, document.activeElement);
  }

  openMenu(): void {
    this.state.openMenu();
  }
}