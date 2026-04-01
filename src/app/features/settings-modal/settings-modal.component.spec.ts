import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StreamQuality, StreamStatistic } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { SettingsModalComponent } from './settings-modal.component';
import { ToastService } from '../toast/toast.service';

describe('SettingsModalComponent', () => {
  let fixture: ComponentFixture<SettingsModalComponent>;
  let component: SettingsModalComponent;
  let state: MockStreamStateService;
  let toast: MockToastService;

  beforeEach(async () => {
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
    state.addStream.mockReturnValue({ ok: true, name: 'shroud' });
    await syncComponent();

    component.channelNameControl.setValue('Shroud');
    fixture.nativeElement.querySelector('.primary-btn')?.click();
    await syncComponent();

    expect(state.addStream).toHaveBeenCalledWith('Shroud');
    expect(component.channelNameControl.value).toBe('');
    expect(toast.show).toHaveBeenCalledWith('shroud hinzugefügt.');
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#stream-input'));
  });

  it('keeps focus trapped inside the dialog on tab from the last element', async () => {
    state.menuOpen.set(true);
    state.streams.set(['shroud']);
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
  readonly streams = signal<string[]>([]);
  readonly quality = signal<StreamQuality>('auto');
  readonly showChat = signal(false);
  statistics: StreamStatistic[] = [];

  readonly addStream = vi.fn<(rawName: string) => { ok: boolean; reason?: string; name?: string }>();
  readonly closeMenu = vi.fn(() => {
    this.menuOpen.set(false);
  });
  readonly moveStream = vi.fn();
  readonly removeStream = vi.fn(() => null);
  readonly setQuality = vi.fn((value: StreamQuality) => {
    this.quality.set(value);
  });
  readonly setShowChat = vi.fn((value: boolean) => {
    this.showChat.set(value);
  });

  getTopStatistics(): StreamStatistic[] {
    return this.statistics;
  }
}

class MockToastService {
  readonly show = vi.fn();
}