import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly _platformId = inject(PLATFORM_ID);

  public getItem(key: string): string | null {
    return this._read(storage => storage.getItem(key), null);
  }

  public hasKey(key: string): boolean {
    return this.getItem(key) !== null;
  }

  public getString(key: string, fallback: string): string {
    return this.getItem(key) ?? fallback;
  }

  public getBoolean(key: string, fallback = false): boolean {
    const raw = this.getItem(key);

    if (raw === null) {
      return fallback;
    }

    return raw === 'true';
  }

  public getJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  public setString(key: string, value: string): boolean {
    return this._write(storage => storage.setItem(key, value));
  }

  public setBoolean(key: string, value: boolean): boolean {
    return this._write(storage => storage.setItem(key, String(value)));
  }

  public setJson<T>(key: string, value: T): boolean {
    return this._write(storage => storage.setItem(key, JSON.stringify(value)));
  }

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