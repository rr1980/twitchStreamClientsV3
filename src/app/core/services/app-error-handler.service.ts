import { Injectable, isDevMode, inject } from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import { ToastService } from '../../features/toast/toast.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly toast = inject(ToastService);

  public handleError(error: unknown): void {
    const normalizedError = this.normalizeError(error);

    console.error('[AppError]', normalizedError);

    if (!isDevMode()) {
      this.toast.show('Unerwarteter Fehler. Bitte versuche es erneut.', 'error');
    }
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error('Unknown application error', { cause: error });
  }
}