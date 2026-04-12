import { Injectable, signal } from '@angular/core';

/**
 * Enumerates the supported toast variants.
 *
 * @remarks The type controls both visual styling and accessibility behavior. Error toasts should be announced more urgently than informational ones.
 */
export type ToastType = 'success' | 'error' | 'info';

/**
 * Represents one visible toast message instance.
 *
 * @property {number} id - Unique identifier for the toast message.
 * @property {string} text - Message text to display.
 * @property {ToastType} type - Toast variant, such as success, error, or info.
 * @property {number} count - Number of times this toast has been shown.
 * @remarks Matching messages are deduplicated by `text` and `type`. `count` records how many duplicate show requests were collapsed into the same visible toast.
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
 * @remarks Toasts are deduplicated, capped to a small visible stack, and removed automatically after a short lifetime. This keeps error reporting visible without letting repeated messages flood the UI.
 */
export class ToastService {
  private readonly _toastLifetimeMs = 3000;
  private readonly _maxVisibleToasts = 4;
  private _nextId = 1;
  private readonly _messages = signal<ToastMessage[]>([]);
  private readonly _removalTimers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();

  /** Read-only signal exposing the currently visible toast messages. */
  public readonly messages = this._messages.asReadonly();

  /**
   * Shows a toast or increments the counter for an existing matching message.
   *
   * @param {string} text - Message text to display.
   * @param {ToastType} [type] - Toast variant to display.
    * @remarks Toasts are deduplicated by the `(text, type)` pair. Duplicate calls increment `count` and reset the lifetime, while overflow removes the oldest visible toast before the new one is shown.
    * @returns {void}
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
   * @param {number} id - Unique identifier of the toast to remove.
    * @returns {void}
    * @remarks Called both by user dismissal and by timer expiry so timer cleanup is centralized in one place.
   */
  public remove(id: number): void {
    this._clearRemovalTimer(id);
    this._messages.update(items => items.filter(item => item.id !== id));
  }

  /**
   * Schedules automatic removal for a toast and replaces any existing timer.
   *
   * @param {number} id - Unique identifier of the toast to schedule removal for.
    * @returns {void}
    * @remarks Replacing the existing timer ensures duplicate toast updates extend the visible lifetime instead of expiring at the original deadline.
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
   * @param {number} id - Unique identifier of the toast whose timer should be cleared.
    * @returns {void}
    * @remarks This is used before explicit removal and before rescheduling so only one timer can exist for a given toast id.
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
