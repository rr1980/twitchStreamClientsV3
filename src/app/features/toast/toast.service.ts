import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly _messages = signal<ToastMessage[]>([]);

  readonly messages = this._messages.asReadonly();

  show(text: string, type: ToastType = 'success'): void {
    const message: ToastMessage = {
      id: this.nextId++,
      text,
      type,
    };

    this._messages.update(items => [...items, message]);

    window.setTimeout(() => {
      this.remove(message.id);
    }, 3000);
  }

  remove(id: number): void {
    this._messages.update(items => items.filter(item => item.id !== id));
  }
}