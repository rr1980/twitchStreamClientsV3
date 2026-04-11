import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/** Renders the current toast stack exposed by the toast service. */
export class ToastContainerComponent {
  protected readonly _toastService = inject(ToastService);
}
