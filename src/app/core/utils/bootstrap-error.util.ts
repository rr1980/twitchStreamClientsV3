/** Normalizes and reports bootstrap failures before the app is interactive. */
export function reportBootstrapError(error: unknown): void {
  const normalizedError = normalizeBootstrapError(error);

  console.error('[BootstrapError]', normalizedError);
}

function normalizeBootstrapError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error('Unknown bootstrap error', { cause: error });
}