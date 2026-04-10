import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import type { StreamChannel, StreamLayoutPreset, StreamList, StreamQuality, StreamQualityOption, StreamStatistic } from '../../core/models/app-settings.model';
import { ListNavigationService } from '../../core/services/list-navigation.service';
import { StreamStateService } from '../../core/services/stream-state.service';
import { SettingsModalComponent } from './settings-modal.component';
import { ToastService } from '../toast/toast.service';

describe('SettingsModalComponent', () => {
  let fixture: ComponentFixture<SettingsModalComponent>;
  let component: SettingsModalComponent;
  let listNavigation: MockListNavigationService;
  let state: MockStreamStateService;
  let toast: MockToastService;

  function getComponentMember<T>(instance: object, propertyName: string): T {
    return (instance as Record<string, unknown>)[propertyName] as T;
  }

  function getComponentMethod<T extends (...args: never[]) => unknown>(instance: object, propertyName: string): T {
    return ((instance as Record<string, unknown>)[propertyName] as (...args: never[]) => unknown).bind(instance) as T;
  }

  function getElement<T extends Element>(selector: string): T {
    const element = fixture.nativeElement.querySelector(selector) as T | null;

    expect(element).not.toBeNull();

    return element as T;
  }

  function getButtonByText(text: string): HTMLButtonElement {
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const button = Array.from(buttons)
      .find(candidate => candidate.textContent?.trim() === text);

    expect(button).toBeDefined();

    return button as HTMLButtonElement;
  }

  function setInputValue(selector: string, value: string): HTMLInputElement {
    const input = getElement<HTMLInputElement>(selector);

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    return input;
  }

  beforeEach(async () => {
    listNavigation = new MockListNavigationService();
    state = new MockStreamStateService();
    toast = new MockToastService();

    await TestBed.configureTestingModule({
      imports: [SettingsModalComponent],
      providers: [
        { provide: ListNavigationService, useValue: listNavigation },
        { provide: StreamStateService, useValue: state },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsModalComponent);
    component = fixture.componentInstance;
  });

  it('renders an accessible dialog and focuses the input when opened', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.menuOpen.set(true);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement | null;
    const input = fixture.nativeElement.querySelector('#stream-input') as HTMLInputElement | null;

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('settings-modal-title');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    opener.remove();
  });

  it('renders suggestion chips, lists, correct stream count labels and quality options', async () => {
    state.menuOpen.set(true);
    state.setLists([
      { id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] },
      { id: 2, name: 'Liste 2', streams: [] },
    ]);
    state.availableQualities.set([
      quality('auto', 'Auto'),
      quality('chunked', '1080p60 (Quelle)'),
      quality('1080p60'),
      quality('720p60'),
      quality('audio_only', 'Nur Audio'),
    ]);
    state.setActiveListId(1);
    state.quality.set('chunked');
    state.favoriteChannels.set(['gronkh']);
    state.recentChannels.set(['papaplatte']);
    state.statistics = [
      { name: 'gronkh', value: 3 },
      { name: 'papaplatte', value: 2 },
      { name: 'bonjwa', value: 1 },
    ];
    await syncComponent();

    const countLabel = fixture.nativeElement.querySelector('.list-block__header span')?.textContent?.trim();
    const checkedRadio = fixture.nativeElement.querySelector('input[name="stream-quality"]:checked') as HTMLInputElement | null;
    const qualityButtons = fixture.nativeElement.querySelectorAll('.quality-btn') as NodeListOf<HTMLElement>;
    const qualityLabels = Array.from(qualityButtons, element => element.textContent?.trim());
    const listNames = Array.from(fixture.nativeElement.querySelectorAll('.list-item__name'), (element: Element) => element.textContent?.trim());
    const suggestionChips = Array.from(fixture.nativeElement.querySelectorAll('.suggestion-chip'), (element: Element) => element.textContent?.trim());
    const datalist = fixture.nativeElement.querySelector('#history-datalist') as HTMLDataListElement | null;

    expect(suggestionChips).toEqual(['gronkh', 'papaplatte']);
    expect(datalist).toBeNull();
    expect(countLabel).toBe('2 Listen');
    expect(checkedRadio).not.toBeNull();
    expect(qualityLabels).toContain('Auto');
    expect(qualityLabels).toContain('1080p60 (Quelle)');
    expect(qualityLabels).toContain('1080p60');
    expect(qualityLabels).toContain('720p60');
    expect(qualityLabels).toContain('Nur Audio');
    expect(listNames).toEqual(['Liste 1', 'Liste 2']);
  });

  it('renders the singular stream count and keeps the drag handle visible', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const streamCountLabel = fixture.nativeElement.querySelectorAll('.list-block__header span')[1]?.textContent?.trim();
    const dragHandle = fixture.nativeElement.querySelector('.stream-item__drag-handle') as HTMLElement | null;

    expect(streamCountLabel).toBe('1 Stream');
    expect(dragHandle?.textContent?.trim()).toBe('⋮⋮');
  });

  it('renders accessible move buttons and disables unavailable directions', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('gronkh')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const moveUpButton = fixture.nativeElement.querySelector('[aria-label="shroud nach oben verschieben"]') as HTMLButtonElement;
    const moveDownButton = fixture.nativeElement.querySelector('[aria-label="shroud nach unten verschieben"]') as HTMLButtonElement;
    const lastMoveDownButton = fixture.nativeElement.querySelector('[aria-label="gronkh nach unten verschieben"]') as HTMLButtonElement;

    moveDownButton.click();

    expect(moveUpButton.disabled).toBe(true);
    expect(moveDownButton.disabled).toBe(false);
    expect(lastMoveDownButton.disabled).toBe(true);
    expect(state.moveStream).toHaveBeenCalledWith(0, 1);
  });

  it('closes on escape and restores focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    state.menuOpen.set(true);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await syncComponent();

    expect(state.closeMenu).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it('adds a stream, clears the form and shows a toast', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.addStream.mockReturnValue({ ok: true, name: 'shroud' });
    await syncComponent();

    const input = setInputValue('#stream-input', 'Shroud');

    getElement<HTMLButtonElement>('[aria-label="Kanal hinzufügen"]').click();
    await syncComponent();

    expect(state.addStream).toHaveBeenCalledWith('Shroud');
    expect(input.value).toBe('');
    expect(toast.show).toHaveBeenCalledWith('shroud hinzugefügt.');
    expect(document.activeElement).toBe(input);
  });

  it('adds a stream via enter on the input field', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.addStream.mockReturnValue({ ok: true, name: 'gronkh' });
    await syncComponent();

    const input = fixture.nativeElement.querySelector('#stream-input') as HTMLInputElement;
    input.value = 'Gronkh';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await syncComponent();

    expect(state.addStream).toHaveBeenCalledWith('Gronkh');
    expect(toast.show).toHaveBeenCalledWith('gronkh hinzugefügt.');
  });

  it('duplicates a list and navigates to the copy', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.duplicateList.mockReturnValue({ ok: true, list: { id: 2, name: 'Liste 1 Kopie', streams: [channel('shroud')] } });
    await syncComponent();

    const duplicateButton = fixture.nativeElement.querySelector('[aria-label="Liste 1 duplizieren"]') as HTMLButtonElement;
    duplicateButton.click();

    expect(state.duplicateList).toHaveBeenCalledWith(1);
    expect(listNavigation.navigateToList).toHaveBeenCalledWith(2);
    expect(toast.show).toHaveBeenCalledWith('Liste 1 Kopie angelegt.');
  });

  it('shows the no-list error and focuses the list input when adding a stream is impossible', async () => {
    state.menuOpen.set(true);
    state.addStream.mockReturnValue({ ok: false, reason: 'no-list' });
    await syncComponent();

    const listInput = fixture.nativeElement.querySelector('#list-input') as HTMLInputElement;

    getComponentMethod<() => void>(component, '_addStream')();
    await Promise.resolve();

    expect(toast.show).toHaveBeenCalledWith('Lege zuerst eine Liste an oder wähle eine vorhandene Liste aus.', 'error');
    expect(document.activeElement).toBe(listInput);
  });

  it('creates a list via enter on the list input', async () => {
    state.menuOpen.set(true);
    state.createList.mockReturnValue({ ok: true, list: { id: 4, name: 'Esports', streams: [] } });
    await syncComponent();

    const input = fixture.nativeElement.querySelector('#list-input') as HTMLInputElement;

    input.value = 'Esports';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await syncComponent();

    expect(state.createList).toHaveBeenCalledWith('Esports');
    expect(listNavigation.navigateToList).toHaveBeenCalledWith(4);
    expect(toast.show).toHaveBeenCalledWith('Esports angelegt.');
  });

  it('renames the active list via enter on the rename input', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.renameList.mockReturnValue({ ok: true, list: { id: 1, name: 'Main', streams: [] } });
    await syncComponent();

    const input = fixture.nativeElement.querySelector('#rename-list-input') as HTMLInputElement;

    input.value = 'Main';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await syncComponent();

    expect(state.renameList).toHaveBeenCalledWith(1, 'Main');
    expect(toast.show).toHaveBeenCalledWith('Main gespeichert.');
    expect(document.activeElement).toBe(input);
  });

  it('keeps focus trapped inside the dialog on tab from the last element', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];
    lastElement.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    await syncComponent();

    expect(document.activeElement).toBe(firstElement);
  });

  it('traps focus backwards with shift+tab from the first element', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];
    firstElement.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    dialog.dispatchEvent(event);
    await syncComponent();

    expect(document.activeElement).toBe(lastElement);
  });

  it('traps focus backwards when shift+tab starts on the modal panel itself', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
    const lastElement = focusable[focusable.length - 1];

    dialog.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    getComponentMethod<(event: KeyboardEvent) => void>(component, '_onDialogKeydown')(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastElement);
  });

  it('ignores non-tab dialog keydowns and returns safely without a modal panel', () => {
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    getComponentMethod<(event: KeyboardEvent) => void>(component, '_onDialogKeydown')(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    getComponentMethod<(event: KeyboardEvent) => void>(component, '_onDialogKeydown')(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
  });

  it('focuses the modal panel when no focusable elements remain', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    dialog.innerHTML = '';
    dialog.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    getComponentMethod<(event: KeyboardEvent) => void>(component, '_onDialogKeydown')(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);
  });

  it('closes only when the backdrop itself is clicked', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    const backdrop = fixture.nativeElement.querySelector('.modal-backdrop') as HTMLElement;
    const modal = fixture.nativeElement.querySelector('.modal') as HTMLElement;

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.closeMenu).not.toHaveBeenCalled();

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.closeMenu).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is clicked', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    const closeButton = fixture.nativeElement.querySelector('.icon-btn') as HTMLButtonElement;
    closeButton.click();

    expect(state.closeMenu).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast for invalid and duplicate channel names', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    await syncComponent();

    const streamInput = fixture.nativeElement.querySelector('#stream-input') as HTMLInputElement;

    state.addStream.mockReturnValueOnce({ ok: false, reason: 'invalid' });
    getComponentMember<{ setValue(value: string): void }>(component, '_channelNameControl').setValue('invalid-name');
    getComponentMethod<() => void>(component, '_addStream')();
    await Promise.resolve();

    expect(document.activeElement).toBe(streamInput);

    state.addStream.mockReturnValueOnce({ ok: false, reason: 'duplicate', name: 'shroud' });
    getComponentMember<{ setValue(value: string): void }>(component, '_channelNameControl').setValue('shroud');
    getComponentMethod<() => void>(component, '_addStream')();

    expect(toast.show).toHaveBeenNthCalledWith(1, 'Ungültiger Kanalname. Erlaubt: a-z, äöü, 0-9, _ (max. 25 Zeichen).', 'error');
    expect(toast.show).toHaveBeenNthCalledWith(2, 'shroud ist bereits aktiv.', 'error');
  });

  it('shows an error toast for empty channel names and refocuses the input', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.addStream.mockReturnValue({ ok: false, reason: 'empty' });
    await syncComponent();

    const streamInput = fixture.nativeElement.querySelector('#stream-input') as HTMLInputElement;

    getComponentMember<{ setValue(value: string): void }>(component, '_channelNameControl').setValue('   ');
    getComponentMethod<() => void>(component, '_addStream')();
    await Promise.resolve();

    expect(toast.show).toHaveBeenCalledWith('Gib einen Kanalnamen ein.', 'error');
    expect(document.activeElement).toBe(streamInput);
  });

  it('focuses the list input when creating a list fails validation', async () => {
    state.menuOpen.set(true);
    state.createList.mockReturnValue({ ok: false, reason: 'empty' });
    await syncComponent();

    const listInput = fixture.nativeElement.querySelector('#list-input') as HTMLInputElement;

    getComponentMember<{ setValue(value: string): void }>(component, '_newListNameControl').setValue('   ');
    getComponentMethod<() => void>(component, '_createList')();
    await Promise.resolve();

    expect(toast.show).toHaveBeenCalledWith('Gib einen Namen für die neue Liste ein.', 'error');
    expect(document.activeElement).toBe(listInput);
  });

  it('shows the duplicate-list error and selects the list input', async () => {
    state.menuOpen.set(true);
    state.createList.mockReturnValue({ ok: false, reason: 'duplicate' });
    await syncComponent();

    const listInput = fixture.nativeElement.querySelector('#list-input') as HTMLInputElement;
    const selectSpy = vi.spyOn(listInput, 'select');

    getComponentMember<{ setValue(value: string): void }>(component, '_newListNameControl').setValue('Liste 1');
    getComponentMethod<() => void>(component, '_createList')();
    await Promise.resolve();

    expect(toast.show).toHaveBeenCalledWith('Eine Liste mit diesem Namen gibt es bereits.', 'error');
    expect(document.activeElement).toBe(listInput);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('requires an active list before renaming and selecting a list navigates directly', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    const listInput = fixture.nativeElement.querySelector('#list-input') as HTMLInputElement;

    getComponentMethod<() => void>(component, '_renameActiveList')();
    await Promise.resolve();
    getComponentMethod<(listId: number) => void>(component, '_selectList')(5);

    expect(toast.show).toHaveBeenCalledWith('Wähle zuerst eine Liste aus.', 'error');
    expect(document.activeElement).toBe(listInput);
    expect(listNavigation.navigateToList).toHaveBeenCalledWith(5);
  });

  it('shows duplicate and empty errors when renaming the active list fails', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    await syncComponent();

    const input = fixture.nativeElement.querySelector('#rename-list-input') as HTMLInputElement;
    const selectSpy = vi.spyOn(input, 'select');

    state.renameList.mockReturnValueOnce({ ok: false, reason: 'duplicate' });
    getComponentMethod<() => void>(component, '_renameActiveList')();
    await Promise.resolve();

    state.renameList.mockReturnValueOnce({ ok: false, reason: 'empty' });
    getComponentMethod<() => void>(component, '_renameActiveList')();
    await Promise.resolve();

    expect(toast.show).toHaveBeenNthCalledWith(1, 'Eine Liste mit diesem Namen gibt es bereits.', 'error');
    expect(toast.show).toHaveBeenNthCalledWith(2, 'Der Listenname darf nicht leer sein.', 'error');
    expect(document.activeElement).toBe(input);
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it('returns without navigation when a list deletion did not remove anything', () => {
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);

    getComponentMethod<(list: StreamList) => void>(component, '_deleteList')({ id: 1, name: 'Liste 1', streams: [] });

    expect(listNavigation.navigateToList).not.toHaveBeenCalled();
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('returns null when the deleted list id is missing from the previous list snapshot', () => {
    const nextListId = getComponentMethod<(lists: StreamList[], removedListId: number) => number | null>(
      component,
      '_getNextListIdAfterDeletion',
    )([{ id: 1, name: 'Liste 1', streams: [] }], 9);

    expect(nextListId).toBeNull();
  });

  it('returns safely when a queued focus target no longer exists', async () => {
    getComponentMethod<(inputRef: () => { nativeElement: HTMLInputElement } | undefined, selectText?: boolean) => void>(
      component,
      '_focusInput',
    )(() => undefined, true);

    await Promise.resolve();

    expect(toast.show).not.toHaveBeenCalled();
  });

  it('removes streams, updates quality and chat state, and ignores invalid show-chat events', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    state.removeStream.mockReturnValue('shroud');
    await syncComponent();

    getComponentMethod<(index: number) => void>(component, '_removeStream')(0);
    getComponentMethod<(value: StreamQuality) => void>(component, '_setQuality')('720p60');
    getComponentMethod<(index: number, event: Event) => void>(component, '_onStreamChatChange')(0, new Event('change'));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    getComponentMethod<(index: number, event: Event) => void>(component, '_onStreamChatChange')(0, { target: checkbox } as unknown as Event);

    expect(toast.show).toHaveBeenCalledWith('shroud entfernt.', 'info');
    expect(state.setQuality).toHaveBeenCalledWith('720p60');
    expect(state.setStreamShowChat).toHaveBeenCalledTimes(1);
    expect(state.setStreamShowChat).toHaveBeenCalledWith(0, true);
  });

  it('does not show a toast when removing a stream returns nothing', () => {
    getComponentMethod<(index: number) => void>(component, '_removeStream')(0);

    expect(toast.show).not.toHaveBeenCalled();
  });

  it('wires remove, quality and chat controls through DOM interactions', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv', true)] }]);
    state.setActiveListId(1);
    state.removeStream.mockReturnValue('shroud');
    await syncComponent();

    const removeButton = fixture.nativeElement.querySelector('[aria-label="shroud entfernen"]') as HTMLButtonElement;
    const qualityRadios = fixture.nativeElement.querySelectorAll('input[name="stream-quality"]') as NodeListOf<HTMLInputElement>;
    const chatCheckbox = fixture.nativeElement.querySelector('[aria-label="shroud Chat anzeigen"]') as HTMLInputElement;

    removeButton.click();
    qualityRadios[2].checked = true;
    qualityRadios[2].dispatchEvent(new Event('change', { bubbles: true }));
    chatCheckbox.checked = true;
    chatCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await syncComponent();

    expect(state.removeStream).toHaveBeenCalledWith(0);
    expect(state.setQuality).toHaveBeenCalledWith('720p60');
    expect(state.setStreamShowChat).toHaveBeenCalledWith(0, true);
    expect(toast.show).toHaveBeenCalledWith('shroud entfernt.', 'info');
  });

  it('delegates stream movement to the state service', () => {
    getComponentMethod<(index: number, direction: -1 | 1) => void>(component, '_moveStream')(2, -1);

    expect(state.moveStream).toHaveBeenCalledWith(2, -1);
  });

  it('reports whether a stream can move in a given direction', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('gronkh')] }]);
    state.setActiveListId(1);
    await syncComponent();

    expect(getComponentMethod<(index: number, direction: -1 | 1) => boolean>(component, '_canMoveStream')(0, -1)).toBe(false);
    expect(getComponentMethod<(index: number, direction: -1 | 1) => boolean>(component, '_canMoveStream')(0, 1)).toBe(true);
    expect(getComponentMethod<(index: number, direction: -1 | 1) => boolean>(component, '_canMoveStream')(1, 1)).toBe(false);
  });

  it('applies suggestions, toggles favorites, changes layout and delegates drag-and-drop reordering', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('gronkh')] }]);
    state.setActiveListId(1);
    state.favoriteChannels.set(['papaplatte']);
    state.recentChannels.set(['bonjwa']);
    state.toggleFavoriteChannel.mockReturnValue(true);
    await syncComponent();

    const streamInput = getElement<HTMLInputElement>('#stream-input');
    const suggestionButton = getElement<HTMLButtonElement>('.suggestion-chip');
    const favoriteButton = getElement<HTMLButtonElement>('[aria-label="shroud als Favorit speichern"]');
    const layoutRadios = fixture.nativeElement.querySelectorAll('input[name="stream-layout"]') as NodeListOf<HTMLInputElement>;
    const dragEvent = new Event('dragstart') as DragEvent;
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;

    Object.defineProperty(dragEvent, 'dataTransfer', {
      value: { effectAllowed: 'all', setData: vi.fn(), dropEffect: 'move' },
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { dropEffect: 'move' },
    });
    vi.spyOn(dropEvent, 'preventDefault');

    suggestionButton.click();
    favoriteButton.click();
    layoutRadios[2].checked = true;
    layoutRadios[2].dispatchEvent(new Event('change', { bubbles: true }));
    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragStart')(0, dragEvent);
    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDrop')(1, dropEvent);

    expect(streamInput.value).toBe('papaplatte');
    expect(state.toggleFavoriteChannel).toHaveBeenCalledWith('shroud');
    expect(state.setLayoutPreset).toHaveBeenCalledWith('stage');
    expect(state.reorderStreams).toHaveBeenCalledWith(0, 1);
  });

  it('wires quick actions through the UI and shows feedback', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud', true)] }]);
    state.setActiveListId(1);
    state.favoriteChannels.set(['papaplatte']);
    state.disableChatsForActiveList.mockReturnValue(1);
    state.addFavoriteChannelsToActiveList.mockReturnValue({ ok: true, added: ['papaplatte', 'gronkh'] });
    await syncComponent();

    getButtonByText('Alle Chats aus').click();
    getButtonByText('Alle Streams stummschalten').click();
    getButtonByText('Favoriten zur Liste hinzufuegen').click();

    expect(state.disableChatsForActiveList).toHaveBeenCalledTimes(1);
    expect(state.setMuteAllStreams).toHaveBeenCalledWith(true);
    expect(state.addFavoriteChannelsToActiveList).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('Chat fuer 1 Stream deaktiviert.', 'info');
    expect(toast.show).toHaveBeenCalledWith('Alle Streams stummgeschaltet.', 'info');
    expect(toast.show).toHaveBeenCalledWith('2 Favoriten hinzugefuegt.', 'info');
  });

  it('covers quick-action edge cases when nothing changes or no list is active', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    getComponentMethod<() => void>(component, '_disableAllChats')();
    getComponentMethod<() => void>(component, '_toggleMuteAllStreams')();
    state.addFavoriteChannelsToActiveList.mockReturnValue({ ok: false, reason: 'no-list', added: [] });
    getComponentMethod<() => void>(component, '_addFavoritesToActiveList')();

    expect(toast.show).toHaveBeenNthCalledWith(1, 'Waehle zuerst eine Liste aus.', 'error');
    expect(toast.show).toHaveBeenNthCalledWith(2, 'Waehle zuerst eine Liste aus.', 'error');
    expect(toast.show).toHaveBeenNthCalledWith(3, 'Waehle zuerst eine Liste aus.', 'error');

    toast.show.mockClear();
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    state.disableChatsForActiveList.mockReturnValue(0);
    state.addFavoriteChannelsToActiveList.mockReturnValue({ ok: true, added: [] });
    state.muteAllStreams.set(true);
    await syncComponent();

    getComponentMethod<() => void>(component, '_disableAllChats')();
    getComponentMethod<() => void>(component, '_toggleMuteAllStreams')();
    getComponentMethod<() => void>(component, '_addFavoritesToActiveList')();

    expect(state.setMuteAllStreams).toHaveBeenCalledWith(false);
    expect(toast.show).toHaveBeenNthCalledWith(1, 'Alle Chats sind bereits deaktiviert.', 'info');
    expect(toast.show).toHaveBeenNthCalledWith(2, 'Standard-Audio wiederhergestellt.', 'info');
    expect(toast.show).toHaveBeenNthCalledWith(3, 'Keine neuen Favoriten zum Hinzufuegen.', 'info');
  });

  it('renames and deletes lists through the state service', async () => {
    state.menuOpen.set(true);
    state.setLists([
      { id: 1, name: 'Liste 1', streams: [channel('shroud')] },
      { id: 2, name: 'Liste 2', streams: [] },
    ]);
    state.setActiveListId(1);
    state.renameList.mockReturnValue({ ok: true, list: { id: 1, name: 'Main', streams: [channel('shroud')] } });
    state.deleteList.mockReturnValue({ id: 1, name: 'Main', streams: [channel('shroud')] });
    await syncComponent();

    getComponentMember<{ setValue(value: string): void }>(component, '_activeListNameControl').setValue('Main');
    getComponentMethod<() => void>(component, '_renameActiveList')();
    getComponentMethod<(list: StreamList) => void>(component, '_deleteList')({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });

    expect(state.renameList).toHaveBeenCalledWith(1, 'Main');
    expect(state.deleteList).toHaveBeenCalledWith(1);
    expect(listNavigation.navigateToList).toHaveBeenCalledWith(2);
  });

  it('navigates to the next neighboring list after deleting the active middle list', async () => {
    state.menuOpen.set(true);
    state.setLists([
      { id: 1, name: 'Liste 1', streams: [] },
      { id: 2, name: 'Liste 2', streams: [] },
      { id: 3, name: 'Liste 3', streams: [] },
    ]);
    state.setActiveListId(2);
    state.deleteList.mockReturnValue({ id: 2, name: 'Liste 2', streams: [] });
    await syncComponent();

    getComponentMethod<(list: StreamList) => void>(component, '_deleteList')({ id: 2, name: 'Liste 2', streams: [] });

    expect(listNavigation.navigateToList).toHaveBeenCalledWith(3);
  });

  it('navigates to the previous neighboring list after deleting the last active list', async () => {
    state.menuOpen.set(true);
    state.setLists([
      { id: 1, name: 'Liste 1', streams: [] },
      { id: 2, name: 'Liste 2', streams: [] },
      { id: 3, name: 'Liste 3', streams: [] },
    ]);
    state.setActiveListId(3);
    state.deleteList.mockReturnValue({ id: 3, name: 'Liste 3', streams: [] });
    await syncComponent();

    getComponentMethod<(list: StreamList) => void>(component, '_deleteList')({ id: 3, name: 'Liste 3', streams: [] });

    expect(listNavigation.navigateToList).toHaveBeenCalledWith(2);
  });

  it('shows an error toast when duplicating a list fails', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Test', streams: [] }]);
    state.setActiveListId(1);
    state.duplicateList.mockReturnValue({ ok: false, reason: 'not-found' });
    await syncComponent();

    getComponentMethod<(list: StreamList) => void>(component, '_duplicateList')({ id: 99, name: 'Test', streams: [] });

    expect(toast.show).toHaveBeenCalledWith('Die Liste konnte nicht dupliziert werden.', 'error');
  });

  it('handles drag-over by preventing default and updating drop target', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Test', streams: [channel('a'), channel('b'), channel('c')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dragEvent = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragEvent, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn(), dropEffect: '' } });

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragStart')(0, dragEvent);

    const overEvent = new Event('dragover', { cancelable: true }) as DragEvent;
    Object.defineProperty(overEvent, 'dataTransfer', { value: { dropEffect: '' } });
    const preventSpy = vi.spyOn(overEvent, 'preventDefault');

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragOver')(2, overEvent);

    expect(preventSpy).toHaveBeenCalledTimes(1);
    expect(getComponentMember<() => number | null>(component, '_dropTargetStreamIndex')()).toBe(2);
  });

  it('handles drag-end by resetting drag state', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Test', streams: [channel('a'), channel('b')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dragEvent = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragEvent, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn() } });

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragStart')(0, dragEvent);
    expect(getComponentMember<() => number | null>(component, '_draggedStreamIndex')()).toBe(0);

    getComponentMethod<() => void>(component, '_onStreamDragEnd')();
    expect(getComponentMember<() => number | null>(component, '_draggedStreamIndex')()).toBeNull();
    expect(getComponentMember<() => number | null>(component, '_dropTargetStreamIndex')()).toBeNull();
  });

  it('handles stream chat change from a checkbox input', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Test', streams: [channel('a')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: checkbox });

    getComponentMethod<(index: number, event: Event) => void>(component, '_onStreamChatChange')(0, event);

    expect(state.setStreamShowChat).toHaveBeenCalledWith(0, true);
  });

  it('handles drag-enter by updating drop target index', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Test', streams: [channel('a'), channel('b')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const dragEvent = new Event('dragstart') as DragEvent;
    Object.defineProperty(dragEvent, 'dataTransfer', { value: { effectAllowed: '', setData: vi.fn() } });

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragStart')(0, dragEvent);
    getComponentMethod<(index: number) => void>(component, '_onStreamDragEnter')(1);

    expect(getComponentMember<() => number | null>(component, '_dropTargetStreamIndex')()).toBe(1);
  });

  it('ignores drag-enter when no drag is in progress', () => {
    getComponentMethod<(index: number) => void>(component, '_onStreamDragEnter')(0);

    expect(getComponentMember<() => number | null>(component, '_dropTargetStreamIndex')()).toBeNull();
  });

  it('ignores drag-over when no drag is in progress', () => {
    const overEvent = new Event('dragover', { cancelable: true }) as DragEvent;
    const preventSpy = vi.spyOn(overEvent, 'preventDefault');

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragOver')(0, overEvent);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('handles drag-start without dataTransfer available', () => {
    const dragEvent = new Event('dragstart') as DragEvent;

    getComponentMethod<(index: number, event: DragEvent) => void>(component, '_onStreamDragStart')(0, dragEvent);

    expect(getComponentMember<() => number | null>(component, '_draggedStreamIndex')()).toBe(0);
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  function quality(value: string, label = value): StreamQualityOption {
    return { value, label };
  }

  async function syncComponent(): Promise<void> {
    fixture.detectChanges();
    TestBed.tick();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }
});

