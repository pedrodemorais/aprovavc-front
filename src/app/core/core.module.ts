import { NgModule,CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuillModule } from 'ngx-quill';
import { EmpresaCadastroComponent } from '../site/pages/empresa-cadastro/empresa-cadastro.component';
import { FormsModule,ReactiveFormsModule } from '@angular/forms'; // Importação necessária para ngModel
import { TimelineModule } from 'primeng/timeline';
import { TabViewModule } from 'primeng/tabview'; // Adicionado
import { ToggleButtonModule } from 'primeng/togglebutton';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // Importação necessária
// Componentes do CoreModule


// Módulos de Terceiros (PrimeNG, etc.)
import { MenubarModule } from 'primeng/menubar';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { MatTableModule } from '@angular/material/table';
import { DropdownModule } from 'primeng/dropdown';
import { RadioButtonModule } from 'primeng/radiobutton';
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

import { AutoCompleteModule } from 'primeng/autocomplete';
registerLocaleData(localePt);
import { BrowserModule } from '@angular/platform-browser';
import { EditorModule } from 'primeng/editor';
import { RichTextEditorModule } from '@syncfusion/ej2-angular-richtexteditor';
import { MateriaCadastroComponent } from './pages/materias/materia-cadastro/materia-cadastro.component';







@NgModule({
  declarations: [
    
    EmpresaCadastroComponent,
         MateriaCadastroComponent, 
       
    
  
    
    
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
    QuillModule.forRoot(),  // <-- adicione isto
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
       BrowserAnimationsModule,
  BrowserAnimationsModule,   // PRECISA estar aqui
    FormsModule,   
    BrowserAnimationsModule,  
     FormsModule,
   EditorModule, 
   BrowserModule,
    BrowserAnimationsModule,
    RichTextEditorModule,
  BrowserAnimationsModule,   // PRECISA estar aqui
    NgxMaskModule.forChild()
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
