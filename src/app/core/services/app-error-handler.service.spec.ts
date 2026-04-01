import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from '../../features/toast/toast.service';
import { AppErrorHandler } from './app-error-handler.service';

describe('AppErrorHandler', () => {
  let handler: AppErrorHandler;
  let toast: MockToastService;

  beforeEach(() => {
    toast = new MockToastService();

    TestBed.configureTestingModule({
      providers: [
        AppErrorHandler,
        { provide: ToastService, useValue: toast },
      ],
    });

    handler = TestBed.inject(AppErrorHandler);
  });

  it('logs normalized errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    handler.handleError('kaputt');

    expect(consoleSpy).toHaveBeenCalledWith('[AppError]', expect.any(Error));

    consoleSpy.mockRestore();
  });
});

class MockToastService {
  readonly show = vi.fn();
}