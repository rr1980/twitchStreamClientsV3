import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
/** Wraps localStorage access with browser guards and failure handling. */
export class StorageService {
  private readonly _platformId = inject(PLATFORM_ID);

  /** Returns the raw stored value for a key or null when unavailable. */
  public getItem(key: string): string | null {
    return this._read(storage => storage.getItem(key), null);
  }

  /** Checks whether a key is present in localStorage. */
  public hasKey(key: string): boolean {
    return this.getItem(key) !== null;
  }

  /** Reads a string value and falls back when the key is missing. */
  public getString(key: string, fallback: string): string {
    return this.getItem(key) ?? fallback;
  }

  /** Reads a boolean persisted as the strings true or false. */
  public getBoolean(key: string, fallback = false): boolean {
    const raw = this.getItem(key);

    if (raw === null) {
      return fallback;
    }

    return raw === 'true';
  }

  /** Parses JSON and returns the fallback when parsing or storage access fails. */
  public getJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  /** Persists a raw string value. */
  public setString(key: string, value: string): boolean {
    return this._write(storage => storage.setItem(key, value));
  }

  /** Persists a boolean as a string value. */
  public setBoolean(key: string, value: boolean): boolean {
    return this._write(storage => storage.setItem(key, String(value)));
  }

  /** Serializes a value as JSON and stores it under the given key. */
  public setJson<T>(key: string, value: T): boolean {
    return this._write(storage => storage.setItem(key, JSON.stringify(value)));
  }

  /** Removes a key from storage. */
  public remove(key: string): boolean {
    return this._write(storage => storage.removeItem(key));
  }

  private _read<T>(reader: (storage: Storage) => T, fallback: T): T {
    const storage = this._storage;

    if (!storage) {
      return fallback;
    }

    try {
      return reader(storage);
    } catch {
      return fallback;
    }
  }

  private _write(writer: (storage: Storage) => void): boolean {
    const storage = this._storage;

    if (!storage) {
      return false;
    }

    try {
      writer(storage);
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[Storage] localStorage quota exceeded – recent changes may not persist.');
      }

      return false;
    }
  }

  private get _storage(): Storage | null {
    if (!isPlatformBrowser(this._platformId)) {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}