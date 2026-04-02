import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly platformId = inject(PLATFORM_ID);

  getItem(key: string): string | null {
    return this.read(storage => storage.getItem(key), null);
  }

  hasKey(key: string): boolean {
    return this.getItem(key) !== null;
  }

  getString(key: string, fallback: string): string {
    return this.getItem(key) ?? fallback;
  }

  getBoolean(key: string, fallback = false): boolean {
    const raw = this.getItem(key);

    if (raw === null) {
      return fallback;
    }

    return raw === 'true';
  }

  getJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  setString(key: string, value: string): void {
    this.write(storage => storage.setItem(key, value));
  }

  setBoolean(key: string, value: boolean): void {
    this.write(storage => storage.setItem(key, String(value)));
  }

  setJson<T>(key: string, value: T): void {
    this.write(storage => storage.setItem(key, JSON.stringify(value)));
  }

  remove(key: string): void {
    this.write(storage => storage.removeItem(key));
  }

  private read<T>(reader: (storage: Storage) => T, fallback: T): T {
    const storage = this.storage;

    if (!storage) {
      return fallback;
    }

    try {
      return reader(storage);
    } catch {
      return fallback;
    }
  }

  private write(writer: (storage: Storage) => void): void {
    const storage = this.storage;

    if (!storage) {
      return;
    }

    try {
      writer(storage);
    } catch {
      // Ignore storage write failures and keep the app usable.
    }
  }

  private get storage(): Storage | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}