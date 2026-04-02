import { ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig, Type } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import type { CanActivateFn, Routes } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { ListNavigationService } from './core/services/list-navigation.service';
import { AppErrorHandler } from './core/services/app-error-handler.service';
import { StreamStateService } from './core/services/stream-state.service';

const loadStreamGridComponent = (): Promise<Type<unknown>> => import('./features/stream-grid/stream-grid.component')
  .then(module => module.StreamGridComponent);

const normalizeListRoute: CanActivateFn = (_route, state) => inject(ListNavigationService).ensureCanonicalUrl(state.url);

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
