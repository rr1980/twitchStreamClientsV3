import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { reportBootstrapError } from './app/core/utils/bootstrap-error.util';

bootstrapApplication(App, appConfig).catch(reportBootstrapError);
