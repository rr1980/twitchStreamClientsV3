import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CanActivateFn } from '@angular/router';
import { vi } from 'vitest';
import { appConfig, appRoutes } from './app.config';
import { ListNavigationService } from './core/services/list-navigation.service';
import { StreamStateService } from './core/services/stream-state.service';
import { StreamGridComponent } from './features/stream-grid/stream-grid.component';

describe('appConfig', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lazy-loads the stream grid component for list routes', async () => {
    const component = await appRoutes[1]?.loadComponent?.();

    expect(component).toBe(StreamGridComponent);
  });

  it('normalizes list routes through the navigation guard', () => {
    const ensureCanonicalUrl = vi.fn().mockReturnValue(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: ListNavigationService, useValue: { ensureCanonicalUrl } },
      ],
    });

    const canActivate = appRoutes[1]?.canActivate?.[0] as CanActivateFn;
    const result = TestBed.runInInjectionContext(() => canActivate?.({} as never, { url: '/list/7' } as never));

    expect(ensureCanonicalUrl).toHaveBeenCalledWith('/list/7');
    expect(result).toBe(true);
  });

  it('initializes the stream state during app startup', async () => {
    const initialize = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        ...(appConfig.providers ?? []),
        { provide: StreamStateService, useValue: { initialize } },
      ],
    });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(initialize).toHaveBeenCalledTimes(1);
  });
});