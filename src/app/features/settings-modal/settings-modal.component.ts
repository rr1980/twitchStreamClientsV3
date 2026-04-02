import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { StreamQuality, StreamStatistic } from '../../core/models/app-settings.model';
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
  private readonly state = inject(StreamStateService);
  private readonly toast = inject(ToastService);
  private previouslyFocusedElement: HTMLElement | null = null;
  private wasOpen = false;

  readonly streamInputRef = viewChild<ElementRef<HTMLInputElement>>('streamInput');
  readonly modalPanelRef = viewChild<ElementRef<HTMLElement>>('modalPanel');

  readonly qualityOptions: StreamQuality[] = ['auto', '480p', '720p60', 'chunked'];
  readonly channelNameControl = new FormControl('', { nonNullable: true });
  readonly isOpen = this.state.menuOpen;
  readonly streams = this.state.streams;
  readonly selectedQuality = this.state.quality;
  readonly showChat = this.state.showChat;
  readonly topStatistics = computed(() => this.state.getTopStatistics(10));

  constructor() {
    effect(() => {
      const open = this.isOpen();

      if (open && !this.wasOpen) {
        this.previouslyFocusedElement = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

        queueMicrotask(() => {
          this.streamInputRef()?.nativeElement.focus();
        });
      }

      if (!open && this.wasOpen) {
        const elementToFocus = this.previouslyFocusedElement;
        this.previouslyFocusedElement = null;

        queueMicrotask(() => {
          elementToFocus?.focus();
        });
      }

      this.wasOpen = open;
    });
  }

  close(): void {
    this.state.closeMenu();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  onDialogKeydown(event: KeyboardEvent): void {
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

    const focusableElements = this.getFocusableElements(modalPanel);

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

  addStream(): void {
    const channelName = this.extractChannelName(this.channelNameControl.getRawValue());
    const result = this.state.addStream(channelName);

    if (!result.ok) {
      if (result.reason === 'invalid') {
        this.toast.show('Ungültiger Kanalname. Erlaubt: a-z, 0-9, _ (max. 25 Zeichen).', 'error');
        return;
      }

      if (result.reason === 'duplicate') {
        this.toast.show(`${result.name} ist bereits aktiv.`, 'error');
        return;
      }

      return;
    }

    this.toast.show(`${result.name} hinzugefügt.`);
    this.channelNameControl.reset('');
    this.streamInputRef()?.nativeElement.focus();
  }

  removeStream(index: number): void {
    const removed = this.state.removeStream(index);
    if (removed) {
      this.toast.show(`${removed} entfernt.`, 'info');
    }
  }

  moveStream(index: number, direction: -1 | 1): void {
    this.state.moveStream(index, direction);
  }

  setQuality(value: StreamQuality): void {
    this.state.setQuality(value);
  }

  setShowChat(value: boolean): void {
    this.state.setShowChat(value);
  }

  onShowChatChange(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLInputElement) {
      this.setShowChat(target.checked);
    }
  }

  formatStatisticLabel(item: StreamStatistic): string {
    return `${item.name} (${item.value})`;
  }

  private extractChannelName(value: string): string {
    return value.replace(/\s+\(\d+\)$/, '');
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
  }
}