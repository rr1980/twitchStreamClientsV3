import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

import { AppErrorHandler } from './core/services/app-error-handler.service';
import { StreamStateService } from './core/services/stream-state.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
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
