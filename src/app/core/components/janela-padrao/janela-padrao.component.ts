import { 
  Component, ComponentRef, EventEmitter, Input, Output, SimpleChanges, ViewChild, ViewContainerRef, OnChanges, AfterViewInit, Type,ChangeDetectorRef 
  
} from '@angular/core';
import { RedefinirSenhaSiteComponent } from 'src/app/site/component/redefinir-senha-site/redefinir-senha-site.component';
import { EmpresaCadastroComponent } from '../empresa-cadastro/empresa-cadastro.component';


@Component({
  selector: 'app-janela-padrao',
  templateUrl: './janela-padrao.component.html',
  styleUrls: ['./janela-padrao.component.css'],
})
export class JanelaPadraoComponent implements OnChanges, AfterViewInit {
  @ViewChild('container', { read: ViewContainerRef }) container!: ViewContainerRef;
  private componenteRef?: ComponentRef<any>;

  @Input() titulo: string = 'Janela Padrão';
  @Input() visivel: boolean = true;
  @Input() maximizado: boolean = false;
  @Input() posX: number = 100;
  @Input() posY: number = 100;
  @Input() componenteAtual!: Type<any>; // 🔥 Tipo explícito para componentes
  @Input() isModoConsulta: boolean = true; // 🔥 Recebe do componente filho
  @Input() registroCarregado: boolean = false; // 🔥 Recebe do componente filho
  

  @Output() visivelChange = new EventEmitter<boolean>();
  @Output() fechar = new EventEmitter<void>();
  @Output() minimizar = new EventEmitter<void>();
  @Output() maximizar = new EventEmitter<void>();
  @Output() alterarSenhaClicked = new EventEmitter<void>(); // Evento para capturar clique no botão "Alterar Senha"
  @Output() modoConsultaChange = new EventEmitter<boolean>(); // 🔥 Emite para `DynamosoftComponent`
  @Output() mensagemRecebida = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() mostrarTelaDePesquisaChange = new EventEmitter<boolean>();


  isAlterarSenha: boolean = false;
  isCadastroEmpresa: boolean = false;
  temDadosParaExcluir: boolean = false; // Se tem dados para exclusão
  mensagemSistema: string = '';
  tipoMensagem: 'success' | 'error' | 'info' | 'warning' = 'info';
  mostrarMensagem: boolean = false;
  
  constructor(private cdr: ChangeDetectorRef) {}


  ngOnChanges(changes: SimpleChanges) {
    this.mensagemRecebida.subscribe((msg) => {
      this.exibirMensagem(msg.mensagem, msg.tipo);
    });

    if (changes['componenteAtual'] && this.componenteAtual) {
      console.log('Componente recebido:', this.componenteAtual);
      this.modoConsultaChange.emit(this.isModoConsulta);
       this.isModoConsulta = true;
      this.isAlterarSenha = this.componenteAtual === RedefinirSenhaSiteComponent;
      this.isCadastroEmpresa = this.componenteAtual === EmpresaCadastroComponent;
      console.log('isAlterarSenha:', this.isAlterarSenha);
      console.log('isCadastroEmpresa:', this.isCadastroEmpresa);
      this.carregarComponente();
    }
  }

   // 🔥 Método para exibir mensagens
   exibirMensagem(mensagem: string, tipo: 'success' | 'error' | 'info' | 'warning') {
    this.mensagemSistema = mensagem;
    this.tipoMensagem = tipo;
    this.mostrarMensagem = true;

    // 🔥 Oculta a mensagem automaticamente após 5 segundos
    setTimeout(() => {
      this.mostrarMensagem = false;
    }, 5000);
  }

  ngAfterViewInit() {
    if (this.componenteAtual) {
      this.carregarComponente();
      this.verificarSeTemDadosParaExcluir();
    }
  }



