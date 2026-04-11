import { Injectable, isDevMode, inject } from '@angular/core';
import type { ErrorHandler } from '@angular/core';
import { ToastService } from '../../features/toast/toast.service';

@Injectable()
/**
 * Converts unexpected runtime errors into consistent logging and user feedback.
 *
 * @remarks
 * Implements Angular's ErrorHandler to provide consistent error logging and user notification via toast messages.
 */
export class AppErrorHandler implements ErrorHandler {
  private readonly _toast = inject(ToastService);

  /**
   * Reports the error and shows a generic toast outside of development mode.
   *
   * @param error - The error object or value to handle.
   * @remarks
   * Logs the error to the console and shows a generic error toast in production mode.
   */
  public handleError(error: unknown): void {
    const normalizedError = this._normalizeError(error);

    console.error('[AppError]', normalizedError);

    if (!isDevMode()) {
      this._toast.show('Unerwarteter Fehler. Bitte versuche es erneut.', 'error');
    }
  }

  /**
   * Converts unknown thrown values into a standard Error instance.
   *
   * @param error - The error value to normalize.
   * @returns A standard Error instance representing the error.
   */
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