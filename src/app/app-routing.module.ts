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

import { MateriaCadastroComponent } from './core/components/area-aluno/materia-cadastro/materia-cadastro.component';
import { SalaEstudoComponent } from './core/components/area-aluno/sala-estudo/sala-estudo.component';
import { DashboardRevisaoComponent } from './core/components/area-aluno/dashboard-revisao/dashboard-revisao.component';
import { EditaisComponent } from './core/components/area-aluno/editais/editais.component';
import { CadastroEditaisComponent } from './core/components/area-aluno/cadastro-editais/cadastro-editais.component';
import { AssinaturaSucessoComponent } from './core/components/area-aluno/assinatura/assinatura-sucesso/assinatura-sucesso.component';
import { AssinaturaCanceladaComponent } from './core/components/area-aluno/assinatura-cancelada/assinatura-cancelada.component';
import { AssinaturaPlanosComponent } from './core/components/area-aluno/assinatura-planos/assinatura-planos.component';
import { PerfilAlunoComponent } from './core/components/area-aluno/perfil-aluno/perfil-aluno.component';
import { PlanoAtivoGuard } from './site/pages/guards/plano-ativo.guard';
import { MateriaEstudoComponent } from './core/components/area-aluno/estudo-por-materia/estudo-por-materia.component';
import { PainelAdminComponent } from './core/area-admin/pages/painel-admin/painel-admin.component';
import { CadastroBaseComponent } from './core/area-admin/pages/painel-admin/cadastro-base/cadastro-base.component';
import { AdminGuard } from './site/pages/guards/admin.guard';
import { BlocosEstudoComponent } from './core/components/area-aluno/blocos-estudo/blocos-estudo.component';
import { RevisoesComponent } from './core/components/area-aluno/revisoes/revisoes.component';
import { ProgressoComponent } from './core/components/area-aluno/progresso/progresso.component';
import { EstudoEmAndamentoGuard } from './core/components/area-aluno/guards/estudo-em-andamento.guard';
import { BibliotecaComponent } from './core/components/area-aluno/biblioteca/biblioteca.component';
import { BibliotecaResumoComponent } from './core/components/area-aluno/biblioteca/biblioteca-resumo.component';
import { CadernoErrosComponent } from './core/components/area-aluno/caderno-erros/caderno-erros.component';
import { RetencaoDashboardComponent } from './core/components/area-aluno/retencao-dashboard/retencao-dashboard.component';
import { HojeComponent } from './core/components/area-aluno/hoje/hoje.component';
import { FocoComponent } from './core/components/area-aluno/foco/foco.component';


const routes: Routes = [
  { path: 'admin/painel', redirectTo: 'area-restrita/admin/painel', pathMatch: 'full' },
  { path: 'admin/cadastro-base', redirectTo: 'area-restrita/admin/cadastro-base', pathMatch: 'full' },
  { path: 'retencao', redirectTo: 'area-restrita/retencao', pathMatch: 'full' },

  { path: 'ativacao', component: AtivacaoComponent },

  { path: 'assinatura/sucesso', component: AssinaturaSucessoComponent },
  { path: 'assinatura/cancelada', component: AssinaturaCanceladaComponent },

  { path: 'configurador', component: ConfiguradorComponent },
  { path: 'politica-privacidade', component: PoliticaPrivacidadeComponent },
  { path: 'termos-de-uso', component: TermosDeUsoComponent },

  // ✅ /home vira alias da raiz (sem loop!)
  { path: 'home', redirectTo: '', pathMatch: 'full' },

  { path: 'login', component: LoginSiteComponent },

  {
    path: 'area-restrita',
    component: AreaUsuarioComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'hoje', component: HojeComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'foco', component: FocoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'dashboard', component: DashboardRevisaoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'cad-materias', component: MateriaCadastroComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'estudar-materias', component: MateriaEstudoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'biblioteca/resumo', component: BibliotecaResumoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'biblioteca/resumo/:topicoId', component: BibliotecaResumoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'biblioteca', component: BibliotecaComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'caderno-erros', component: CadernoErrosComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'blocos-estudo', component: BlocosEstudoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'progresso', component: ProgressoComponent, canActivate: [PlanoAtivoGuard] },
      { path: 'retencao', component: RetencaoDashboardComponent, canActivate: [PlanoAtivoGuard] },
        { path: 'revisoes', component: RevisoesComponent },
        { path: 'cadastro-editais/:id', component: CadastroEditaisComponent, canActivate: [PlanoAtivoGuard], canDeactivate: [EstudoEmAndamentoGuard] },
        { path: 'cadastro-editais', component: CadastroEditaisComponent, canActivate: [PlanoAtivoGuard], canDeactivate: [EstudoEmAndamentoGuard] },
        { path: 'editais', component: EditaisComponent, canActivate: [PlanoAtivoGuard], canDeactivate: [EstudoEmAndamentoGuard] },
      { path: 'sala-estudo/executar', component: SalaEstudoComponent, canActivate: [PlanoAtivoGuard], canDeactivate: [EstudoEmAndamentoGuard] },
      { path: 'sala-estudo/:materiaId', component: SalaEstudoComponent, canActivate: [PlanoAtivoGuard], canDeactivate: [EstudoEmAndamentoGuard] },
      { path: 'meu-cadastro', component: PerfilAlunoComponent },
      { path: 'suporte', component: SuporteComponent },
      { path: 'redefinir-senha-site', component: RedefinirSenhaSiteComponent },
      { path: 'assinatura', component: AssinaturaPlanosComponent },
      { path: 'admin/painel', component: PainelAdminComponent, canActivate: [AdminGuard] },
      { path: 'admin/cadastro-base', component: CadastroBaseComponent, canActivate: [AdminGuard] },
    ]
  },

  { path: 'register', component: RegisterComponent },
  { path: 'recuperar-senha', component: RecuperarSenhaComponent },
  { path: 'redefinir-senha', component: RedefinirSenhaComponent },
  { path: 'assine', component: AssineComponent },

  // ✅ HOME na raiz (sem redirect)
  { path: '', component: InicioComponent },

  { path: '**', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    // deixa o browser lidar com scroll no F5 (evita “pulo pro topo” forçado)
    scrollPositionRestoration: 'disabled',
    anchorScrolling: 'disabled',
    initialNavigation: 'enabledBlocking'
})],
  exports: [RouterModule]
})
export class AppRoutingModule { }
