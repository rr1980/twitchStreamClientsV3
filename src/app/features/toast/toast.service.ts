import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastLifetimeMs = 3000;
  private readonly maxVisibleToasts = 4;
  private nextId = 1;
  private readonly _messages = signal<ToastMessage[]>([]);
  private readonly removalTimers = new Map<number, number>();

  public readonly messages = this._messages.asReadonly();

  public show(text: string, type: ToastType = 'success'): void {
    const duplicate = this._messages().find(message => message.text === text && message.type === type);

    if (duplicate) {
      this._messages.update(items =>
        items.map(item => item.id === duplicate.id
          ? { ...item, count: item.count + 1 }
          : item),
      );
      this.scheduleRemoval(duplicate.id);
      return;
    }

    const message: ToastMessage = {
      id: this.nextId++,
      text,
      type,
      count: 1,
    };

    this._messages.update(items => {
      const nextItems = [...items, message];

      if (nextItems.length <= this.maxVisibleToasts) {
        return nextItems;
      }

      const removedMessage = nextItems[0];
      this.clearRemovalTimer(removedMessage.id);

      return nextItems.slice(1);
    });

    this.scheduleRemoval(message.id);
  }

  public remove(id: number): void {
    this.clearRemovalTimer(id);
    this._messages.update(items => items.filter(item => item.id !== id));
  }

  private scheduleRemoval(id: number): void {
    this.clearRemovalTimer(id);

    const timeoutId = window.setTimeout(() => {
      this.removalTimers.delete(id);
      this.remove(id);
    }, this.toastLifetimeMs);

    this.removalTimers.set(id, timeoutId);
  }

  private clearRemovalTimer(id: number): void {
    const timeoutId = this.removalTimers.get(id);

    if (timeoutId === undefined) {
      return;
    }

    window.clearTimeout(timeoutId);
    this.removalTimers.delete(id);
  }
}