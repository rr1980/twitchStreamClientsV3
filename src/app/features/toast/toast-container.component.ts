import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Renders the current toast stack exposed by the toast service.
 *
 * @remarks The component reads its state exclusively from [`ToastService`](src/app/features/toast/toast.service.ts).
 */
export class ToastContainerComponent {
  protected readonly _toastService = inject(ToastService);
}
