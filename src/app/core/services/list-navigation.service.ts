import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ListNavigationService {
  public syncLocationToListHash(): number | null {
    const listId = this._parseListId(window.location.hash);
    const normalizedHash = this._buildListHash(listId);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }

    return listId;
  }

  public navigateToList(listId: number | null): void {
    const normalizedHash = this._buildListHash(listId);

    if (window.location.hash !== normalizedHash) {
      window.location.hash = normalizedHash;
    }
  }

  private _parseListId(hash: string): number | null {
    const match = this._normalizeHash(hash).match(/^#\/List\/(.+)$/);
    const rawListId = match?.[1] ?? 'null';

    if (rawListId === 'null') {
      return null;
    }

    const parsed = Number(rawListId);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private _normalizeHash(hash: string): string {
    const trimmedHash = hash.trim();
    const match = trimmedHash.match(/^#\/([^/]+)\/(.+)$/);

    if (!match) {
      return '#/List/null';
    }

    const [, routeSegment, rawListId] = match;

    if (routeSegment.toLocaleLowerCase() !== 'list') {
      return '#/List/null';
    }

    if (rawListId === 'null') {
      return '#/List/null';
    }

    if (!/^\d+$/.test(rawListId)) {
      return '#/List/null';
    }

    const parsed = Number(rawListId);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return '#/List/null';
    }

    return `#/List/${parsed}`;
  }

  private _buildListHash(listId: number | null): string {
    return `#/List/${listId ?? 'null'}`;
  }
}