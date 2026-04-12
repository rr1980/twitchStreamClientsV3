/**
 * Normalizes and reports bootstrap failures before the app is interactive.
 *
 * @param {unknown} error - Unknown error value raised during bootstrap.
 * @returns {void}
 * @remarks Called from the bootstrap catch handler before Angular has rendered the shell. It logs immediately because no toast or error boundary is guaranteed to exist yet.
 */
export function reportBootstrapError(error: unknown): void {
  const normalizedError = normalizeBootstrapError(error);

  console.error('[BootstrapError]', normalizedError);
}

/**
 * Converts unknown bootstrap failures into a standard [`Error`](src/app/core/utils/bootstrap-error.util.ts:9) instance.
 *
 * @param {unknown} error - Unknown error value raised during bootstrap.
 * @returns {Error} Normalized error instance for logging and propagation.
 * @remarks Preserves the original thrown value as `cause` when possible so bootstrap diagnostics are still available after normalization.
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
