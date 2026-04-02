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
    '(window:hashchange)': 'onHashChange()',
  },
})
export class App {
  readonly state = inject(StreamStateService);
  private readonly hotkeys = inject(HotkeyService);

  constructor() {
    this.syncListFromHash();
  }

  onWindowKeydown(event: KeyboardEvent): void {
    this.hotkeys.handleWindowKeydown(event, document.activeElement);
  }

  onHashChange(): void {
    this.syncListFromHash();
  }

  openMenu(): void {
    this.state.openMenu();
  }

  private syncListFromHash(): void {
    const listId = this.parseListId(window.location.hash);
    const normalizedHash = this.buildListHash(listId);

    this.state.setActiveListId(listId);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }
  }

  private parseListId(hash: string): number | null {
    const match = hash.match(/^#\/List\/(.+)$/i);
    const rawListId = match?.[1] ?? 'null';

    if (rawListId === 'null') {
      return null;
    }

    const parsed = Number(rawListId);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private buildListHash(listId: number | null): string {
    return `#/List/${listId ?? 'null'}`;
  }
}