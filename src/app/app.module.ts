import { NgModule, CUSTOM_ELEMENTS_SCHEMA, LOCALE_ID, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { SiteModule } from './site/site.module';
import { CoreModule } from './core/core.module';
import { AppRoutingModule } from './app-routing.module';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { AtivacaoComponent } from './site/ativacao/ativacao.component'; // Importação correta do serviço
import { FormsModule } from '@angular/forms';
import { PaymentComponent } from './site/pages/payment/payment.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { ReactiveFormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './site/pages/interceptors/auth.interceptor';
import { NgChartsModule } from 'ng2-charts';
import { ContentComponent } from './site/pages/content/content.component';
import { ConfirmationService } from 'primeng/api';
import { ServiceWorkerModule } from '@angular/service-worker';
import { DashboardRevisaoComponent } from './core/components/dashboard-revisao/dashboard-revisao.component';




registerLocaleData(localePt, 'pt-BR'); 

@NgModule({
  declarations: [
    AppComponent,
    AtivacaoComponent,
    PaymentComponent,
    RecuperarSenhaComponent,
    ContentComponent,
    DashboardRevisaoComponent,
    
   
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    FormsModule,  
    CoreModule,
    SiteModule,
    NgChartsModule,
    ReactiveFormsModule,
    
    FormsModule,     
   
        ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })  

  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'pt-BR' }, 
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    ConfirmationService
   
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // Adicione isso
  bootstrap: [AppComponent],
  
})
export class AppModule { }