  verificarSeTemDadosParaExcluir() {
    const instancia = this.componenteRef?.instance as any;
  
    if (instancia?.temDadosParaExcluirChange?.subscribe) {
      instancia.temDadosParaExcluirChange.subscribe((temDados: boolean) => {
        this.temDadosParaExcluir = temDados;
      });
    }
  }
  

  
  carregarComponente() {
    if (!this.container || !this.componenteAtual) return;

    this.container.clear(); // 🔥 Remove qualquer componente existente
    this.componenteRef = this.container.createComponent(this.componenteAtual);

    // 🔥 Passa o `isModoConsulta` para o componente dinâmico
    this.componenteRef.instance.isModoConsulta = this.isModoConsulta;

    if (this.componenteRef.instance.enviarMensagem) {
      this.componenteRef.instance.enviarMensagem.subscribe((msg: any) => {
        this.exibirMensagem(msg.mensagem, msg.tipo);
      });
    }
    

    if (this.componenteRef.instance.registroCarregadoChange) {
      this.componenteRef.instance.registroCarregadoChange.subscribe((status: boolean) => {
        this.registroCarregado = status; // ✅ Atualiza variável quando fornecedor é carregado
      });
    }

     // ✅ Captura o evento para saber se pode excluir
  if (this.componenteRef.instance.temDadosParaExcluirChange) {
    this.componenteRef.instance.temDadosParaExcluirChange.subscribe((temDados: boolean) => {
      
      this.temDadosParaExcluir = temDados;
    });
  }
// ✅ Captura o evento para saber se pode excluir
if (this.componenteRef.instance.temDadosParaExcluirChange) {
  this.componenteRef.instance.temDadosParaExcluirChange.subscribe((temDados: boolean) => {
    this.temDadosParaExcluir = temDados;
    this.cdr.detectChanges(); // 🔥 força atualização do template
  });
}

  if (this.componenteRef.instance.modoConsultaChange) {
    this.componenteRef.instance.modoConsultaChange.subscribe((novoModo: boolean) => {
      this.isModoConsulta = novoModo;
      this.modoConsultaChange.emit(novoModo); // 🔥 Envia para `DynamosoftComponent`
    });
  }

  if (this.componenteRef.instance.mostrarTelaDePesquisa) {
    this.componenteRef.instance.mostrarTelaDePesquisa.subscribe((exibir: boolean) => {
      console.log("📦 Recebido do componente filho: exibirTabelaPesquisa =", exibir);
      this.mostrarTelaDePesquisaChange.emit(exibir); // Se quiser propagar
      // Aqui você pode controlar algo dentro do JanelaPadrao, se desejar.
    });
  }

    console.log("🔄 Componente instanciado:", this.componenteRef.instance);
  }

  private executarMetodoNoComponente(metodo: string) {
    if (this.componenteRef && this.componenteRef.instance && typeof this.componenteRef.instance[metodo] === 'function') {
      console.log(`✅ Chamando ${metodo}() no componente dinâmico`);
      this.componenteRef.instance[metodo]();
    } else {
      console.warn(`🚨 Método ${metodo}() não encontrado no componente dinâmico!`);
    }
  }

  onSalvar() {
    this.executarMetodoNoComponente('onSalvar');
  }
  
  onNovo() {
    this.executarMetodoNoComponente('onNovo');
  }
  
  onExcluir() {
    this.executarMetodoNoComponente('onExcluir');
  }
  
  onImprimir() {
    this.executarMetodoNoComponente('onImprimir');
  }
  
  onPesquisar() {
    this.executarMetodoNoComponente('onPesquisar');
  }
  
  onPrimeiroRegistro() {
    this.executarMetodoNoComponente('onPrimeiroRegistro');
  }
  
  onRegistroAnterior() {
    this.executarMetodoNoComponente('onRegistroAnterior');
  }
  
  onProximoRegistro() {
    this.executarMetodoNoComponente('onProximoRegistro');
  }
  
  onUltimoRegistro() {
    this.executarMetodoNoComponente('onUltimoRegistro');
  }

  onFechar() {
    this.visivel = false;
    this.visivelChange.emit(this.visivel);
    this.fechar.emit();
  }

  onMinimizar() {
    this.minimizar.emit();
  }

  onMaximizar() {
    this.maximizar.emit();
  }

  onAlterarSenhaClick() {
    console.log("📢 Botão 'Alterar Senha' clicado!");

    if (this.componenteRef && this.componenteRef.instance?.redefinirSenha) {
      console.log("✅ Chamando redefinirSenha() do componente carregado!");
      this.componenteRef.instance.redefinirSenha();
    } else {
      console.warn("🚨 O componente carregado não tem o método redefinirSenha().");
    }
  }


  
  alternarModoCadastro() {
    this.isModoConsulta = !this.isModoConsulta; // 🔄 Alterna entre true e false
    console.log("📥 JanelaPadraoComponent: alternarModoCadastro() chamado - Novo modo:", this.isModoConsulta ? "Consulta" : "Cadastro");
  
    if (this.componenteRef) { 
      this.componenteRef.instance.isModoConsulta = this.isModoConsulta;
    }
  
     if (this.isModoConsulta) {
       // 🔄 Se voltou para consulta, limpa o formulário
       this.componenteRef?.instance?.fornecedorForm?.reset();
       this.componenteRef?.instance?.fornecedorForm?.patchValue({
        tipoDePessoa: 'Jurídica',
        ativo:'true' // Exemplo: Define o tipo de pessoa como Jurídica
      });
      
     }else {
       // 🔥 Se for modo de cadastro, esconde a tela de pesquisa
    if (this.componenteRef?.instance?.setExibirTabelaPesquisa) {
      this.componenteRef.instance.resetarParaModoCadastro();
      
      
    }
     }
  
    // 🔥 Emite o evento para `DynamosoftComponent`
    this.modoConsultaChange.emit(this.isModoConsulta);
    console.log("📤 JanelaPadraoComponent: Emitindo evento `modoConsultaChange` para DynamosoftComponent.");
  }
  
  


}
