import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PlanoProfissionalComponent } from './site/component/plano-profissional/plano-profissional.component';
import { PlanoEmpresarialComponent } from './site/component/plano-empresarial/plano-empresarial.component';
import { AdesaoPlanoComponent } from './site/component/adesao-plano/adesao-plano.component';
import { ConfiguradorComponent } from './site/component/configurador/configurador.component';
import { PoliticaPrivacidadeComponent } from './site/pages/politica-privacidade/politica-privacidade.component';
import { TermosDeUsoComponent } from './site/pages/termos-de-uso/termos-de-uso.component';
import { LoginSiteComponent } from './site/pages/auth/login-site/login-site.component';
import { AreaUsuarioComponent } from './site/pages/area-usuario/area-usuario.component';
import { RegisterComponent } from './site/component/register/register.component';
import { AuthGuard } from './site/guards/auth.guard'; 
import { PaymentComponent } from './site/pages/payment/payment.component';
import { RedefinirSenhaComponent } from './site/pages/auth/redefinir-senha/redefinir-senha.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { RedefinirSenhaSiteComponent } from './site/component/redefinir-senha-site/redefinir-senha-site.component';
import { AssineComponent } from './site/pages/assine/assine.component';
import { AtivacaoComponent } from './ativacao/ativacao.component';
import { MenuComponent } from './core/components/menu/menu.component';
import { ContentComponent } from './site/pages/content/content.component';
import { InicioComponent } from './site/pages/inicio/inicio.component';

import { EmpresaCadastroComponent } from './core/components/empresa-cadastro/empresa-cadastro.component';
import { ConfiguracaoOsComponent } from './core/components/proposta-os/configuracao-os/configuracao-os.component';

import { TopicoRevisaoComponent } from './features/revisao/topico-revisao/topico-revisao.component';
import { MateriaEstudoComponent } from './features/materias/materia-estudo/materia-estudo.component';
import { ProvaEstudoComponent } from './features/revisao/prova-estudo/prova-estudo.component';
import { EditalVerticalizadoComponent } from './features/topico-edital/edital-verticalizado/edital-verticalizado.component';
import { EditalEstudoComponent } from './area-restrita/estudos/edital-estudo/edital-estudo.component';




const routes: Routes = [
{ path: 'ativacao', component: AtivacaoComponent }, 

{ path: 'adesao/profissional', component: PlanoProfissionalComponent },
{ path: 'adesao/empresarial', component: PlanoEmpresarialComponent },
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
             children: [
                        { path: '', redirectTo: 'home', pathMatch: 'full' }, // 👈 ESSENCIAL!
                        
                         
                        
                          { path: 'configuracao-os', component: ConfiguracaoOsComponent },
                         { path: 'meu-cadastro', component: EmpresaCadastroComponent },
         
    ] 

           },
         
          { path: 'redefinir-senha-site', component: RedefinirSenhaSiteComponent },
          { path: 'menu', component: MenuComponent }, 
          { path: 'materias', component: TopicoRevisaoComponent } ,  
          { path: 'cad-materias', component: MateriaEstudoComponent }  ,
          { path: 'cad-prova', component: ProvaEstudoComponent }  ,
          { path: 'edital-verticalizado', component: EditalVerticalizadoComponent }  ,
          { path: 'meu-cadastro', component: EmpresaCadastroComponent },
          { path: 'provas/:provaId/edital',component: EditalEstudoComponent},
           
     
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
