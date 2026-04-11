import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type {
  StreamChannel,
  StreamLayoutPreset,
  StreamList,
  StreamQuality,
  StreamQualityOption,
} from '../../core/models/app-settings.model';
import { ListNavigationService } from '../../core/services/list-navigation.service';
import { StreamStateService } from '../../core/services/stream-state.service';
import { ToastService } from '../toast/toast.service';

interface StreamLayoutPresetOption {
  value: StreamLayoutPreset;
  label: string;
}

@Component({
  selector: 'app-settings-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent {
  private readonly _document = inject(DOCUMENT);
  private readonly _listNavigation = inject(ListNavigationService);
  private readonly _state = inject(StreamStateService);
  private readonly _toast = inject(ToastService);
  private _previouslyFocusedElement: HTMLElement | null = null;
  private _wasOpen = false;
  private readonly _draggedStreamIndex = signal<number | null>(null);
  private readonly _dropTargetStreamIndex = signal<number | null>(null);
  protected readonly _editingListId = signal<number | null>(null);

  private readonly _listInputRef = viewChild<ElementRef<HTMLInputElement>>('listInput');
  private readonly _streamInputRef = viewChild<ElementRef<HTMLInputElement>>('streamInput');
  private readonly _modalPanelRef = viewChild<ElementRef<HTMLElement>>('modalPanel');

  protected readonly _qualityOptions = this._state.availableQualities;
  protected readonly _newListNameControl = new FormControl('', { nonNullable: true });
  protected readonly _renameListControl = new FormControl('', { nonNullable: true });
  protected readonly _channelNameControl = new FormControl('', { nonNullable: true });
  protected readonly _isOpen = this._state.menuOpen;
  protected readonly _lists = this._state.lists;
  protected readonly _activeListId = this._state.activeListId;
  protected readonly _activeList = this._state.activeList;
  protected readonly _streams = this._state.streams;
  protected readonly _selectedQuality = this._state.quality;
  protected readonly _selectedLayoutPreset = this._state.layoutPreset;
  protected readonly _muteAllStreams = this._state.muteAllStreams;
  protected readonly _favoriteChannels = this._state.favoriteChannels;
  protected readonly _hasActiveList = computed(() => this._activeList() !== null);
  protected readonly _hasStreams = computed(() => this._streams().length > 0);
  protected readonly _hasChatsEnabled = computed(() => this._streams().some(stream => stream.showChat));
  protected readonly _favoriteChannelSet = computed(() => new Set(this._favoriteChannels()));

  protected readonly _audioQuickActionLabel = computed(() => this._muteAllStreams()
    ? 'Audio zurücksetzen'
    : 'Alle Streams stummschalten');
  protected readonly _layoutOptions: StreamLayoutPresetOption[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'balanced', label: 'Grid' },
    { value: 'stage', label: 'Bühne' },
    { value: 'chat', label: 'Chat' },
  ];

  constructor() {
    effect(() => {
      if (this._hasActiveList()) {
        this._channelNameControl.enable({ emitEvent: false });
        return;
      }

      this._channelNameControl.disable({ emitEvent: false });
    });

    effect(() => {
      const open = this._isOpen();

      if (open && !this._wasOpen) {
        this._previouslyFocusedElement = this._document.activeElement instanceof HTMLElement
          ? this._document.activeElement
          : null;

        queueMicrotask(() => {
          const primaryInput = this._activeList()
            ? this._streamInputRef()?.nativeElement
            : this._listInputRef()?.nativeElement;

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

  protected _createList(): void {
    const result = this._state.createList(this._newListNameControl.getRawValue());

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        this._focusInput(this._listInputRef, true);
        this._toast.show('Eine Liste mit diesem Namen gibt es bereits.', 'error');
        return;
      }

      this._focusInput(this._listInputRef, true);
      this._toast.show('Gib einen Namen für die neue Liste ein.', 'error');
      return;
    }

    this._newListNameControl.reset('');
    this._navigateToList(result.list?.id ?? null);
    this._toast.show(`${result.list?.name} angelegt.`);
  }

  protected _startRenameList(list: StreamList): void {
    this._editingListId.set(list.id);
    this._renameListControl.setValue(list.name, { emitEvent: false });
  }

  protected _confirmRenameList(listId: number): void {
    const result = this._state.renameList(listId, this._renameListControl.getRawValue());

    if (!result.ok) {
      if (result.reason === 'duplicate') {
        this._toast.show('Eine Liste mit diesem Namen gibt es bereits.', 'error');
        return;
      }

      this._toast.show('Der Listenname darf nicht leer sein.', 'error');
      return;
    }

    this._editingListId.set(null);
    this._toast.show(`${result.list?.name} gespeichert.`);
  }

  protected _cancelRenameList(): void {
    this._editingListId.set(null);
  }

  protected _selectList(listId: number): void {
    this._navigateToList(listId);
  }

  protected _duplicateList(list: StreamList): void {
    const result = this._state.duplicateList(list.id);

    if (!result.ok || !result.list) {
      this._toast.show('Die Liste konnte nicht dupliziert werden.', 'error');
      return;
    }

    this._navigateToList(result.list.id);
    this._toast.show(`${result.list.name} angelegt.`);
  }

  protected _deleteList(list: StreamList): void {
    const listsBeforeDeletion = this._lists();
    const wasActiveList = this._activeListId() === list.id;
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

  protected _close(): void {
    this._state.closeMenu();
  }

  protected _onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this._close();
    }
  }

  protected _onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this._close();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const modalPanel = this._modalPanelRef()?.nativeElement;
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
    const activeElement = this._document.activeElement as HTMLElement | null;

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

  protected _addStream(): void {
    const channelName = this._extractChannelName(this._channelNameControl.getRawValue());
    const result = this._state.addStream(channelName);

    if (!result.ok) {
      if (result.reason === 'no-list') {
        this._focusInput(this._listInputRef);
        this._toast.show('Lege zuerst eine Liste an oder wähle eine vorhandene Liste aus.', 'error');
        return;
      }

      if (result.reason === 'invalid') {
        this._focusInput(this._streamInputRef, true);
        this._toast.show('Ungültiger Kanalname. Erlaubt: a-z, äöü, 0-9, _ (max. 25 Zeichen).', 'error');
        return;
      }

      if (result.reason === 'duplicate') {
        this._focusInput(this._streamInputRef, true);
        this._toast.show(`${result.name} ist bereits aktiv.`, 'error');
        return;
      }

      if (result.reason === 'empty') {
        this._focusInput(this._streamInputRef, true);
        this._toast.show('Gib einen Kanalnamen ein.', 'error');
      }

      return;
    }

    this._toast.show(`${result.name} hinzugefügt.`);
    this._channelNameControl.reset('');
    this._streamInputRef()?.nativeElement.focus();
  }

  protected _removeStream(index: number): void {
    const removed = this._state.removeStream(index);
    if (removed) {
      this._toast.show(`${removed} entfernt.`, 'info');
    }
  }

  protected _moveStream(index: number, direction: -1 | 1): void {
    this._state.moveStream(index, direction);
  }

  protected _canMoveStream(index: number, direction: -1 | 1): boolean {
    const targetIndex = index + direction;

    return targetIndex >= 0 && targetIndex < this._streams().length;
  }

  protected _setQuality(value: StreamQuality): void {
    this._state.setQuality(value);
    this._close();
  }

  protected _setLayoutPreset(value: StreamLayoutPreset): void {
    this._state.setLayoutPreset(value);
  }

  protected _disableAllChats(): void {
    if (!this._hasActiveList()) {
      this._toast.show('Wähle zuerst eine Liste aus.', 'error');
      return;
    }

    const changedCount = this._state.disableChatsForActiveList();

    if (changedCount === 0) {
      this._toast.show('Alle Chats sind bereits deaktiviert.', 'info');
      return;
    }

    this._toast.show(
      changedCount === 1
        ? 'Chat für 1 Stream deaktiviert.'
        : `Chat für ${changedCount} Streams deaktiviert.`,
      'info',
    );
  }

  protected _toggleMuteAllStreams(): void {
    if (!this._hasActiveList()) {
      this._toast.show('Wähle zuerst eine Liste aus.', 'error');
      return;
    }

    const nextValue = !this._muteAllStreams();
    this._state.setMuteAllStreams(nextValue);
    this._close();
    this._toast.show(
      nextValue ? 'Alle Streams stummgeschaltet.' : 'Standard-Audio wiederhergestellt.',
      'info',
    );
  }



  protected _toggleFavoriteChannel(channelName: string): void {
    const isFavorite = this._state.toggleFavoriteChannel(channelName);

    this._toast.show(
      isFavorite
        ? `${channelName} als Favorit gespeichert.`
        : `${channelName} aus den Favoriten entfernt.`,
      'info',
    );
  }

  protected _onStreamDragStart(index: number, event: DragEvent): void {
    this._draggedStreamIndex.set(index);
    this._dropTargetStreamIndex.set(index);

    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));

    const streamItem = (event.target as HTMLElement | null)?.closest('.stream-item') as HTMLElement | null;

    if (streamItem) {
      const rect = streamItem.getBoundingClientRect();
      const clone = streamItem.cloneNode(true) as HTMLElement;
      clone.classList.add('stream-item--drag-preview');
      clone.style.position = 'fixed';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.width = `${rect.width}px`;
      clone.style.pointerEvents = 'none';
      document.body.appendChild(clone);
      event.dataTransfer.setDragImage(clone, event.clientX - rect.left, event.clientY - rect.top);
      requestAnimationFrame(() => clone.remove());
    }
  }

  protected _onStreamDragEnter(index: number): void {
    if (this._draggedStreamIndex() === null || this._draggedStreamIndex() === index) {
      return;
    }

    this._dropTargetStreamIndex.set(index);
  }

  protected _onStreamDragOver(index: number, event: DragEvent): void {
    if (this._draggedStreamIndex() === null) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (this._draggedStreamIndex() !== index) {
      this._dropTargetStreamIndex.set(index);
    }
  }

  protected _onStreamDrop(index: number, event: DragEvent): void {
    event.preventDefault();

    const draggedIndex = this._draggedStreamIndex();

    if (draggedIndex !== null && draggedIndex !== index) {
      this._state.reorderStreams(draggedIndex, index);
    }

    this._resetDragState();
  }

  protected _onStreamDragEnd(): void {
    this._resetDragState();
  }

  protected _trackQuality(_: number, quality: StreamQualityOption): string {
    return quality.value;
  }

  protected _trackLayoutOption(_: number, option: StreamLayoutPresetOption): StreamLayoutPreset {
    return option.value;
  }

  protected _setStreamShowChat(index: number, value: boolean): void {
    this._state.setStreamShowChat(index, value);
  }

  protected _onStreamChatChange(index: number, event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this._setStreamShowChat(index, target.checked);
    }
  }

  protected _trackList(_: number, list: StreamList): number {
    return list.id;
  }

  protected _trackStream(_: number, stream: StreamChannel): string {
    return stream.name;
  }

  protected _isDraggedStream(index: number): boolean {
    return this._draggedStreamIndex() === index;
  }

  protected _isDropTarget(index: number): boolean {
    return this._dropTargetStreamIndex() === index && this._draggedStreamIndex() !== index;
  }

  private _extractChannelName(value: string): string {
    return value.replace(/\s+\(\d+\)$/, '');
  }

  private _navigateToList(listId: number | null): void {
    this._listNavigation.navigateToList(listId);
  }

  private _getNextListIdAfterDeletion(lists: StreamList[], removedListId: number): number | null {
    const removedIndex = lists.findIndex(list => list.id === removedListId);

    if (removedIndex < 0) {
      return null;
    }

    const remainingLists = lists.filter(list => list.id !== removedListId);

    return remainingLists[removedIndex]?.id ?? remainingLists[removedIndex - 1]?.id ?? null;
  }

  private _focusInput(inputRef: () => ElementRef<HTMLInputElement> | undefined, selectText = false): void {
    queueMicrotask(() => {
      const input = inputRef()?.nativeElement;

      if (!input) {
        return;
      }

      input.focus();

      if (selectText) {
        input.select();
      }
    });
  }

  private _resetDragState(): void {
    this._draggedStreamIndex.set(null);
    this._dropTargetStreamIndex.set(null);
  }

  private _getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  }
}
