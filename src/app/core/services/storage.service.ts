import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  getString(key: string, fallback: string): string {
    return localStorage.getItem(key) ?? fallback;
  }

  getBoolean(key: string, fallback = false): boolean {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }

    return raw === 'true';
  }

  getJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  setString(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  setBoolean(key: string, value: boolean): void {
    localStorage.setItem(key, String(value));
  }

  setJson<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }
}