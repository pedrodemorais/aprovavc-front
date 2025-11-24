import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {  FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UnidadeService } from 'src/app/site/services/unidade.service';

@Component({
  selector: 'app-unidade-cadastro',
  templateUrl: './unidade-de-medida.component.html',
  styleUrls: ['./unidade-de-medida.component.css']
})
export class UnidadeDeMedidaComponent implements OnInit {
 @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
     @Output() modoConsultaChange = new EventEmitter<boolean>(); // 🔥 Notifica mudanças de modo
     @Output() UnidadeCarregadaChange = new EventEmitter<boolean>();
     @Output() temDadosParaExcluirChange = new EventEmitter<boolean>(); // ✅ Evento para notificar a Janela Padrão
     @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();
     private _isModoConsulta: boolean = false;
   
     @Input()
   set isModoConsulta(valor: boolean) {
     this._isModoConsulta = valor;
   }
   
   get isModoConsulta(): boolean {
     return this._isModoConsulta;
   }
   
   temDadosParaExcluir: boolean = false; // ✅ Adiciona a propriedade
   unidadeForm: FormGroup = new FormGroup({}); 
   unidades: any[] = []; // Lista de unidades retornados pela pesquisa
   selectedUnidade: any; // unidade selecionado na tabela
   exibirTabela: boolean = false; // Define quando exibir a tabela
   listaUnidades: any[] = [];
   unidadeSelecionada: any;
   exibirTabelaPesquisa: boolean = false; // Controla a exibição da tabela
   unidadeCarregada: boolean = false;
     
 
     constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef,private  unidadeService: UnidadeService  ) {
      
     }
     tipoUnidades = [
  { label: 'Quantidade', value: 'QUANTIDADE' },
  { label: 'Peso',       value: 'PESO' },
  { label: 'Volume',     value: 'VOLUME' },
  { label: 'Comprimento',value: 'COMPRIMENTO' },
  { label: 'Área',       value: 'AREA' },
  { label: 'Embalagem',  value: 'EMBALAGEM' },
  { label: 'Outros',     value: 'OUTROS' },
];
  
    ngAfterViewInit(): void {
     
       setTimeout(() => {
         this.cdr.reattach(); // 🔥 Reanexa a detecção de mudanças
       });
     }
     
   
     ngOnInit(): void {
       this.inicializarFormularios();
        // ✅ Atualiza `temDadosParaExcluir` sempre que o formulário mudar
       this.unidadeForm.valueChanges.subscribe(() => {
       const temDados = !!this.unidadeForm.get('id')?.value; // ✅ Se há ID, pode excluir
       this.temDadosParaExcluirChange.emit(temDados); // ✅ Emite para a Janela Padrão
       this.temDadosParaExcluir = !!this.unidadeForm.get('id')?.value;
   });
   
  this.unidadeForm.get('fracionavel')?.valueChanges.subscribe((fracionavel: boolean) => {
  const casasDecimaisControl = this.unidadeForm.get('casasDecimais');
  if (fracionavel) {
    casasDecimaisControl?.enable();
  } else {
    casasDecimaisControl?.disable();
    casasDecimaisControl?.setValue(0);
  }
});

// Executa na inicialização também
if (!this.unidadeForm.get('fracionavel')?.value) {
  this.unidadeForm.get('casasDecimais')?.disable();
}

// ⚠️ Também executa na primeira carga (se o valor inicial for false)
if (!this.unidadeForm.get('fracionavel')?.value) {
  this.unidadeForm.get('casasDecimais')?.disable();
}
     
     }
   
     private setExibirTabelaPesquisa(valor: boolean): void {
       this.exibirTabelaPesquisa = valor;
       this.mostrarTelaDePesquisa.emit(valor);
     }
   
     onCampoPreenchido() {
       const nome = this.unidadeForm.get('nomeFantasia')?.value;
       if (nome ) {
         this.isModoConsulta = true;
       }
     }
   
 
   onPesquisar() {
    
     
     // 🔥 Se estiver no modo de cadastro e o formulário estiver preenchido, volta para o modo consulta e limpa tudo
     if (!this.isModoConsulta) {
       this.unidadeForm.reset(); // 🔥 Limpa o formulário
   
    
       this.isModoConsulta = true; // 🔥 Volta para o modo consulta
       this.modoConsultaChange.emit(true); //
       this.listaUnidades = []; // 🔥 Esconde a tabela de unidades, se houver
       this.setExibirTabelaPesquisa(false);
       this.UnidadeCarregadaChange.emit(false); // ✅ Emite para a Janela Padrão
       this.temDadosParaExcluir = false;
       return; // ⛔ Sai da função, pois só queremos limpar o formulário
     }
   
      
     // 🔍 Obtém os critérios de pesquisa do formulário
     const filtros = {
       nome: this.unidadeForm.get('nome')?.value,
     };
   
     if (!filtros.nome) {
       this.unidadeService.buscarTodasUnidades().subscribe(
         (res: any[]) => {
           if (res.length === 0) {
             this.enviarMensagem.emit({ mensagem: "Nenhuma unidade encontrada.", tipo: "info" });
             this.setExibirTabelaPesquisa(false);
           } else {
             this.listaUnidades = res;
             this.setExibirTabelaPesquisa(true);
           }
         },
         (error) => {
           console.error("Erro ao buscar todas as unidades", error);
           alert("Erro ao buscar unidades. Tente novamente.");
         }
       );
       return;
     }
   
     // 🔍 Realiza a pesquisa com os critérios informados
     this.unidadeService.buscarUnidade(
 
       filtros.nome,
      
     ).subscribe(
       (res: any) => {
         if (res.length === 0) {
           this.enviarMensagem.emit({ mensagem: "Nenhuma unidade encontrada.", tipo: "info" });
           this.setExibirTabelaPesquisa(false);
           return;
          } 
   
         else {
           // 🔥 Exibe a tabela de unidades caso haja mais de um resultado
           this.listaUnidades = res;
           this.setExibirTabelaPesquisa(true);
         }
       },
       (error) => {
         console.error("Erro ao buscar unidade", error);
         alert("Erro ao buscar unidade. Tente novamente.");
       }
     );
   
     if(this.exibirTabelaPesquisa===true){
       this.resetarParaModoCadastro();
     }
   }

   
   public resetarParaModoCadastro(): void {
     this.listaUnidades = []; // Esconde a tabela após a seleção
     this.setExibirTabelaPesquisa(false);
     this.isModoConsulta = false;
   }


 
   onSalvar(): void {
 
   
   
     if (this.unidadeForm.valid) {
       let formData = this.unidadeForm.value;
  
      
       // 🔹 Ajusta contatos corretamente
       console.log("📤 Enviando dados para a API:", formData);
   
       // 🔁 Verifica se é um cadastro novo ou uma atualização
       if (formData.id) {
         // 🔄 Atualizar unidade
         this.unidadeService.atualizarUnidade(formData).subscribe(
           response => {
             
             this.enviarMensagem.emit({ mensagem: "Unidade atualizada com sucesso!", tipo: "success" });
             this.unidadeForm.reset();
            
   
             // 🔥 NOVO: Muda para modo consulta
             this.isModoConsulta = false;
             this.modoConsultaChange.emit(false); // 🔔 Notifica JanelaPadraoComponent
             this.unidadeCarregada = false;
             this.UnidadeCarregadaChange.emit(false); // 🔥 dispara evento
             this.temDadosParaExcluirChange.emit(false);
           },
           error => {
             console.error("❌ Erro ao atualizar unidade:", error);
             alert("Erro ao atualizar unidade. Verifique os dados e tente novamente.");
           }
         );
       } else {
         console.log('Bateuuuu aqui');
         // ➕ Novo cadastro
         this.unidadeService.cadastrarUnidade(formData).subscribe(
           response => {
             
             this.enviarMensagem.emit({ mensagem: "Unidade cadastrado com sucesso!", tipo: "success" });
             this.unidadeForm.reset();
     
           },
           error => {
             console.error("❌ Erro ao cadastrar Unidade:", error);
           
             const mensagemErro =
               error?.error?.message || // <- Aqui vem do backend (via GlobalExceptionHandler)
               "Erro ao cadastrar Unidade.";
           
             this.enviarMensagem.emit({ mensagem: mensagemErro, tipo: "error" });
           }
           
         );
       }
     } else {
      
       alert("⚠️ Preencha todos os campos obrigatórios antes de salvar.");
     }
   }
   
     onExcluir() {
       if (!this.unidadeForm.value.id) {
         alert("Selecione um unidade para excluir!");
         return;
       }
       const confirmacao = confirm("Tem certeza que deseja excluir este unidade?");
       if (!confirmacao) return;
       this.unidadeService.deletarUnidade(this.unidadeForm.value.id).subscribe(
         () => {
           this.enviarMensagem.emit({ mensagem: "Unidade excluído com sucesso!", tipo: "success" });
           
           this.unidadeForm.reset(); // 🔥 Limpa o formulário após a exclusão
           this.temDadosParaExcluir = false; // 🔥 Atualiza para esconder o botão
         },
         (error) => {
           console.error("Erro ao excluir unidade", error);
           alert("Erro ao excluir unidade. Tente novamente.");
         }
       );
     }
     
   
   selecionarUnidade(unidade: any) {
     console.log("🔍 Dados carregados da unidade:", unidade);
   
     if (!unidade) return;
     this.unidadeForm.patchValue({
        id:            unidade.id,
    sigla:         unidade.sigla,
    descricao:     unidade.descricao,
    fatorConversao:unidade.fatorConversao,
    fracionavel:   unidade.fracionavel,
    casasDecimais: unidade.casasDecimais,
    tipo:          unidade.tipo,
    empresaId:     unidade.empresaId,
       // se tiver mais campos, adicione aqui
     });
    
  
      // 🔥 Atualiza o status de "tem dados para excluir"
      const temDados = !!this.unidadeForm.get('id')?.value;
      console.log("Tem dados para exluir: ", temDados)
      this.temDadosParaExcluirChange.emit(temDados); // ✅ Emite para a Janela Padrão
      this.UnidadeCarregadaChange.emit(true); // ✅ Emite para a Janela Padrão
        
          this.isModoConsulta = false;
          this.modoConsultaChange.emit(false); // 🔔 Notifica JanelaPadraoComponent
   
     this.listaUnidades = []; // Esconde a tabela após a seleção
     this.setExibirTabelaPesquisa(false);
     this.isModoConsulta = false;
   }
   
   
   preencherFormulario(marca: any) {
     if (marca) {
       this.unidadeForm.patchValue(marca);
       this.isModoConsulta = false;
       this.exibirTabela = false; // Oculta a tabela após a seleção
     }
   }
     
   
     /** 🔹 Inicializa o formulário completo com a estrutura correta */
inicializarFormularios() {
  this.unidadeForm = this.fb.group({
    id: [''],
    sigla: ['', [Validators.required, Validators.maxLength(5)]],
    descricao: ['', [Validators.required, Validators.maxLength(100)]],
    fatorConversao: [1.0, [Validators.required, Validators.min(0)]],
    fracionavel: [false, Validators.required],
    casasDecimais: [0, [Validators.required, Validators.min(0)]],
    tipo: ['', Validators.required],
    empresaId: [''] // geralmente oculto; será preenchido pelo backend/token
  });
}
   
   
     
    
     
   
     
   
   }
     
     
     
     
   
   
   