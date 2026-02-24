import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import 'chart.js/auto';

import { AppModule } from './app/app.module';


platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
