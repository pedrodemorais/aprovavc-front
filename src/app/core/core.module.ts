import { NgModule,CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';

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
import { DropdownModule } from 'primeng/dropdown';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SubCategoriaComponent } from './components/sub-categoria/sub-categoria.component';
import { FormaDePagamentoComponent } from './components/forma-de-pagamento/forma-de-pagamento.component';
import { HttpClientModule } from '@angular/common/http';
import { NgxMaskModule } from 'ngx-mask';
import { TableModule } from 'primeng/table';
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
import { ConfiguracaoOsComponent } from './components/proposta-os/configuracao-os/configuracao-os.component';

import { AutoCompleteModule } from 'primeng/autocomplete';
registerLocaleData(localePt);




@NgModule({
  declarations: [
    
    JanelaPadraoComponent,
    EmpresaCadastroComponent, 
    PlannerComponent, 
    TimelineComponent,
    SubCategoriaComponent,
    FormaDePagamentoComponent,
    ConfiguracaoOsComponent,
    
  
    
    
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
