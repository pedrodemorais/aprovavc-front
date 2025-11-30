import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdesaoPlanoComponent } from './site/pages/adesao-plano/adesao-plano.component';
import { ConfiguradorComponent } from './site/pages/configurador/configurador.component';
import { PoliticaPrivacidadeComponent } from './site/pages/politica-privacidade/politica-privacidade.component';
import { TermosDeUsoComponent } from './site/pages/termos-de-uso/termos-de-uso.component';
import { LoginSiteComponent } from './site/pages/auth/login-site/login-site.component';
import { AreaUsuarioComponent } from './site/pages/area-usuario/area-usuario.component';
import { RegisterComponent } from './site/pages/register/register.component';
import { AuthGuard } from './site/pages/guards/auth.guard';
import { PaymentComponent } from './site/pages/payment/payment.component';
import { RedefinirSenhaComponent } from './site/pages/auth/redefinir-senha/redefinir-senha.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { RedefinirSenhaSiteComponent } from './site/pages/redefinir-senha-site/redefinir-senha-site.component';
import { AssineComponent } from './site/pages/assine/assine.component';
import { AtivacaoComponent } from './site/ativacao/ativacao.component';
import { ContentComponent } from './site/pages/content/content.component';
import { InicioComponent } from './site/pages/inicio/inicio.component';

import { EmpresaCadastroComponent } from './site/pages/empresa-cadastro/empresa-cadastro.component';
import { MateriaCadastroComponent } from './core/pages/materias/materia-cadastro/materia-cadastro.component';





const routes: Routes = [
{ path: 'ativacao', component: AtivacaoComponent }, 

{ path: 'adesao', component: AdesaoPlanoComponent },
{ path: 'configurador', component: ConfiguradorComponent },
{ path: 'politica-privacidade', component: PoliticaPrivacidadeComponent },
{ path: 'termos-de-uso', component: TermosDeUsoComponent},
{ path: 'home', component: InicioComponent }, 
{ path: 'login', component: LoginSiteComponent },    
{ path: 'area-restrita', component: AreaUsuarioComponent,  canActivate: [AuthGuard],
    children: [
          { path: '', redirectTo: 'home', pathMatch: 'full' }, // 👈 ESSENCIAL!
          { path: 'content', component: ContentComponent,
             children: [{ path: '', redirectTo: 'home', pathMatch: 'full' }, // 👈 ESSENCIAL!
                        
         
    ] 

           },
         
          { path: 'redefinir-senha-site', component: RedefinirSenhaSiteComponent },
 { path: 'cad-materias', component: MateriaCadastroComponent },
          { path: 'meu-cadastro', component: EmpresaCadastroComponent },
           
     
    ] 

   },   
  { path: 'register', component: RegisterComponent },    
  { path: 'pagamento', component: PaymentComponent }, 
  { path: 'recuperar-senha', component: RecuperarSenhaComponent },
  { path: 'redefinir-senha', component: RedefinirSenhaComponent },
  { path: 'assine', component: AssineComponent },
  { path: '**', redirectTo: 'home', pathMatch: 'full' }

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
