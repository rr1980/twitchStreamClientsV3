import { ChangeDetectionStrategy, Component, computed, effect, inject, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { StreamChannel, StreamList, StreamQuality, StreamStatistic } from '../../core/models/app-settings.model';
import { ListNavigationService } from '../../core/services/list-navigation.service';
import { StreamStateService } from '../../core/services/stream-state.service';
import { ToastService } from '../toast/toast.service';

@Component({
  selector: 'app-settings-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent {
  private readonly _listNavigation = inject(ListNavigationService);
  private readonly _state = inject(StreamStateService);
  private readonly _toast = inject(ToastService);
  private _previouslyFocusedElement: HTMLElement | null = null;
  private _wasOpen = false;

  public readonly listInputRef = viewChild<ElementRef<HTMLInputElement>>('listInput');
  public readonly streamInputRef = viewChild<ElementRef<HTMLInputElement>>('streamInput');
  public readonly renameListInputRef = viewChild<ElementRef<HTMLInputElement>>('renameListInput');
  public readonly modalPanelRef = viewChild<ElementRef<HTMLElement>>('modalPanel');

  public readonly qualityOptions: StreamQuality[] = ['auto', '480p', '720p60', 'chunked'];
  public readonly newListNameControl = new FormControl('', { nonNullable: true });
  public readonly activeListNameControl = new FormControl('', { nonNullable: true });
  public readonly channelNameControl = new FormControl('', { nonNullable: true });
  public readonly isOpen = this._state.menuOpen;
  public readonly lists = this._state.lists;
  public readonly activeListId = this._state.activeListId;
  public readonly activeList = this._state.activeList;
  public readonly streams = this._state.streams;
  public readonly selectedQuality = this._state.quality;
  public readonly topStatistics = computed(() => this._state.getTopStatistics(10));
  public readonly hasActiveList = computed(() => this.activeList() !== null);

  constructor() {
    effect(() => {
      this.activeListNameControl.setValue(this.activeList()?.name ?? '', { emitEvent: false });
    });

    effect(() => {
      if (this.hasActiveList()) {
        this.channelNameControl.enable({ emitEvent: false });
        return;
      }

      this.channelNameControl.disable({ emitEvent: false });
    });

    effect(() => {
      const open = this.isOpen();

      if (open && !this._wasOpen) {
        this._previouslyFocusedElement = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

        queueMicrotask(() => {
          const primaryInput = this.activeList()
            ? this.streamInputRef()?.nativeElement
            : this.listInputRef()?.nativeElement;

          primaryInput?.focus();
        });
      }

      if (!open && this._wasOpen) {
        const elementToFocus = this._previouslyFocusedElement;
        this._previouslyFocusedElement = null;

        queueMicrotask(() => {
          elementToFocus?.focus();
        });
      }

      this._wasOpen = open;
    });
  }

  public createList(): void {
    const result = this._state.createList(this.newListNameControl.getRawValue());

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        this._toast.show('Eine Liste mit diesem Namen gibt es bereits.', 'error');
        return;
      }

      this._toast.show('Gib einen Namen für die neue Liste ein.', 'error');
      return;
    }

    this.newListNameControl.reset('');
    this._navigateToList(result.list?.id ?? null);
    this._toast.show(`${result.list?.name} angelegt.`);
  }

  public renameActiveList(): void {
    const activeList = this.activeList();

    if (!activeList) {
      this._toast.show('Wähle zuerst eine Liste aus.', 'error');
      return;
    }

    const result = this._state.renameList(activeList.id, this.activeListNameControl.getRawValue());

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        this._toast.show('Eine Liste mit diesem Namen gibt es bereits.', 'error');
        return;
      }

      this._toast.show('Der Listenname darf nicht leer sein.', 'error');
      return;
    }

    this._toast.show(`${result.list?.name} gespeichert.`);
    this.renameListInputRef()?.nativeElement.focus();
  }

  public selectList(listId: number): void {
    this._navigateToList(listId);
  }

  public deleteList(list: StreamList): void {
    const listsBeforeDeletion = this.lists();
    const wasActiveList = this.activeListId() === list.id;
    const removed = this._state.deleteList(list.id);

    if (!removed) {
      return;
    }

    const nextListId = this._getNextListIdAfterDeletion(listsBeforeDeletion, list.id);

    if (wasActiveList) {
      this._navigateToList(nextListId);
    }

    this._toast.show(`${removed.name} gelöscht.`, 'info');
  }

  public close(): void {
    this._state.closeMenu();
  }

  public onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  public onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const modalPanel = this.modalPanelRef()?.nativeElement;
    if (!modalPanel) {
      return;
    }

    const focusableElements = this._getFocusableElements(modalPanel);

    if (focusableElements.length === 0) {
      event.preventDefault();
      modalPanel.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (activeElement === firstElement || activeElement === modalPanel)) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  public addStream(): void {
    const channelName = this._extractChannelName(this.channelNameControl.getRawValue());
    const result = this._state.addStream(channelName);

    if (!result.ok) {
      if (result.reason === 'no-list') {
        this._toast.show('Lege zuerst eine Liste an oder wähle eine vorhandene Liste aus.', 'error');
        return;
      }

      if (result.reason === 'invalid') {
        this._toast.show('Ungültiger Kanalname. Erlaubt: a-z, äöü, 0-9, _ (max. 25 Zeichen).', 'error');
        return;
      }

      if (result.reason === 'duplicate') {
        this._toast.show(`${result.name} ist bereits aktiv.`, 'error');
        return;
      }

      return;
    }

    this._toast.show(`${result.name} hinzugefügt.`);
    this.channelNameControl.reset('');
    this.streamInputRef()?.nativeElement.focus();
  }

  public removeStream(index: number): void {
    const removed = this._state.removeStream(index);
    if (removed) {
      this._toast.show(`${removed} entfernt.`, 'info');
    }
  }

  public moveStream(index: number, direction: -1 | 1): void {
    this._state.moveStream(index, direction);
  }

  public setQuality(value: StreamQuality): void {
    this._state.setQuality(value);
  }

  public setStreamShowChat(index: number, value: boolean): void {
    this._state.setStreamShowChat(index, value);
  }

  public onStreamChatChange(index: number, event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.setStreamShowChat(index, target.checked);
    }
  }

  public formatStatisticLabel(item: StreamStatistic): string {
    return `${item.name} (${item.value})`;
  }

  public trackList(_: number, list: StreamList): number {
    return list.id;
  }

  public trackStream(_: number, stream: StreamChannel): string {
    return stream.name;
  }

  private _extractChannelName(value: string): string {
    return value.replace(/\s+\(\d+\)$/, '');
  }

  private _navigateToList(listId: number | null): void {
    this._listNavigation.navigateToList(listId);
  }

  private _getNextListIdAfterDeletion(lists: StreamList[], removedListId: number): number | null {
    const remainingLists = lists.filter(list => list.id !== removedListId);
    return remainingLists[0]?.id ?? null;
  }

  private _getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  }
}