import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ToastContainerComponent } from './toast-container.component';
import { ToastService } from './toast.service';
import type { ToastMessage } from './toast.service';

describe('ToastContainerComponent', () => {
  let fixture: ComponentFixture<ToastContainerComponent>;
  let toastService: MockToastService;

  beforeEach(async () => {
    toastService = new MockToastService();

    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
      providers: [
        { provide: ToastService, useValue: toastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ToastContainerComponent);
  });

  it('renders nothing when there are no messages', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('renders toast text, live regions and duplicate counters', () => {
    toastService.messages.set([
      { id: 1, text: 'Info Toast', type: 'info', count: 1 },
      { id: 2, text: 'Fehler Toast', type: 'error', count: 3 },
    ]);

    fixture.detectChanges();

    const toasts = Array.from(fixture.nativeElement.querySelectorAll('.toast')) as HTMLElement[];

    expect(toasts).toHaveLength(2);
    expect(toasts[0].getAttribute('role')).toBe('status');
    expect(toasts[0].getAttribute('aria-live')).toBe('polite');
    expect(toasts[1].getAttribute('role')).toBe('alert');
    expect(toasts[1].getAttribute('aria-live')).toBe('assertive');
    expect(toasts[1].querySelector('.toast__count')?.textContent?.trim()).toBe('×3');
  });
});

class MockToastService {
  public readonly messages = signal<ToastMessage[]>([]);
}