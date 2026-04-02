import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
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
  private readonly title = inject(Title);

  constructor() {
    effect(() => {
      this.title.setTitle(this.buildDocumentTitle());
    });

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
    const listId = this.parseListId(this.normalizeHash(window.location.hash));
    const normalizedHash = this.buildListHash(listId);

    this.state.setActiveListId(listId);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }
  }

  private parseListId(hash: string): number | null {
    const match = hash.match(/^#\/List\/(.+)$/);
    const rawListId = match?.[1] ?? 'null';

    if (rawListId === 'null') {
      return null;
    }

    const parsed = Number(rawListId);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizeHash(hash: string): string {
    const trimmedHash = hash.trim();
    const match = trimmedHash.match(/^#\/([^/]+)\/(.+)$/);

    if (!match) {
      return '#/List/null';
    }

    const [, routeSegment, rawListId] = match;

    if (routeSegment.toLocaleLowerCase() !== 'list') {
      return '#/List/null';
    }

    if (rawListId === 'null') {
      return '#/List/null';
    }

    if (!/^\d+$/.test(rawListId)) {
      return '#/List/null';
    }

    const parsed = Number(rawListId);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return '#/List/null';
    }

    return `#/List/${parsed}`;
  }

  private buildListHash(listId: number | null): string {
    return `#/List/${listId ?? 'null'}`;
  }

  private buildDocumentTitle(): string {
    const activeList = this.state.activeList();
    const activeListId = this.state.activeListId();

    if (activeList) {
      return `${activeList.name} | Twitch Multi-Viewer`;
    }

    if (activeListId !== null) {
      return `Liste ${activeListId} nicht gefunden | Twitch Multi-Viewer`;
    }

    return 'Twitch Multi-Viewer';
  }
}