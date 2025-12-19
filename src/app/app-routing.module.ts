import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ConfiguradorComponent } from './site/pages/configurador/configurador.component';
import { PoliticaPrivacidadeComponent } from './site/pages/politica-privacidade/politica-privacidade.component';
import { TermosDeUsoComponent } from './site/pages/termos-de-uso/termos-de-uso.component';
import { LoginSiteComponent } from './site/pages/auth/login-site/login-site.component';
import { AreaUsuarioComponent } from './site/pages/area-usuario/area-usuario.component';
import { RegisterComponent } from './site/pages/register/register.component';
import { AuthGuard } from './site/pages/guards/auth.guard';
import { RedefinirSenhaComponent } from './site/pages/auth/redefinir-senha/redefinir-senha.component';
import { RecuperarSenhaComponent } from './site/pages/auth/recuperar-senha/recuperar-senha.component';
import { RedefinirSenhaSiteComponent } from './site/pages/redefinir-senha-site/redefinir-senha-site.component';
import { AssineComponent } from './site/pages/assine/assine.component';
import { AtivacaoComponent } from './site/ativacao/ativacao.component';
import { InicioComponent } from './site/pages/inicio/inicio.component';
import { SuporteComponent } from './site/pages/suporte/suporte.component';

import { MateriaCadastroComponent } from './core/components/materia-cadastro/materia-cadastro.component';
import { SalaEstudoComponent } from './core/components/sala-estudo/sala-estudo.component';
import { DashboardRevisaoComponent } from './core/components/dashboard-revisao/dashboard-revisao.component';
import { EditaisComponent } from './core/components/editais/editais.component';
import { AssinaturaSucessoComponent } from './core/components/assinatura/assinatura-sucesso/assinatura-sucesso.component';
import { AssinaturaCanceladaComponent } from './core/components/assinatura/assinatura-cancelada/assinatura-cancelada.component';
import { AssinaturaPlanosComponent } from './core/components/assinatura-planos/assinatura-planos.component';
import { PerfilAlunoComponent } from './core/components/perfil-aluno/perfil-aluno.component';
import { PlanoAtivoGuard } from './site/pages/guards/plano-ativo.guard';
import { MateriaEstudoComponent } from './core/components/estudo-por-materia/estudo-por-materia.component';





const routes: Routes = [
  { path: 'ativacao', component: AtivacaoComponent },

  // rotas de assinatura públicas (sem login obrigatório)
  
  { path: 'assinatura/sucesso', component: AssinaturaSucessoComponent },
  { path: 'assinatura/cancelada', component: AssinaturaCanceladaComponent },

  { path: 'configurador', component: ConfiguradorComponent },
  { path: 'politica-privacidade', component: PoliticaPrivacidadeComponent },
  { path: 'termos-de-uso', component: TermosDeUsoComponent },
  { path: 'home', component: InicioComponent },

  // essa versão de Editais aqui parece ser pública (fora da área restrita)
  { path: 'Editais', component: EditaisComponent },

  { path: 'login', component: LoginSiteComponent },

  {
    path: 'area-restrita',
    component: AreaUsuarioComponent,
    canActivate: [AuthGuard], // 🔒 precisa estar logado
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // 🔥 Telas que exigem PLANO ATIVO:
      {
        path: 'dashboard',
        component: DashboardRevisaoComponent,
        canActivate: [PlanoAtivoGuard]
      },
      {
        path: 'cad-materias',
        component: MateriaCadastroComponent,
        canActivate: [PlanoAtivoGuard]
      },
      {
        path: 'estudar-materias',
        component: MateriaEstudoComponent,
        canActivate: [PlanoAtivoGuard]
      },
      {
        path: 'editais',
        component: EditaisComponent,
        canActivate: [PlanoAtivoGuard]
      },
      {
        path: 'sala-estudo/:materiaId',
        component: SalaEstudoComponent,
        canActivate: [PlanoAtivoGuard]
      },

      // ✅ Tela SEM exigência de plano ativo (só precisa estar logado)
      {
        path: 'meu-cadastro',
        component: PerfilAlunoComponent
      },
      {
        path: 'suporte',
        component: SuporteComponent
      },

      // redefinir senha dentro da área logada
      { path: 'redefinir-senha-site', component: RedefinirSenhaSiteComponent },
      { path: 'assinatura', component: AssinaturaPlanosComponent },
    ]
  },

  { path: 'register', component: RegisterComponent },
  { path: 'recuperar-senha', component: RecuperarSenhaComponent },
  { path: 'redefinir-senha', component: RedefinirSenhaComponent },
  { path: 'assine', component: AssineComponent },

  { path: '**', redirectTo: 'home', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
