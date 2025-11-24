import { NgModule,CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClienteCadastroComponent } from './components/cliente-cadastro/cliente-cadastro.component';
import { FornecedorCadastroComponent } from './components/fornecedor-cadastro/fornecedor-cadastro.component';

import { PedidosVendaComponent } from './components/pedidos-venda/pedidos-venda.component';
import { EmpresaCadastroComponent } from './components/empresa-cadastro/empresa-cadastro.component';
import { PlannerComponent } from './components/planner/planner.component';
import { FormsModule,ReactiveFormsModule } from '@angular/forms'; // Importação necessária para ngModel
import { TimelineModule } from 'primeng/timeline';
import { TabViewModule } from 'primeng/tabview'; // Adicionado
import { ToggleButtonModule } from 'primeng/togglebutton';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // Importação necessária
// Componentes do CoreModule

import { JanelaPadraoComponent } from './components/janela-padrao/janela-padrao.component';
import { TimelineComponent } from './components/timeline/timeline.component';

// Módulos de Terceiros (PrimeNG, etc.)
import { MenubarModule } from 'primeng/menubar';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { MatTableModule } from '@angular/material/table';
import { CategoriaCadastroComponent } from './components/categoria-cadastro/categoria-cadastro.component';
import { DropdownModule } from 'primeng/dropdown';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SubCategoriaComponent } from './components/sub-categoria/sub-categoria.component';
import { FormaDePagamentoComponent } from './components/forma-de-pagamento/forma-de-pagamento.component';
import { InsumosComponent } from './components/insumos/insumos.component';
import { UnidadeDeMedidaComponent } from './components/unidade-de-medida/unidade-de-medida.component';
import { HttpClientModule } from '@angular/common/http';
import { NgxMaskModule } from 'ngx-mask';
import { TableModule } from 'primeng/table';
import { ProdutoCadastroComponent } from './components/produto-cadastro/produto-cadastro.component';
import { MarcaCadastroComponent } from './components/marca-cadastro/marca-cadastro.component';
import { ChartModule } from 'primeng/chart';
import { CalendarModule } from 'primeng/calendar';
// Importe a função para registrar o locale
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

// Importe o PrimeNG ConfigService
import { PrimeNGConfig } from 'primeng/api';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputMaskModule } from 'primeng/inputmask';
import { ConfirmationService } from 'primeng/api';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePipe } from '@angular/common'; // <-- importe aqui
import { PropostaOsComponent } from './components/proposta-os/proposta-os.component'; // Importação do componente PropostaOsComponent
import { ConfiguracaoOsComponent } from './components/proposta-os/configuracao-os/configuracao-os.component';
import { EquipamentoCadastroComponent } from './components/equipamento-cadastro/equipamento-cadastro.component';

import { AutoCompleteModule } from 'primeng/autocomplete';
registerLocaleData(localePt);




@NgModule({
  declarations: [
    
    JanelaPadraoComponent,
    FornecedorCadastroComponent, 
    PropostaOsComponent,
    ProdutoCadastroComponent,
    PedidosVendaComponent, 
    EmpresaCadastroComponent, 
    PlannerComponent, 
    ClienteCadastroComponent, 
    TimelineComponent,
    CategoriaCadastroComponent,
    MarcaCadastroComponent,
    SubCategoriaComponent,
    FormaDePagamentoComponent,
    InsumosComponent,
    UnidadeDeMedidaComponent,
    ConfiguracaoOsComponent,
    EquipamentoCadastroComponent,
    
  
    
    
  ],
  imports: [
    BrowserAnimationsModule,  // importante para Angular Material funcionar
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
    CommonModule,
    CalendarModule,
    DropdownModule,
    MenubarModule,
    DialogModule,
    ButtonModule,
    TimelineModule,
    BrowserAnimationsModule, // Importe aqui
    TabViewModule, // Adicionado
    MatTableModule,
    RadioButtonModule,
    ToggleButtonModule, // Importação necessária
    ReactiveFormsModule, // Adicione aqui
    FormsModule, // Certifique-se de adicionar aqui
    HttpClientModule,
    TableModule,
    ChartModule,
    InputNumberModule,
    InputMaskModule,
    ConfirmDialogModule,
     AutoCompleteModule,
     
   
    NgxMaskModule.forChild()
  ],
  exports: [
    
  ],
  providers: [
    MessageService, // ✅ <-- ISSO AQUI RESOLVE
     ConfirmationService, // 👈 Adicione isso aqui
       DatePipe 
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // Adicione isso
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
  }}
