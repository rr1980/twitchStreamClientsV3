import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
/**
 * Wraps localStorage access with browser guards and failure handling.
 *
 * @remarks
 * Provides safe access to browser localStorage, including error handling, platform checks, and typed convenience methods for string, boolean, and JSON values.
 */
export class StorageService {
  private readonly _platformId = inject(PLATFORM_ID);

  /**
   * Returns the raw stored value for a key or null when unavailable.
   *
   * @param key - The storage key to retrieve.
   * @returns The stored string value, or null if not found or unavailable.
   */
  public getItem(key: string): string | null {
    return this._read(storage => storage.getItem(key), null);
  }

  /**
   * Checks whether a key is present in localStorage.
   *
   * @param key - The storage key to check.
   * @returns True if the key exists, false otherwise.
   */
  public hasKey(key: string): boolean {
    return this.getItem(key) !== null;
  }

  /**
   * Reads a string value and falls back when the key is missing.
   *
   * @param key - The storage key to retrieve.
   * @param fallback - The fallback value if the key is missing.
   * @returns The stored string value, or the fallback if not found.
   */
  public getString(key: string, fallback: string): string {
    return this.getItem(key) ?? fallback;
  }

  /**
   * Reads a boolean persisted as the strings "true" or "false".
   *
   * @param key - The storage key to retrieve.
   * @param fallback - The fallback boolean value if the key is missing or invalid.
   * @returns The stored boolean value, or the fallback if not found.
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
   * @typeParam T - The expected type of the parsed value.
   * @param key - The storage key to retrieve.
   * @param fallback - The fallback value if parsing fails or the key is missing.
   * @returns The parsed value of type T, or the fallback if not found or invalid.
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
   * @param key - The storage key to set.
   * @param value - The string value to store.
   * @returns True if the value was successfully stored, false otherwise.
   */
  public setString(key: string, value: string): boolean {
    return this._write(storage => storage.setItem(key, value));
  }

  /**
   * Persists a boolean as a string value.
   *
   * @param key - The storage key to set.
   * @param value - The boolean value to store.
   * @returns True if the value was successfully stored, false otherwise.
   */
  public setBoolean(key: string, value: boolean): boolean {
    return this._write(storage => storage.setItem(key, String(value)));
  }

  /**
   * Serializes a value as JSON and stores it under the given key.
   *
   * @typeParam T - The type of the value to store.
   * @param key - The storage key to set.
   * @param value - The value to serialize and store.
   * @returns True if the value was successfully stored, false otherwise.
   */
  public setJson<T>(key: string, value: T): boolean {
    return this._write(storage => storage.setItem(key, JSON.stringify(value)));
  }

  /**
   * Removes a key from storage.
   *
   * @param key - The storage key to remove.
   * @returns True if the key was successfully removed, false otherwise.
   */
  public remove(key: string): boolean {
    return this._write(storage => storage.removeItem(key));
  }

  /**
   * Executes a read operation against localStorage with a fallback on failure.
   *
   * @typeParam T - The type of the value to read.
   * @param reader - The function to execute on the storage object.
   * @param fallback - The fallback value if storage is unavailable or the read fails.
   * @returns The result of the reader function, or the fallback value.
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
   * @param writer - The function to execute on the storage object.
   * @returns True if the write was successful, false otherwise.
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
   * @returns The localStorage object if available, or null otherwise.
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