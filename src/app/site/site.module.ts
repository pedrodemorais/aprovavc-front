import { NgModule} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfiguradorComponent } from './pages/configurador/configurador.component';
import { HomeComponent } from './pages/home/home.component';
import { AdesaoPlanoComponent } from './pages/adesao-plano/adesao-plano.component';
import { PoliticaPrivacidadeComponent } from './pages/politica-privacidade/politica-privacidade.component';
import { TermosDeUsoComponent } from './pages/termos-de-uso/termos-de-uso.component';
import { RouterModule } from '@angular/router';
import { LoginSiteComponent } from './pages/auth/login-site/login-site.component';
import { RegisterComponent } from './pages/register/register.component';
import { AreaUsuarioComponent } from './pages/area-usuario/area-usuario.component';
// Módulos do PrimeNG

import { FormsModule,ReactiveFormsModule } from '@angular/forms'; // Importação necessária para ngModel
import { MenubarModule } from 'primeng/menubar'; // Menu superior
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { AuthService } from './services/auth.service';
import { FullWidthSliderComponent } from './pages/full-width-slider/full-width-slider.component';
import { ManualComponent } from './pages/manual/manual.component';
import { RedefinirSenhaComponent } from './pages/auth/redefinir-senha/redefinir-senha.component';
import { AuthInterceptor } from './pages/interceptors/auth.interceptor';
import { RedefinirSenhaSiteComponent } from './pages/redefinir-senha-site/redefinir-senha-site.component';
import { AssineComponent } from './pages/assine/assine.component';
import { NgxMaskModule } from 'ngx-mask';
import { NotificationService } from './services/notification.service';
import { InicioComponent } from './pages/inicio/inicio.component';
import { PanelMenuModule } from 'primeng/panelmenu';


@NgModule({
  declarations: [
     ConfiguradorComponent,
     InicioComponent,
     HomeComponent,
     AdesaoPlanoComponent,
     PoliticaPrivacidadeComponent,
     TermosDeUsoComponent,
     LoginSiteComponent,
     RegisterComponent,
     AreaUsuarioComponent,
     FullWidthSliderComponent,
     ManualComponent,
     RedefinirSenhaComponent,
     RedefinirSenhaSiteComponent,
     AssineComponent,
    
    
  
    
  ],
  imports: [
        MenubarModule,
        ReactiveFormsModule, // Adicione aqui
        FormsModule, // Certifique-se de adicionar aqui
        CommonModule,
        RouterModule,
        HttpClientModule,
        PanelMenuModule,
        NgxMaskModule.forRoot() // ✅ Configuração correta para versões antigas
    
      
          
        
  ],
   providers: [AuthService,NotificationService,
   
      { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
    ],
    exports: [RedefinirSenhaSiteComponent]
})
export class SiteModule { }
