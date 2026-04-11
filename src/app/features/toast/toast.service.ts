import { Injectable, signal } from '@angular/core';

/** Enumerates the supported toast variants. */
export type ToastType = 'success' | 'error' | 'info';

/** Represents one visible toast message instance. */
export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
  count: number;
}

@Injectable({ providedIn: 'root' })
/** Manages toast creation, deduplication, visibility limits, and auto-dismiss. */
export class ToastService {
  private readonly _toastLifetimeMs = 3000;
  private readonly _maxVisibleToasts = 4;
  private _nextId = 1;
  private readonly _messages = signal<ToastMessage[]>([]);
  private readonly _removalTimers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();

  public readonly messages = this._messages.asReadonly();

  /** Shows a toast or increments the counter for an existing matching message. */
  public show(text: string, type: ToastType = 'success'): void {
    const duplicate = this._messages().find(message => message.text === text && message.type === type);

    if (duplicate) {
      this._messages.update(items =>
        items.map(item => item.id === duplicate.id
          ? { ...item, count: item.count + 1 }
          : item),
      );
      this._scheduleRemoval(duplicate.id);
      return;
    }

    const message: ToastMessage = {
      id: this._nextId++,
      text,
      type,
      count: 1,
    };

    this._messages.update(items => {
      const nextItems = [...items, message];

      if (nextItems.length <= this._maxVisibleToasts) {
        return nextItems;
      }

      const removedMessage = nextItems[0];
      this._clearRemovalTimer(removedMessage.id);

      return nextItems.slice(1);
    });

    this._scheduleRemoval(message.id);
  }

  /** Removes a toast immediately and clears its pending timer. */
  public remove(id: number): void {
    this._clearRemovalTimer(id);
    this._messages.update(items => items.filter(item => item.id !== id));
  }

  private _scheduleRemoval(id: number): void {
    this._clearRemovalTimer(id);

    const timeoutId = globalThis.setTimeout(() => {
      this._removalTimers.delete(id);
      this.remove(id);
    }, this._toastLifetimeMs);

    this._removalTimers.set(id, timeoutId);
  }

  private _clearRemovalTimer(id: number): void {
    const timeoutId = this._removalTimers.get(id);

    if (timeoutId === undefined) {
      return;
    }

    globalThis.clearTimeout(timeoutId);
    this._removalTimers.delete(id);
  }
}