class MockStreamStateService {
  public readonly menuOpen = signal(false);
  public readonly lists = signal<StreamList[]>([]);
  public readonly activeListId = signal<number | null>(null);
  public readonly activeList = computed(() => this.lists().find(list => list.id === this.activeListId()) ?? null);
  public readonly streams = computed(() => this.activeList()?.streams ?? []);
  public readonly quality = signal<StreamQuality>('auto');
  public readonly layoutPreset = signal<StreamLayoutPreset>('auto');
  public readonly muteAllStreams = signal(false);
  public readonly availableQualities = signal<StreamQualityOption[]>([
    { value: 'auto', label: 'Auto' },
    { value: 'chunked', label: 'Quelle' },
    { value: '720p60', label: '720p60' },
  ]);
  public readonly favoriteChannels = signal<string[]>([]);
  public readonly recentChannels = signal<string[]>([]);
  public statistics: StreamStatistic[] = [];

  public readonly addStream = vi.fn<(rawName: string) => { ok: boolean; reason?: string; name?: string }>();
  public readonly createList = vi.fn<(rawName: string) => { ok: boolean; reason?: string; list?: StreamList }>();
  public readonly closeMenu = vi.fn(() => {
    this.menuOpen.set(false);
  });
  public readonly deleteList = vi.fn<(listId: number) => StreamList | null>(() => null);
  public readonly duplicateList = vi.fn<(listId: number) => { ok: boolean; reason?: string; list?: StreamList }>();
  public readonly moveStream = vi.fn();
  public readonly removeStream = vi.fn<(index: number) => string | null>(() => null);
  public readonly reorderStreams = vi.fn();
  public readonly renameList = vi.fn<(listId: number, rawName: string) => { ok: boolean; reason?: string; list?: StreamList }>();
  public readonly disableChatsForActiveList = vi.fn(() => 0);
  public readonly addFavoriteChannelsToActiveList = vi.fn<() => { ok: boolean; reason?: 'no-list'; added: string[] }>(
    () => ({ ok: true, added: [] }),
  );
  public readonly setLayoutPreset = vi.fn((value: StreamLayoutPreset) => {
    this.layoutPreset.set(value);
  });
  public readonly setMuteAllStreams = vi.fn((value: boolean) => {
    this.muteAllStreams.set(value);
  });
  public readonly setQuality = vi.fn((value: StreamQuality) => {
    this.quality.set(value);
  });
  public readonly setStreamShowChat = vi.fn();
  public readonly toggleFavoriteChannel = vi.fn<(channelName: string) => boolean>(() => true);

  public setLists(lists: StreamList[]): void {
    this.lists.set(lists);
  }

  public setActiveListId(listId: number | null): void {
    this.activeListId.set(listId);
  }

  public getTopStatistics(): StreamStatistic[] {
    return this.statistics;
  }
}

class MockToastService {
  public readonly show = vi.fn();
}

class MockListNavigationService {
  public readonly navigateToList = vi.fn<(listId: number | null) => void>();
}
