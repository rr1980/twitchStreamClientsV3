import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { UrlTree } from '@angular/router';
import { vi } from 'vitest';
import { ListNavigationService } from './list-navigation.service';

describe('ListNavigationService', () => {
  let service: ListNavigationService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });

    service = TestBed.inject(ListNavigationService);
    router = TestBed.inject(Router);
  });

  it('navigates to canonical list routes for numeric and null ids', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.navigateToList(7);
    service.navigateToList(null);

    expect(navigateSpy).toHaveBeenNthCalledWith(1, ['/List', 7]);
    expect(navigateSpy).toHaveBeenNthCalledWith(2, ['/List', 'null']);
  });

  it('reads valid list ids and rejects invalid route variants', () => {
    expect(service.readListId('/List/7')).toBe(7);
    expect(service.readListId('/list/001')).toBe(1);
    expect(service.readListId('/List/1/extra')).toBeNull();
    expect(service.readListId('/List/null')).toBeNull();
    expect(service.readListId('/List/-1')).toBeNull();
    expect(service.readListId('/List/0')).toBeNull();
    expect(service.readListId('/List/abc')).toBeNull();
    expect(service.readListId('/Streams/7')).toBeNull();
    expect(service.readListId('')).toBeNull();
  });

  it('keeps canonical urls unchanged and rewrites non-canonical ones', () => {
    expect(service.ensureCanonicalUrl('/List/7?layout=compact#stats')).toBe(true);

    const canonicalizedLowercase = service.ensureCanonicalUrl('/list/007?layout=compact#stats') as UrlTree;
    const canonicalizedNull = service.ensureCanonicalUrl('/list/null') as UrlTree;
    const canonicalizedMissingId = service.ensureCanonicalUrl('/list') as UrlTree;
    const canonicalizedFallback = service.ensureCanonicalUrl('/Streams/abc?layout=compact#stats') as UrlTree;

    expect(router.serializeUrl(canonicalizedLowercase)).toBe('/List/7?layout=compact#stats');
    expect(router.serializeUrl(canonicalizedNull)).toBe('/List/null');
    expect(router.serializeUrl(canonicalizedMissingId)).toBe('/List/null');
    expect(router.serializeUrl(canonicalizedFallback)).toBe('/List/null?layout=compact#stats');
  });

  it('parses direct list-id values and url trees across edge cases', () => {
    const parseListId = ((service as unknown as Record<string, unknown>)['_parseListId'] as (value: string | null) => number | null)
      .bind(service);
    const readListIdFromTree = ((service as unknown as Record<string, unknown>)['_readListIdFromTree'] as (value: UrlTree) => number | null)
      .bind(service);
    const getPrimarySegments = ((service as unknown as Record<string, unknown>)['_getPrimarySegments'] as (value: UrlTree) => string[])
      .bind(service);

    expect(parseListId(null)).toBeNull();
    expect(parseListId('0')).toBeNull();
    expect(parseListId('12')).toBe(12);
    expect(readListIdFromTree(router.parseUrl('/List/12'))).toBe(12);
    expect(readListIdFromTree(router.parseUrl('/List/null'))).toBeNull();
    expect(readListIdFromTree(router.parseUrl('/streams/12'))).toBeNull();
    expect(getPrimarySegments(router.parseUrl('/'))).toEqual([]);
  });
});