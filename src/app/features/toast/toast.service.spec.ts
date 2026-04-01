import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds messages with incrementing ids', () => {
    service.show('Erster Toast');
    service.show('Zweiter Toast', 'info');

    expect(service.messages()).toEqual([
      { id: 1, text: 'Erster Toast', type: 'success' },
      { id: 2, text: 'Zweiter Toast', type: 'info' },
    ]);
  });

  it('removes messages automatically after three seconds', () => {
    service.show('Kurze Nachricht');

    expect(service.messages()).toHaveLength(1);

    vi.advanceTimersByTime(3000);

    expect(service.messages()).toHaveLength(0);
  });
});