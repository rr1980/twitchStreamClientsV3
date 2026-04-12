import { ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig, Type } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import type { CanActivateFn, Routes } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { ListNavigationService } from './core/services/list-navigation.service';
import { AppErrorHandler } from './core/services/app-error-handler.service';
import { StreamStateService } from './core/services/stream-state.service';

/**
 * Lazy-loads the stream grid route component.
 *
 * @returns Promise resolving to the [`StreamGridComponent`](src/app/features/stream-grid/stream-grid.component.ts:54) type.
 */
const loadStreamGridComponent = (): Promise<Type<unknown>> => import('./features/stream-grid/stream-grid.component')
  .then(module => module.StreamGridComponent);

/**
 * Redirects list routes to the canonical `/List/:listId` shape.
 *
 * @param _route - Activated route snapshot, unused by the guard.
 * @param state - Router state snapshot.
 * @returns `true` when the URL is already canonical, otherwise a redirect tree.
 * @remarks Keeps list navigation normalized to the hash-based `#/List/:listId` format.
 */
const normalizeListRoute: CanActivateFn = (_route, state) => inject(ListNavigationService).ensureCanonicalUrl(state.url);

/**
 * Defines the public route table for the application shell.
 *
 * @remarks Contains all main routes and fallback redirects.
 */
export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'List/null',
  },
  {
    path: 'List/:listId',
    canActivate: [normalizeListRoute],
    loadComponent: loadStreamGridComponent,
  },
  {
    path: 'list/:listId',
    canActivate: [normalizeListRoute],
    loadComponent: loadStreamGridComponent,
  },
  {
    path: '**',
    redirectTo: 'List/null',
  },
];

/**
 * Registers routing, error handling, service worker, and state initialization.
 *
 * @remarks Provides all global app providers and initializers.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    {
      provide: ErrorHandler,
      useClass: AppErrorHandler,
    },
    provideAppInitializer(() => {
      inject(StreamStateService).initialize();
    }),
  ],
};
