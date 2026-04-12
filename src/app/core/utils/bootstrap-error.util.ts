/**
 * Normalizes and reports bootstrap failures before the app is interactive.
 *
 * @param {unknown} error Unknown error value raised during bootstrap.
 * @returns {void}
 */
export function reportBootstrapError(error: unknown): void {
  const normalizedError = normalizeBootstrapError(error);

  console.error('[BootstrapError]', normalizedError);
}

/**
 * Converts unknown bootstrap failures into a standard [`Error`](src/app/core/utils/bootstrap-error.util.ts:9) instance.
 *
 * @param {unknown} error Unknown error value raised during bootstrap.
 * @returns {Error} Normalized error instance for logging and propagation.
 */
function normalizeBootstrapError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error('Unknown bootstrap error', { cause: error });
}
