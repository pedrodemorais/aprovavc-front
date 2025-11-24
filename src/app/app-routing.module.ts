import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PaginainicialComponent } from './site/pages/paginainicial/paginainicial.component';

import { PlanoBasicoComponent } from './site/component/plano-basico/plano-basico.component';
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
import { ManualComponent } from './site/pages/manual/manual.component';
import { RedefinirSenhaComponent } from './site/pages/auth/redefinir-senha/redefinir-senha.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { RedefinirSenhaSiteComponent } from './site/component/redefinir-senha-site/redefinir-senha-site.component';
import { AssineComponent } from './site/pages/assine/assine.component';
import { AtivacaoComponent } from './ativacao/ativacao.component';
import { HomeComponent } from './site/component/home/home.component';
import { ClienteCadastroComponent } from './core/components/cliente-cadastro/cliente-cadastro.component';
import { MenuComponent } from './core/components/menu/menu.component';
import { ContentComponent } from './site/pages/content/content.component';
import { InicioComponent } from './site/pages/inicio/inicio.component';
import { PropostaOsComponent } from './core/components/proposta-os/proposta-os.component';
import { EmpresaCadastroComponent } from './core/components/empresa-cadastro/empresa-cadastro.component';
import { ConfiguracaoOsComponent } from './core/components/proposta-os/configuracao-os/configuracao-os.component';
import { ProdutoCadastroComponent } from './core/components/produto-cadastro/produto-cadastro.component';
import { CategoriaCadastroComponent } from './core/components/categoria-cadastro/categoria-cadastro.component';
import { MarcaCadastroComponent } from './core/components/marca-cadastro/marca-cadastro.component';
import { ProdutoCadComponent } from './core/components/produto-cad/produto-cad.component';
import { EquipamentoCadastroComponent } from './core/components/equipamento-cadastro/equipamento-cadastro.component';
import { TipoEquipamentoCadastroComponent } from './core/components/tipo-equipamento-cadastro/tipo-equipamento-cadastro.component';
import { TopicoRevisaoComponent } from './features/revisao/topico-revisao/topico-revisao.component';
import { MateriaEstudoComponent } from './features/materias/materia-estudo/materia-estudo.component';
import { ProvaEstudoComponent } from './features/revisao/prova-estudo/prova-estudo.component';
import { TopicoEditalCadastroComponent } from './features/topico-edital/topico-edital-cadastro/topico-edital-cadastro.component';
import { EditalVerticalizadoComponent } from './features/topico-edital/edital-verticalizado/edital-verticalizado.component';




const routes: Routes = [
  { path: 'ativacao', component: AtivacaoComponent }, 
 {
  path: 'area-restrita/gestor/clientes',
  component: ClienteCadastroComponent
},

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
                        
                         
                         { path: 'equipamentos', component: TopicoRevisaoComponent },
                         { path: 'tipo-equipamento', component: TipoEquipamentoCadastroComponent },
                         { path: 'produtos', component: ProdutoCadComponent },
                         { path: 'categorias', component: CategoriaCadastroComponent },
                         { path: 'marcas', component: MarcaCadastroComponent },
                         { path: 'proposta', component: PropostaOsComponent },
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
