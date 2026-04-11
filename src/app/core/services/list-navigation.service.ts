import { Injectable, inject } from '@angular/core';
import { PRIMARY_OUTLET, Router } from '@angular/router';
import type { UrlTree } from '@angular/router';

@Injectable({ providedIn: 'root' })
/** Encapsulates list URL creation, parsing, and canonicalization. */
export class ListNavigationService {
  private readonly _router = inject(Router);

  /** Navigates to the canonical hash route for a given list id. */
  public navigateToList(listId: number | null): void {
    void this._router.navigate(['/List', listId ?? 'null']);
  }

  /** Reads the list id from an arbitrary URL and returns null for invalid routes. */
  public readListId(url: string): number | null {
    const segments = this._getPrimarySegments(this._router.parseUrl(url || '/'));

    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'list') {
      return null;
    }

    return this._parseListId(segments[1] ?? null);
  }

  /** Rewrites non-canonical list URLs while preserving query params and fragments. */
  public ensureCanonicalUrl(url: string): true | UrlTree {
    const currentUrlTree = this._router.parseUrl(url || '/');
    const canonicalUrlTree = this._router.createUrlTree(
      ['/List', this._readListIdFromTree(currentUrlTree) ?? 'null'],
      {
        queryParams: currentUrlTree.queryParams,
        fragment: currentUrlTree.fragment ?? undefined,
      },
    );

    return this._router.serializeUrl(currentUrlTree) === this._router.serializeUrl(canonicalUrlTree)
      ? true
      : canonicalUrlTree;
  }

  private _readListIdFromTree(urlTree: UrlTree): number | null {
    const segments = this._getPrimarySegments(urlTree);

    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'list') {
      return null;
    }

    return this._parseListId(segments[1] ?? null);
  }

  private _parseListId(rawListId: string | null): number | null {
    if (rawListId === 'null') {
      return null;
    }

    if (!rawListId || !/^\d+$/.test(rawListId)) {
      return null;
    }

    const parsed = Number(rawListId);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private _getPrimarySegments(urlTree: UrlTree): string[] {
    return urlTree.root.children[PRIMARY_OUTLET]?.segments.map(segment => segment.path) ?? [];
  }
}