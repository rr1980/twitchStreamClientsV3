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
  /**
   * Hosts the list, stream, layout, and quick-action controls inside the settings modal.
   *
   * @remarks Provides UI and logic for managing stream lists, channels, layouts, and quick actions.
   * @component
   */
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

  /**
   * Creates a new list and navigates to it when validation succeeds.
   *
   * @returns {void}
   * @remarks Shows a toast message for success or error. Focuses the input on error.
   */
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

  /**
   * Enters inline rename mode for the selected list.
   *
   * @param {StreamList} list List to rename.
   * @returns {void}
   */
  protected _startRenameList(list: StreamList): void {
    this._editingListId.set(list.id);
    this._renameListControl.setValue(list.name, { emitEvent: false });
  }

  /**
   * Validates and persists the edited list name.
   *
   * @param {number} listId Id of the list to rename.
   * @returns {void}
   * @remarks Shows a toast message for success or error.
   */
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

  /**
   * Leaves inline rename mode without changing the list name.
   *
   * @returns {void}
   * @remarks Resets the editing list state.
   */
  protected _cancelRenameList(): void {
    this._editingListId.set(null);
  }

  /**
   * Activates the selected list and updates the route.
   *
   * @param {number} listId Id of the list to activate.
   * @returns {void}
   */
  protected _selectList(listId: number): void {
    this._navigateToList(listId);
  }

  /**
   * Creates a duplicate of the given list and switches to it.
   *
   * @param {StreamList} list List to duplicate.
   * @returns {void}
   * @remarks Shows a toast message for success or error.
   */
  protected _duplicateList(list: StreamList): void {
    const result = this._state.duplicateList(list.id);

    if (!result.ok || !result.list) {
      this._toast.show('Die Liste konnte nicht dupliziert werden.', 'error');
      return;
    }

    this._navigateToList(result.list.id);
    this._toast.show(`${result.list.name} angelegt.`);
  }

  /**
   * Removes a list and navigates to the next sensible list when needed.
   *
   * @param {StreamList} list List to remove.
   * @returns {void}
   * @remarks Shows a toast message and navigates to the next list if the active one is deleted.
   */
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

  /**
   * Closes the settings modal.
   *
   * @returns {void}
   * @remarks Triggers the state service to close the menu.
   */
  protected _close(): void {
    this._state.closeMenu();
  }

  /**
   * Closes the modal when the backdrop itself is clicked.
   *
   * @param {MouseEvent} event Mouse event triggered by clicking the backdrop.
   * @returns {void}
   * @remarks Only closes if the backdrop (not a child) was clicked.
   */
  protected _onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this._close();
    }
  }

  /**
   * Keeps keyboard focus trapped inside the modal while it is open.
   *
   * @param {KeyboardEvent} event Keyboard event triggered inside the modal dialog.
   * @returns {void}
   * @remarks Handles Escape to close and Tab/Shift+Tab to cycle focus.
   */
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

  /**
   * Adds a new stream to the active list after extracting a clean channel name.
   *
   * @returns {void}
   * @remarks Shows a toast message for success or error. Focuses the input on error.
   */
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

  /**
   * Removes one stream from the active list.
   *
   * @param {number} index Index of the stream to remove.
   * @returns {void}
   * @remarks Shows a toast message if a stream was removed.
   */
  protected _removeStream(index: number): void {
    const removed = this._state.removeStream(index);
    if (removed) {
      this._toast.show(`${removed} entfernt.`, 'info');
    }
  }

  /**
   * Moves a stream by one position inside the active list.
   *
   * @param {number} index Index of the stream to move.
   * @param {-1 | 1} direction Direction to move, `-1` for up and `1` for down.
   * @returns {void}
   */
  protected _moveStream(index: number, direction: -1 | 1): void {
    this._state.moveStream(index, direction);
  }

  /**
   * Returns whether a move action stays within the current stream bounds.
   *
   * @param {number} index Index of the stream to move.
   * @param {-1 | 1} direction Direction to move, `-1` for up and `1` for down.
   * @returns {boolean} `true` when the move stays within the current stream bounds.
   */
  protected _canMoveStream(index: number, direction: -1 | 1): boolean {
    const targetIndex = index + direction;

    return targetIndex >= 0 && targetIndex < this._streams().length;
  }

  /**
   * Updates the list-wide stream quality and closes the modal.
   *
   * @param {StreamQuality} value New stream quality value to set.
   * @returns {void}
   */
  protected _setQuality(value: StreamQuality): void {
    this._state.setQuality(value);
    this._close();
  }

  /**
   * Updates the active list layout preset.
   *
   * @param {StreamLayoutPreset} value New layout preset value to set.
   * @returns {void}
   */
  protected _setLayoutPreset(value: StreamLayoutPreset): void {
    this._state.setLayoutPreset(value);
  }

  /**
   * Disables chat for every stream in the active list and reports the outcome.
   *
   * @returns {void}
   * @remarks Shows a toast message for the number of chats disabled or if none were active.
   */
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

  /**
   * Toggles the global mute flag for the active list and closes the modal.
   *
   * @returns {void}
   * @remarks Shows a toast message indicating the new mute state.
   */
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

  /**
   * Toggles whether a channel belongs to the favorites pool.
   *
   * @param {string} channelName Name of the channel to toggle as favorite.
   * @returns {void}
   * @remarks Shows a toast message indicating the new favorite state.
   */
  protected _toggleFavoriteChannel(channelName: string): void {
    const isFavorite = this._state.toggleFavoriteChannel(channelName);

    this._toast.show(
      isFavorite
        ? `${channelName} als Favorit gespeichert.`
        : `${channelName} aus den Favoriten entfernt.`,
      'info',
    );
  }

  /**
   * Starts HTML5 drag-and-drop reordering for a stream entry.
   *
   * @param {number} index Index of the stream being dragged.
   * @param {DragEvent} event Drag event object.
   * @returns {void}
   * @remarks Sets up the drag image and state for reordering.
   */
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
      this._document.body.appendChild(clone);
      event.dataTransfer.setDragImage(clone, event.clientX - rect.left, event.clientY - rect.top);
      requestAnimationFrame(() => clone.remove());
    }
  }

  /**
   * Marks a stream as the current drop target while dragging.
   *
   * @param {number} index Index of the stream being hovered as a drop target.
   * @returns {void}
   */
  protected _onStreamDragEnter(index: number): void {
    if (this._draggedStreamIndex() === null || this._draggedStreamIndex() === index) {
      return;
    }

    this._dropTargetStreamIndex.set(index);
  }

  /**
   * Keeps drag-and-drop active and updates the hovered drop target.
   *
   * @param {number} index Index of the stream currently hovered.
   * @param {DragEvent} event Drag event object.
   * @returns {void}
   */
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

  /**
   * Applies the pending drag-and-drop reorder when a stream is dropped.
   *
   * @param {number} index Index where the stream is dropped.
   * @param {DragEvent} event Drag event object.
   * @returns {void}
   */
  protected _onStreamDrop(index: number, event: DragEvent): void {
    event.preventDefault();

    const draggedIndex = this._draggedStreamIndex();

    if (draggedIndex !== null && draggedIndex !== index) {
      this._state.reorderStreams(draggedIndex, index);
    }

    this._resetDragState();
  }

  /**
   * Clears drag state after the browser finishes a drag interaction.
   *
   * @returns {void}
   * @remarks Resets the drag and drop state variables.
   */
  protected _onStreamDragEnd(): void {
    this._resetDragState();
  }

  /**
   * Provides a stable identity for quality options rendered in the template.
   *
   * @param {number} _ Index of the option, unused.
   * @param {StreamQualityOption} quality Quality option object.
   * @returns {string} Unique value of the quality option.
   */
  protected _trackQuality(_: number, quality: StreamQualityOption): string {
    return quality.value;
  }

  /**
   * Provides a stable identity for layout options rendered in the template.
   *
   * @param {number} _ Index of the option, unused.
   * @param {StreamLayoutPresetOption} option Layout preset option object.
   * @returns {StreamLayoutPreset} Unique value of the layout preset option.
   */
  protected _trackLayoutOption(_: number, option: StreamLayoutPresetOption): StreamLayoutPreset {
    return option.value;
  }

  /**
   * Updates the chat visibility for one stream entry.
   *
   * @param {number} index Index of the stream to update.
   * @param {boolean} value Whether chat should be shown for this stream.
   * @returns {void}
   */
  protected _setStreamShowChat(index: number, value: boolean): void {
    this._state.setStreamShowChat(index, value);
  }

  /**
   * Forwards checkbox changes from the template to the stream chat toggle.
   *
   * @param {number} index Index of the stream to update.
   * @param {Event} event Change event from the checkbox input.
   * @returns {void}
   */
  protected _onStreamChatChange(index: number, event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this._setStreamShowChat(index, target.checked);
    }
  }

  /**
   * Provides a stable identity for list rows rendered in the template.
   *
   * @param {number} _ Index of the list, unused.
   * @param {StreamList} list List object.
   * @returns {number} Unique id of the list.
   */
  protected _trackList(_: number, list: StreamList): number {
    return list.id;
  }

  /**
   * Provides a stable identity for stream rows rendered in the template.
   *
   * @param {number} _ Index of the stream, unused.
   * @param {StreamChannel} stream Stream channel object.
   * @returns {string} Unique name of the stream channel.
   */
  protected _trackStream(_: number, stream: StreamChannel): string {
    return stream.name;
  }

  /**
   * Returns whether the given stream is currently being dragged.
   *
   * @param {number} index Index of the stream to check.
   * @returns {boolean} `true` when the stream is currently being dragged.
   */
  protected _isDraggedStream(index: number): boolean {
    return this._draggedStreamIndex() === index;
  }

  /**
   * Returns whether the given stream is the active drop target.
   *
   * @param {number} index Index of the stream to check.
   * @returns {boolean} `true` when the stream is the current drop target.
   */
  protected _isDropTarget(index: number): boolean {
    return this._dropTargetStreamIndex() === index && this._draggedStreamIndex() !== index;
  }

  /**
   * Removes trailing statistic counts from suggestion labels before validation.
   *
   * @param {string} value Input string containing the channel name and optional count.
   * @returns {string} Cleaned channel name without the trailing count.
   */
  private _extractChannelName(value: string): string {
    return value.replace(/\s+\(\d+\)$/, '');
  }

  /**
   * Navigates to the canonical route for the selected list.
   *
   * @param {number | null} listId Id of the list to navigate to, or `null`.
   * @returns {void}
   */
  private _navigateToList(listId: number | null): void {
    this._listNavigation.navigateToList(listId);
  }

  /**
   * Picks the next list to show after deleting the current one.
   *
   * @param {StreamList[]} lists Array of lists before deletion.
   * @param {number} removedListId Id of the list that was removed.
   * @returns {number | null} Id of the next list to show, or `null` when none remains.
   */
  private _getNextListIdAfterDeletion(lists: StreamList[], removedListId: number): number | null {
    const removedIndex = lists.findIndex(list => list.id === removedListId);

    if (removedIndex < 0) {
      return null;
    }

    const remainingLists = lists.filter(list => list.id !== removedListId);

    return remainingLists[removedIndex]?.id ?? remainingLists[removedIndex - 1]?.id ?? null;
  }

  /**
   * Focuses the requested input on the next microtask and optionally selects its content.
   *
   * @param {() => ElementRef<HTMLInputElement> | undefined} inputRef Function returning the input reference to focus.
   * @param {boolean} [selectText=false] Whether the input text should be selected after focus.
   * @returns {void}
   */
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

  /**
   * Clears drag state after a completed or cancelled reorder interaction.
   *
   * @returns {void}
   * @remarks Resets the dragged and drop target stream indices.
   */
  private _resetDragState(): void {
    this._draggedStreamIndex.set(null);
    this._dropTargetStreamIndex.set(null);
  }

  /**
   * Collects focusable elements so keyboard navigation can be trapped in the modal.
   *
   * @param {HTMLElement} container Container element to search for focusable children.
   * @returns {HTMLElement[]} Array of focusable HTML elements within the container.
   */
  private _getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  }
}
