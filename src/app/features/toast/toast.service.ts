import { Injectable, signal } from '@angular/core';

/**
 * Enumerates the supported toast variants.
 *
 * @remarks Used to distinguish toast message types.
 */
export type ToastType = 'success' | 'error' | 'info';

/**
 * Represents one visible toast message instance.
 *
 * @property {number} id Unique identifier for the toast message.
 * @property {string} text Message text to display.
 * @property {ToastType} type Toast variant, such as success, error, or info.
 * @property {number} count Number of times this toast has been shown.
 */
export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
  count: number;
}

@Injectable({ providedIn: 'root' })
/**
 * Manages toast creation, deduplication, visibility limits, and auto-dismiss.
 *
 * @remarks Provides methods to show, remove, and manage toast messages globally.
 */
export class ToastService {
  private readonly _toastLifetimeMs = 3000;
  private readonly _maxVisibleToasts = 4;
  private _nextId = 1;
  private readonly _messages = signal<ToastMessage[]>([]);
  private readonly _removalTimers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();

  public readonly messages = this._messages.asReadonly();

  /**
   * Shows a toast or increments the counter for an existing matching message.
   *
   * @param {string} text Message text to display.
   * @param {ToastType} [type='success'] Toast variant to display.
   * @returns {void}
   * @remarks Duplicates increment the count and reset the timer.
   */
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

  /**
   * Removes a toast immediately and clears its pending timer.
   *
   * @param {number} id Unique identifier of the toast to remove.
   * @returns {void}
   */
  public remove(id: number): void {
    this._clearRemovalTimer(id);
    this._messages.update(items => items.filter(item => item.id !== id));
  }

  /**
   * Schedules automatic removal for a toast and replaces any existing timer.
   *
   * @param {number} id Unique identifier of the toast to schedule removal for.
   * @returns {void}
   * @private
   */
  private _scheduleRemoval(id: number): void {
    this._clearRemovalTimer(id);

    const timeoutId = globalThis.setTimeout(() => {
      this._removalTimers.delete(id);
      this.remove(id);
    }, this._toastLifetimeMs);

    this._removalTimers.set(id, timeoutId);
  }

  /**
   * Cancels and removes the timer associated with a toast id.
   *
   * @param {number} id Unique identifier of the toast whose timer should be cleared.
   * @returns {void}
   * @private
   */
  private _clearRemovalTimer(id: number): void {
    const timeoutId = this._removalTimers.get(id);

    if (timeoutId === undefined) {
      return;
    }

    globalThis.clearTimeout(timeoutId);
    this._removalTimers.delete(id);
  }
}
