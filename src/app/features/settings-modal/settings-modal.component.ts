import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StreamQuality } from '../../core/models/app-settings.model';
import { StreamStateService } from '../../core/services/stream-state.service';
import { ToastService } from '../toast/toast.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent {
  private readonly state = inject(StreamStateService);
  private readonly toast = inject(ToastService);

  @ViewChild('streamInput')
  streamInput?: ElementRef<HTMLInputElement>;

  readonly qualityOptions: StreamQuality[] = ['auto', '480p', '720p60', 'chunked'];
  newChannelName = '';

  get isOpen(): boolean {
    return this.state.menuOpen();
  }

  get streams(): string[] {
    return this.state.streams();
  }

  get selectedQuality(): StreamQuality {
    return this.state.quality();
  }

  get showChat(): boolean {
    return this.state.showChat();
  }

  get topStatistics(): string[] {
    return this.state.getTopStatistics(10).map(item => item.name);
  }

  close(): void {
    this.state.closeMenu();
  }

  addStream(): void {
    const result = this.state.addStream(this.newChannelName);

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
    this.newChannelName = '';
    this.streamInput?.nativeElement.focus();
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
}