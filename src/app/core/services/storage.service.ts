import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
/**
 * Wraps localStorage access with browser guards and failure handling.
 *
 * @remarks Provides safe access to browser localStorage, including error handling, platform checks, and typed convenience helpers for string, boolean, and JSON values.
 */
export class StorageService {
  private readonly _platformId = inject(PLATFORM_ID);

  /**
   * Returns the raw stored value for a key or null when unavailable.
   *
   * @param {string} key Storage key to retrieve.
   * @returns {string | null} Stored string value, or `null` when unavailable.
   */
  public getItem(key: string): string | null {
    return this._read(storage => storage.getItem(key), null);
  }

  /**
   * Checks whether a key is present in localStorage.
   *
   * @param {string} key Storage key to check.
   * @returns {boolean} `true` when the key exists.
   */
  public hasKey(key: string): boolean {
    return this.getItem(key) !== null;
  }

  /**
   * Reads a string value and falls back when the key is missing.
   *
   * @param {string} key Storage key to retrieve.
   * @param {string} fallback Fallback value used when the key is missing.
   * @returns {string} Stored string value, or the fallback when not found.
   */
  public getString(key: string, fallback: string): string {
    return this.getItem(key) ?? fallback;
  }

  /**
   * Reads a boolean persisted as the strings "true" or "false".
   *
   * @param {string} key Storage key to retrieve.
   * @param {boolean} [fallback=false] Fallback boolean value used when the key is missing or invalid.
   * @returns {boolean} Stored boolean value, or the fallback when not found.
   */
  public getBoolean(key: string, fallback = false): boolean {
    const raw = this.getItem(key);

    if (raw === null) {
      return fallback;
    }

    return raw === 'true';
  }

  /**
   * Parses JSON and returns the fallback when parsing or storage access fails.
   *
   * @typeParam T Expected type of the parsed value.
   * @param {string} key Storage key to retrieve.
   * @param {T} fallback Fallback value used when parsing fails or the key is missing.
   * @returns {T} Parsed value of type `T`, or the fallback when the stored value is unavailable or invalid.
   */
  public getJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Persists a raw string value.
   *
   * @param {string} key Storage key to set.
   * @param {string} value String value to store.
   * @returns {boolean} `true` when the value was stored successfully.
   */
  public setString(key: string, value: string): boolean {
    return this._write(storage => storage.setItem(key, value));
  }

  /**
   * Persists a boolean as a string value.
   *
   * @param {string} key Storage key to set.
   * @param {boolean} value Boolean value to store.
   * @returns {boolean} `true` when the value was stored successfully.
   */
  public setBoolean(key: string, value: boolean): boolean {
    return this._write(storage => storage.setItem(key, String(value)));
  }

  /**
   * Serializes a value as JSON and stores it under the given key.
   *
   * @typeParam T Type of the value to store.
   * @param {string} key Storage key to set.
   * @param {T} value Value to serialize and store.
   * @returns {boolean} `true` when the value was stored successfully.
   */
  public setJson<T>(key: string, value: T): boolean {
    return this._write(storage => storage.setItem(key, JSON.stringify(value)));
  }

  /**
   * Removes a key from storage.
   *
   * @param {string} key Storage key to remove.
   * @returns {boolean} `true` when the key was removed successfully.
   */
  public remove(key: string): boolean {
    return this._write(storage => storage.removeItem(key));
  }

  /**
   * Executes a read operation against localStorage with a fallback on failure.
   *
   * @typeParam T Type of the value to read.
   * @param {(storage: Storage) => T} reader Function to execute on the storage object.
   * @param {T} fallback Fallback value used when storage is unavailable or the read fails.
   * @returns {T} Result of the reader function, or the fallback value.
   */
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

  /**
   * Executes a write operation against localStorage and reports write failures.
   *
   * @param {(storage: Storage) => void} writer Function to execute on the storage object.
   * @returns {boolean} `true` when the write was successful.
   * @remarks Logs quota failures and silently reports all storage write failures as `false`.
   */
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

  /**
   * Resolves the browser localStorage instance when the environment allows it.
   *
   * @returns {Storage | null} Browser localStorage object, or `null` when unavailable.
   */
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
