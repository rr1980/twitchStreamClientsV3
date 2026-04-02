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
      { id: 1, text: 'Erster Toast', type: 'success', count: 1 },
      { id: 2, text: 'Zweiter Toast', type: 'info', count: 1 },
    ]);
  });

  it('removes messages automatically after three seconds', () => {
    service.show('Kurze Nachricht');

    expect(service.messages()).toHaveLength(1);

    vi.advanceTimersByTime(3000);

    expect(service.messages()).toHaveLength(0);
  });

  it('coalesces duplicate messages and refreshes their lifetime', () => {
    service.show('Doppelte Meldung', 'error');
    vi.advanceTimersByTime(2000);

    service.show('Doppelte Meldung', 'error');

    expect(service.messages()).toEqual([
      { id: 1, text: 'Doppelte Meldung', type: 'error', count: 2 },
    ]);

    vi.advanceTimersByTime(1500);
    expect(service.messages()).toHaveLength(1);

    vi.advanceTimersByTime(1500);
    expect(service.messages()).toHaveLength(0);
  });

  it('increments only the matching duplicate toast when other messages are present', () => {
    service.show('Erste Meldung', 'error');
    service.show('Zweite Meldung', 'info');

    service.show('Erste Meldung', 'error');

    expect(service.messages()).toEqual([
      { id: 1, text: 'Erste Meldung', type: 'error', count: 2 },
      { id: 2, text: 'Zweite Meldung', type: 'info', count: 1 },
    ]);
  });

  it('limits the number of visible toasts to the newest four', () => {
    service.show('Toast 1');
    service.show('Toast 2');
    service.show('Toast 3');
    service.show('Toast 4');
    service.show('Toast 5');

    expect(service.messages().map(message => message.text)).toEqual([
      'Toast 2',
      'Toast 3',
      'Toast 4',
      'Toast 5',
    ]);
  });
});