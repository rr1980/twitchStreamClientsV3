import { vi } from 'vitest';
import { reportBootstrapError } from './bootstrap-error.util';

describe('reportBootstrapError', () => {
  it('logs normalized bootstrap errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportBootstrapError('bootstrap failed');

    expect(consoleSpy).toHaveBeenCalledWith('[BootstrapError]', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('logs existing Error instances unchanged', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('known bootstrap error');

    reportBootstrapError(error);

    expect(consoleSpy).toHaveBeenCalledWith('[BootstrapError]', error);

    consoleSpy.mockRestore();
  });

  it('normalizes unknown bootstrap payloads into Error instances', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportBootstrapError({ reason: 'kaputt' });

    expect(consoleSpy).toHaveBeenCalledWith('[BootstrapError]', expect.any(Error));

    consoleSpy.mockRestore();
  });
});