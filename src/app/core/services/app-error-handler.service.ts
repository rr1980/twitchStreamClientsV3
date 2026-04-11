import { Injectable, isDevMode, inject } from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import { ToastService } from '../../features/toast/toast.service';

@Injectable()
/** Converts unexpected runtime errors into consistent logging and user feedback. */
export class AppErrorHandler implements ErrorHandler {
  private readonly _toast = inject(ToastService);

  /** Reports the error and shows a generic toast outside of development mode. */
  public handleError(error: unknown): void {
    const normalizedError = this._normalizeError(error);

    console.error('[AppError]', normalizedError);

    if (!isDevMode()) {
      this._toast.show('Unerwarteter Fehler. Bitte versuche es erneut.', 'error');
    }
  }

  /** Converts unknown thrown values into a standard Error instance. */
  private _normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error('Unknown application error', { cause: error });
  }
}