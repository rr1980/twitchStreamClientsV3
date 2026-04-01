import { vi } from 'vitest';
import { reportBootstrapError } from './bootstrap-error.util';

describe('reportBootstrapError', () => {
  it('logs normalized bootstrap errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reportBootstrapError('bootstrap failed');

    expect(consoleSpy).toHaveBeenCalledWith('[BootstrapError]', expect.any(Error));

    consoleSpy.mockRestore();
  });
});