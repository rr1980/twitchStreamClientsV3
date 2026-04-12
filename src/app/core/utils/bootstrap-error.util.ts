/**
 * Normalizes and reports bootstrap failures before the app is interactive.
 *
 * @param {unknown} error Unbekannter Fehlerwert aus dem Bootstrap-Prozess.
 * @returns {void}
 */
export function reportBootstrapError(error: unknown): void {
  const normalizedError = normalizeBootstrapError(error);

  console.error('[BootstrapError]', normalizedError);
}

/**
 * Converts unknown bootstrap failures into a standard [`Error`](src/app/core/utils/bootstrap-error.util.ts:9) instance.
 *
 * @param {unknown} error Unbekannter Fehlerwert aus dem Bootstrap-Prozess.
 * @returns {Error} Normalisierte Fehlerinstanz für Logging und Weitergabe.
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
