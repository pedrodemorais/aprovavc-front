import { NgModule } from '@angular/core';
import { CommonModule, registerLocaleData, DatePipe } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { PrimeNGConfig, MessageService, ConfirmationService, TreeDragDropService } from 'primeng/api';

// PrimeNG (usei o que seu HTML/stack usa)
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { DragDropModule } from 'primeng/dragdrop';
import { DragDropModule as CdkDragDropModule } from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';

import { DialogModule } from 'primeng/dialog';
import { MenubarModule } from 'primeng/menubar';
import { TimelineModule } from 'primeng/timeline';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ChartModule } from 'primeng/chart';
import { CalendarModule } from 'primeng/calendar';
import { InputMaskModule } from 'primeng/inputmask';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { TooltipModule } from 'primeng/tooltip';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { EditorModule } from 'primeng/editor';
import { ToastModule } from 'primeng/toast';
import { TreeTableModule } from 'primeng/treetable';
import { TreeModule } from 'primeng/tree';
import { PickListModule } from 'primeng/picklist';
import { DataViewModule } from 'primeng/dataview';

import { QuillModule } from 'ngx-quill';
import { NgxMaskModule } from 'ngx-mask';

// Angular Material (se você realmente usa no CoreModule)
import { MatTableModule } from '@angular/material/table';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';

// ✅ Seus componentes
import { EmpresaCadastroComponent } from '../site/pages/empresa-cadastro/empresa-cadastro.component';
import { MateriaCadastroComponent } from './components/area-aluno/materia-cadastro/materia-cadastro.component';
import { SalaEstudoComponent } from './components/area-aluno/sala-estudo/sala-estudo.component';
import { EditaisComponent } from './components/area-aluno/editais/editais.component';
import { CadastroEditaisComponent } from './components/area-aluno/cadastro-editais/cadastro-editais.component';
import { AssinaturaCanceladaComponent } from './components/area-aluno/assinatura-cancelada/assinatura-cancelada.component';
import { AssinaturaPlanosComponent } from './components/area-aluno/assinatura-planos/assinatura-planos.component';
import { PerfilAlunoComponent } from './components/area-aluno/perfil-aluno/perfil-aluno.component';
import { MateriaEstudoComponent } from './components/area-aluno/estudo-por-materia/estudo-por-materia.component';
import { DashboardRevisaoComponent } from './components/area-aluno/dashboard-revisao/dashboard-revisao.component';
import { PainelAdminComponent } from './area-admin/pages/painel-admin/painel-admin.component';
import { BlocosEstudoComponent } from './components/area-aluno/blocos-estudo/blocos-estudo.component';
import { PlanoDoDiaWidgetComponent } from './components/area-aluno/plano-do-dia-widget/plano-do-dia-widget.component';
import { RevisoesComponent } from './components/area-aluno/revisoes/revisoes.component';
import { ProgressoComponent } from './components/area-aluno/progresso/progresso.component';
import { CadastroBaseComponent } from './area-admin/pages/painel-admin/cadastro-base/cadastro-base.component';
import { BibliotecaComponent } from './components/area-aluno/biblioteca/biblioteca.component';
import { BibliotecaResumoComponent } from './components/area-aluno/biblioteca/biblioteca-resumo.component';
import { CadernoErrosComponent } from './components/area-aluno/caderno-erros/caderno-erros.component';
import { RetencaoDashboardComponent } from './components/area-aluno/retencao-dashboard/retencao-dashboard.component';
import { HojeComponent } from './components/area-aluno/hoje/hoje.component';


// ✅ O COMPONENTE DOS BLOCOS

registerLocaleData(localePt);

@NgModule({
  declarations: [
    EmpresaCadastroComponent,
    MateriaCadastroComponent,
    SalaEstudoComponent,
    EditaisComponent,
    CadastroEditaisComponent,
    AssinaturaCanceladaComponent,
    AssinaturaPlanosComponent,
    PerfilAlunoComponent,
    MateriaEstudoComponent,
    DashboardRevisaoComponent,
    PainelAdminComponent,
    BlocosEstudoComponent,
    BlocosEstudoComponent,
    PlanoDoDiaWidgetComponent,
    RevisoesComponent,
    ProgressoComponent,
    CadastroBaseComponent,
    BibliotecaComponent,
    BibliotecaResumoComponent,
    CadernoErrosComponent,
    RetencaoDashboardComponent,
    HojeComponent,

  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,

    // PrimeNG essenciais pro BlocosEstudoComponent
    TabViewModule,
    TableModule,
    DragDropModule,
    CdkDragDropModule,
    ButtonModule,
    DropdownModule,
    InputNumberModule,

    // Outros que você já usa no projeto
    MenubarModule,
    DialogModule,
    TimelineModule,
    ToggleButtonModule,
    ChartModule,
    CalendarModule,
    InputMaskModule,
    ConfirmDialogModule,
    AutoCompleteModule,
    TooltipModule,
    OverlayPanelModule,
    EditorModule,
    ToastModule,
    TreeTableModule,
    TreeModule,
    PickListModule,
    DataViewModule,

    QuillModule.forRoot(),
    NgxMaskModule.forChild(),

    // Material (se precisar)
    MatTableModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
     
  DragDropModule,
  CdkDragDropModule,
  ],
  providers: [
    MessageService,
    ConfirmationService,
    TreeDragDropService,
    DatePipe
  ],
  exports: [
    // Se outros módulos/telas usam esses componentes
    BlocosEstudoComponent
  ]
})
export class CoreModule {
  constructor(private primengConfig: PrimeNGConfig) {
    this.primengConfig.setTranslation({
      dayNames: ["domingo","segunda","terça","quarta","quinta","sexta","sábado"],
      dayNamesShort: ["dom","seg","ter","qua","qui","sex","sáb"],
      dayNamesMin: ["Do","Se","Te","Qa","Qi","Sx","Sa"],
      monthNames: [
        "janeiro","fevereiro","março","abril","maio","junho",
        "julho","agosto","setembro","outubro","novembro","dezembro"
      ],
      monthNamesShort: [
        "jan","fev","mar","abr","mai","jun",
        "jul","ago","set","out","nov","dez"
      ],
      today: 'Hoje',
      clear: 'Limpar',
      dateFormat: 'dd/mm/yy',
      weekHeader: 'Sm',
      firstDayOfWeek: 0
    });
  }
}
