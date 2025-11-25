import { NgModule, CUSTOM_ELEMENTS_SCHEMA, LOCALE_ID, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { SiteModule } from './site/site.module';
import { CoreModule } from './core/core.module';
import { AppRoutingModule } from './app-routing.module';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { AtivacaoComponent } from './ativacao/ativacao.component'; // Importação correta do serviço
import { FormsModule } from '@angular/forms';
import { PaymentComponent } from './site/pages/payment/payment.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { ReactiveFormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './site/interceptors/auth.interceptor';
import { NgChartsModule } from 'ng2-charts';
import { MenuComponent } from './core/components/menu/menu.component';
import { ContentComponent } from './site/pages/content/content.component';
import { ConfirmationService } from 'primeng/api';
import { ServiceWorkerModule } from '@angular/service-worker';
import { ProdutoCadComponent } from './core/components/produto-cad/produto-cad.component';
import { TipoEquipamentoCadastroComponent } from './core/components/tipo-equipamento-cadastro/tipo-equipamento-cadastro.component';
import { TopicoRevisaoComponent } from './features/revisao/topico-revisao/topico-revisao.component';
import { MateriaEstudoComponent } from './features/materias/materia-estudo/materia-estudo.component';
import { ProvaEstudoComponent } from './features/revisao/prova-estudo/prova-estudo.component';
import { TopicoEditalCadastroComponent } from './features/topico-edital/topico-edital-cadastro/topico-edital-cadastro.component';
import { EditalVerticalizadoComponent } from './features/topico-edital/edital-verticalizado/edital-verticalizado.component';
import { EditalEstudoComponent } from './area-restrita/estudos/edital-estudo/edital-estudo.component';

registerLocaleData(localePt, 'pt-BR'); 

@NgModule({
  declarations: [
    AppComponent,
    AtivacaoComponent,
    PaymentComponent,
    RecuperarSenhaComponent,
    MenuComponent,
    ContentComponent,
    ProdutoCadComponent,
    TipoEquipamentoCadastroComponent,
    TopicoRevisaoComponent,
    MateriaEstudoComponent,
    ProvaEstudoComponent,
    TopicoEditalCadastroComponent,
    EditalVerticalizadoComponent,
    EditalEstudoComponent,
   
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    FormsModule,  
    CoreModule,
    SiteModule,
    NgChartsModule,
    ReactiveFormsModule,
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