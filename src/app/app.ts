import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { HotkeyService } from './core/services/hotkey.service';
import { ListNavigationService } from './core/services/list-navigation.service';
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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(window:keydown)': '_onWindowKeydown($event)',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '(window:hashchange)': '_onHashChange()',
  },
})
export class App {
  protected readonly _state = inject(StreamStateService);
  private readonly _hotkeys = inject(HotkeyService);
  private readonly _listNavigation = inject(ListNavigationService);
  private readonly _title = inject(Title);

  constructor() {
    effect(() => {
      this._title.setTitle(this._buildDocumentTitle());
    });

    this._syncListFromHash();
  }

  protected _onWindowKeydown(event: KeyboardEvent): void {
    if (this._hotkeys.handleWindowKeydown(event, document.activeElement)) {
      event.preventDefault();
    }
  }

  protected _onHashChange(): void {
    this._syncListFromHash();
  }

  protected _openMenu(): void {
    this._state.openMenu();
  }

  private _syncListFromHash(): void {
    const listId = this._listNavigation.syncLocationToListHash();
    this._state.setActiveListId(listId);
  }

  private _buildDocumentTitle(): string {
    const activeList = this._state.activeList();
    const activeListId = this._state.activeListId();

    if (activeList) {
      return `${activeList.name} | Twitch Multi-Viewer`;
    }

    if (activeListId !== null) {
      return `Liste ${activeListId} nicht gefunden | Twitch Multi-Viewer`;
    }

    return 'Twitch Multi-Viewer';
  }
}