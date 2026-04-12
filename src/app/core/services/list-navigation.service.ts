import { Injectable, inject } from '@angular/core';
import { PRIMARY_OUTLET, Router } from '@angular/router';
import type { UrlTree } from '@angular/router';

@Injectable({ providedIn: 'root' })
/**
 * Encapsulates list URL creation, parsing, and canonicalization.
 *
 * @remarks Provides methods for navigating to list routes, parsing list ids from URLs, and enforcing canonical list URL formats.
 */
export class ListNavigationService {
  private readonly _router = inject(Router);

  /**
   * Navigates to the canonical hash route for a given list id.
   *
   * @param {number | null} listId - List id to navigate to, or `null` for the default route.
    * @returns {void}
   */
  public navigateToList(listId: number | null): void {
    void this._router.navigate(['/List', listId ?? 'null']);
  }

  /**
   * Reads the list id from an arbitrary URL and returns null for invalid routes.
   *
   * @param {string} url - URL string to parse for a list id.
   * @returns {number | null} Parsed list id, or `null` when the URL is invalid.
   */
  public readListId(url: string): number | null {
    const segments = this._getPrimarySegments(this._router.parseUrl(url || '/'));

    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'list') {
      return null;
    }

    return this._parseListId(segments[1] ?? null);
  }

  /**
   * Rewrites non-canonical list URLs while preserving query params and fragments.
   *
   * @param {string} url - URL string to check and canonicalize.
   * @returns {true | UrlTree} `true` when the URL is already canonical, otherwise a canonical [`UrlTree`](src/app/core/services/list-navigation.service.ts:3).
   */
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

  /**
   * Extracts the list id from an already parsed UrlTree.
   *
   * @param {UrlTree} urlTree - Parsed [`UrlTree`](src/app/core/services/list-navigation.service.ts:3) instance.
   * @returns {number | null} Parsed list id, or `null` when the tree does not represent a valid list route.
   */
  private _readListIdFromTree(urlTree: UrlTree): number | null {
    const segments = this._getPrimarySegments(urlTree);

    if (segments.length !== 2 || segments[0]?.toLowerCase() !== 'list') {
      return null;
    }

    return this._parseListId(segments[1] ?? null);
  }

  /**
   * Parses a raw route segment into a valid positive list id or null.
   *
   * @param {string | null} rawListId - Raw list id string from the route segment.
   * @returns {number | null} Parsed positive list id, or `null` when invalid.
   */
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

  /**
   * Returns the primary outlet path segments for a parsed URL.
   *
   * @param {UrlTree} urlTree - Parsed [`UrlTree`](src/app/core/services/list-navigation.service.ts:3) instance.
   * @returns {string[]} Array of path segments for the primary outlet.
   */
  private _getPrimarySegments(urlTree: UrlTree): string[] {
    return urlTree.root.children[PRIMARY_OUTLET]?.segments.map(segment => segment.path) ?? [];
  }
}
