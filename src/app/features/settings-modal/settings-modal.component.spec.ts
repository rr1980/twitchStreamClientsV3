import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamChannel, StreamList, StreamQuality, StreamStatistic } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { SettingsModalComponent } from './settings-modal.component';
import { ToastService } from '../toast/toast.service';

describe('SettingsModalComponent', () => {
  let fixture: ComponentFixture<SettingsModalComponent>;
  let component: SettingsModalComponent;
  let state: MockStreamStateService;
  let toast: MockToastService;

  beforeEach(async () => {
    window.location.hash = '#/List/null';
    state = new MockStreamStateService();
    toast = new MockToastService();

    await TestBed.configureTestingModule({
      imports: [SettingsModalComponent],
      providers: [
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

  it('renders history suggestions, lists, correct stream count labels and quality options', async () => {
    state.menuOpen.set(true);
    state.setLists([
      { id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv')] },
      { id: 2, name: 'Liste 2', streams: [] },
    ]);
    state.setActiveListId(1);
    state.quality.set('chunked');
    state.statistics = [
      { name: 'gronkh', value: 3 },
      { name: 'papaplatte', value: 2 },
    ];
    await syncComponent();

    const datalist = fixture.nativeElement.querySelector('#history-datalist') as HTMLDataListElement | null;
    const options = Array.from(datalist?.querySelectorAll('option') ?? []).map(option => ({
      value: option.value,
      label: option.getAttribute('label'),
      text: option.textContent?.trim(),
    }));
    const countLabel = fixture.nativeElement.querySelector('.list-block__header span')?.textContent?.trim();
    const checkedRadio = fixture.nativeElement.querySelector('input[name="stream-quality"]:checked') as HTMLInputElement | null;
    const qualityButtons = fixture.nativeElement.querySelectorAll('.quality-btn') as NodeListOf<HTMLElement>;
    const qualityLabels = Array.from(qualityButtons, element => element.textContent?.trim());
    const listNames = Array.from(fixture.nativeElement.querySelectorAll('.list-item__name'), (element: Element) => element.textContent?.trim());

    expect(options).toEqual([
      { value: 'gronkh (3)', label: null, text: '' },
      { value: 'papaplatte (2)', label: null, text: '' },
    ]);
    expect(countLabel).toBe('2 Listen');
    expect(checkedRadio).not.toBeNull();
    expect(qualityLabels).toContain('Source');
    expect(listNames).toEqual(['Liste 1', 'Liste 2']);
  });

  it('renders the singular stream count and disables move buttons at the boundaries', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    await syncComponent();

    const streamCountLabel = fixture.nativeElement.querySelectorAll('.list-block__header span')[1]?.textContent?.trim();
    const moveButtons = fixture.nativeElement.querySelectorAll('.stream-item__move button');

    expect(streamCountLabel).toBe('1 Stream');
    expect((moveButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((moveButtons[1] as HTMLButtonElement).disabled).toBe(true);
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

    component.channelNameControl.setValue('Shroud');
    fixture.nativeElement.querySelector('[aria-label="Kanal hinzufügen"]')?.click();
    await syncComponent();

    expect(state.addStream).toHaveBeenCalledWith('Shroud');
    expect(component.channelNameControl.value).toBe('');
    expect(toast.show).toHaveBeenCalledWith('shroud hinzugefügt.');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#stream-input'));
  });

  it('adds a stream via enter on the input field', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.addStream.mockReturnValue({ ok: true, name: 'gronkh' });
    await syncComponent();

    const input = fixture.nativeElement.querySelector('#stream-input') as HTMLInputElement;
    input.value = 'Gronkh (3)';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await syncComponent();

    expect(state.addStream).toHaveBeenCalledWith('Gronkh');
    expect(toast.show).toHaveBeenCalledWith('gronkh hinzugefügt.');
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

  it('ignores non-tab dialog keydowns and returns safely without a modal panel', () => {
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    component.onDialogKeydown(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    component.onDialogKeydown(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
  });

  it('focuses the modal panel when no focusable elements remain', async () => {
    state.menuOpen.set(true);
    await syncComponent();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    dialog.innerHTML = '';
    dialog.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    component.onDialogKeydown(event);

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

    state.addStream.mockReturnValueOnce({ ok: false, reason: 'invalid' });
    component.channelNameControl.setValue('invalid-name');
    component.addStream();

    state.addStream.mockReturnValueOnce({ ok: false, reason: 'duplicate', name: 'shroud' });
    component.channelNameControl.setValue('shroud');
    component.addStream();

    expect(toast.show).toHaveBeenNthCalledWith(1, 'Ungültiger Kanalname. Erlaubt: a-z, äöü, 0-9, _ (max. 25 Zeichen).', 'error');
    expect(toast.show).toHaveBeenNthCalledWith(2, 'shroud ist bereits aktiv.', 'error');
  });

  it('ignores empty add results without showing a toast', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [] }]);
    state.setActiveListId(1);
    state.addStream.mockReturnValue({ ok: false, reason: 'empty' });
    await syncComponent();

    component.channelNameControl.setValue('   ');
    component.addStream();

    expect(toast.show).not.toHaveBeenCalled();
  });

  it('removes streams, updates quality and chat state, and ignores invalid show-chat events', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud')] }]);
    state.setActiveListId(1);
    state.removeStream.mockReturnValue('shroud');
    await syncComponent();

    component.removeStream(0);
    component.setQuality('720p60');
    component.onStreamChatChange(0, new Event('change'));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    component.onStreamChatChange(0, { target: checkbox } as unknown as Event);

    expect(toast.show).toHaveBeenCalledWith('shroud entfernt.', 'info');
    expect(state.setQuality).toHaveBeenCalledWith('720p60');
    expect(state.setStreamShowChat).toHaveBeenCalledTimes(1);
    expect(state.setStreamShowChat).toHaveBeenCalledWith(0, true);
  });

  it('wires move, remove, quality and chat controls through DOM interactions', async () => {
    state.menuOpen.set(true);
    state.setLists([{ id: 1, name: 'Liste 1', streams: [channel('shroud'), channel('rocketbeanstv', true)] }]);
    state.setActiveListId(1);
    state.removeStream.mockReturnValue('shroud');
    await syncComponent();

    const moveButtons = fixture.nativeElement.querySelectorAll('.stream-item__move button') as NodeListOf<HTMLButtonElement>;
    const removeButton = fixture.nativeElement.querySelector('[aria-label="shroud entfernen"]') as HTMLButtonElement;
    const qualityRadios = fixture.nativeElement.querySelectorAll('input[name="stream-quality"]') as NodeListOf<HTMLInputElement>;
    const chatCheckbox = fixture.nativeElement.querySelector('[aria-label="shroud Chat anzeigen"]') as HTMLInputElement;

    moveButtons[2].click();
    removeButton.click();
    qualityRadios[2].checked = true;
    qualityRadios[2].dispatchEvent(new Event('change', { bubbles: true }));
    chatCheckbox.checked = true;
    chatCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await syncComponent();

    expect(state.moveStream).toHaveBeenCalledWith(1, -1);
    expect(state.removeStream).toHaveBeenCalledWith(0);
    expect(state.setQuality).toHaveBeenCalledWith('720p60');
    expect(state.setStreamShowChat).toHaveBeenCalledWith(0, true);
    expect(toast.show).toHaveBeenCalledWith('shroud entfernt.', 'info');
  });

  it('delegates stream movement to the state service', () => {
    component.moveStream(2, -1);

    expect(state.moveStream).toHaveBeenCalledWith(2, -1);
  });

  it('creates a list, navigates via hash and shows a toast', async () => {
    state.menuOpen.set(true);
    state.createList.mockReturnValue({ ok: true, list: { id: 4, name: 'Esports', streams: [] } });
    await syncComponent();

    component.newListNameControl.setValue('Esports');
    component.createList();

    expect(state.createList).toHaveBeenCalledWith('Esports');
    expect(window.location.hash).toBe('#/List/4');
    expect(toast.show).toHaveBeenCalledWith('Esports angelegt.');
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

    component.activeListNameControl.setValue('Main');
    component.renameActiveList();
    component.deleteList({ id: 1, name: 'Liste 1', streams: [channel('shroud')] });

    expect(state.renameList).toHaveBeenCalledWith(1, 'Main');
    expect(state.deleteList).toHaveBeenCalledWith(1);
    expect(window.location.hash).toBe('#/List/2');
  });

  function channel(name: string, showChat = false): StreamChannel {
    return { name, showChat };
  }

  async function syncComponent(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  }
});

class MockStreamStateService {
  readonly menuOpen = signal(false);
  readonly lists = signal<StreamList[]>([]);
  readonly activeListId = signal<number | null>(null);
  readonly activeList = computed(() => this.lists().find(list => list.id === this.activeListId()) ?? null);
  readonly streams = computed(() => this.activeList()?.streams ?? []);
  readonly quality = signal<StreamQuality>('auto');
  statistics: StreamStatistic[] = [];

  readonly addStream = vi.fn<(rawName: string) => { ok: boolean; reason?: string; name?: string }>();
  readonly createList = vi.fn<(rawName: string) => { ok: boolean; reason?: string; list?: StreamList }>();
  readonly closeMenu = vi.fn(() => {
    this.menuOpen.set(false);
  });
  readonly deleteList = vi.fn<(listId: number) => StreamList | null>(() => null);
  readonly moveStream = vi.fn();
  readonly removeStream = vi.fn<(index: number) => string | null>(() => null);
  readonly renameList = vi.fn<(listId: number, rawName: string) => { ok: boolean; reason?: string; list?: StreamList }>();
  readonly setQuality = vi.fn((value: StreamQuality) => {
    this.quality.set(value);
  });
  readonly setStreamShowChat = vi.fn();

  setLists(lists: StreamList[]): void {
    this.lists.set(lists);
  }

  setActiveListId(listId: number | null): void {
    this.activeListId.set(listId);
  }

  getTopStatistics(): StreamStatistic[] {
    return this.statistics;
  }
}

class MockToastService {
  readonly show = vi.fn();
}