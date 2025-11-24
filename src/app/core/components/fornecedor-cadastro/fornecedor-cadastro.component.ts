import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup,ValidationErrors,Validators  } from '@angular/forms';
import { ChangeDetectorRef } from '@angular/core';
import { MunicipioService } from 'src/app/site/services/municio.service';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';
import { FornecedorService } from 'src/app/site/services/fornecedor.service';



@Component({
  selector: 'app-fornecedor-cadastro',
  templateUrl: './fornecedor-cadastro.component.html',
  styleUrls: ['./fornecedor-cadastro.component.css']
})
export class FornecedorCadastroComponent implements OnInit {
  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>(); // 🔥 Notifica mudanças de modo
  @Output() fornecedorCarregadoChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>(); // ✅ Evento para notificar a Janela Padrão
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();
  private _isModoConsulta: boolean = false;

  @Input()
set isModoConsulta(valor: boolean) {
  this._isModoConsulta = valor;
  
  // 🔥 Sempre que o valor mudar, atualize as opções dos selects:
  this.atualizarOpcoesTipoPessoa();
  this.atualizarOpcoesAtivo();
}

get isModoConsulta(): boolean {
  return this._isModoConsulta;
}

temDadosParaExcluir: boolean = false; // ✅ Adiciona a propriedade
fornecedorForm: FormGroup = new FormGroup({}); 
//isModoConsulta: boolean = true; // Inicia no modo de consulta
fornecedores: any[] = []; // Lista de fornecedores retornados pela pesquisa
selectedFornecedor: any; // Fornecedor selecionado na tabela
exibirTabela: boolean = false; // Define quando exibir a tabela
listaFornecedores: any[] = [];
fornecedorSelecionado: any;
exibirTabelaPesquisa: boolean = false; // Controla a exibição da tabela
opcoesTipoDePessoa: any[] = []; // Novo array para exibir as opções dinâmicas
fornecedorCarregado: boolean = false;




  listaDeUfs: string[] = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT',
    'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO',
    'RR', 'SC', 'SP', 'SE', 'TO'
  ];
  listaMunicipios: any[] = [];

  tipoDePessoa = [
    { label: 'Física', value: 'Física' },
    { label: 'Jurídica', value: 'Jurídica' }
  ];
  ativo = [
    { label: 'Ativo', value: 'true' },
    { label: 'Inativo', value: 'false' }
  ];

municipioDisabled = true; // O município inicia desativado
  constructor(private fb: FormBuilder, private cdr: ChangeDetectorRef,private municipioService: MunicipioService,private empresaParametroService: EmpresaParametroService,  private fornecedorService: FornecedorService  ) {
   
  }
  ngAfterViewInit(): void {
  
    setTimeout(() => {
      this.cdr.reattach(); // 🔥 Reanexa a detecção de mudanças
    });
  }
  

  ngOnInit(): void {
    this.inicializarFormularios();
    this.carregarParametroExigeDoc();
    this.atualizarOpcoesTipoPessoa();

    // 🔥 Adiciona o listener para mudar a validação dinamicamente
    this.fornecedorForm.get('tipoDePessoa')?.valueChanges.subscribe(tipo => {
      this.atualizarValidacoes(tipo);

      // 🔥 Aplica as validações iniciais
    this.atualizarValidacoes(this.fornecedorForm.get('tipoDePessoa')?.value);
  });

    
 // ✅ Atualiza `temDadosParaExcluir` sempre que o formulário mudar
 this.fornecedorForm.valueChanges.subscribe(() => {
   const temDados = !!this.fornecedorForm.get('id')?.value; // ✅ Se há ID, pode excluir
  this.temDadosParaExcluirChange.emit(temDados); // ✅ Emite para a Janela Padrão
  this.temDadosParaExcluir = !!this.fornecedorForm.get('id')?.value;
});
  
 // 🔹 Armazena o tipo de pessoa inicial antes de mudanças
 let tipoDePessoaAnterior = this.fornecedorForm.get('tipoDePessoa')?.value;
 this.fornecedorForm.get('exigeDocNoCadastro')?.valueChanges.subscribe((exigeDoc) => {
  this.atualizarValidacaoDocumento(exigeDoc);
});
 this.fornecedorForm.get('tipoDePessoa')?.valueChanges.subscribe(novoValor => {
   if (!tipoDePessoaAnterior) {
     tipoDePessoaAnterior = novoValor; // 🔹 Define valor inicial caso esteja vazio
     return;
   }

   if (novoValor !== tipoDePessoaAnterior) {
     // 🔥 Só limpa se o tipo foi REALMENTE alterado pelo usuário
     this.fornecedorForm.get('empresa.documento')?.reset();
     this.fornecedorForm.get('empresa.razaoSocial')?.reset();
   }

   tipoDePessoaAnterior = novoValor; // 🔹 Atualiza o valor anterior

   if (novoValor === 'Jurídica') {
     this.fornecedorForm.get('razaoSocial')?.setValidators([Validators.required]);
   } else {
     this.fornecedorForm.get('razaoSocial')?.clearValidators();
   }

   this.fornecedorForm.get('razaoSocial')?.updateValueAndValidity();
   this.fornecedorForm.get('documento')?.updateValueAndValidity();
 });
  }

  private setExibirTabelaPesquisa(valor: boolean): void {
    this.exibirTabelaPesquisa = valor;
    this.mostrarTelaDePesquisa.emit(valor);
  }
  

  atualizarValidacoes(tipo: string): void {
    const razaoSocial = this.fornecedorForm.get('razaoSocial');
    const nomeFantasia = this.fornecedorForm.get('nomeFantasia');
    const documentoCpfCnpj = this.fornecedorForm.get('documentoCpfCnpj');

    // 🔹 Se for Pessoa Jurídica
    if (tipo === 'Jurídica') {
        razaoSocial?.setValidators([Validators.required]);
        nomeFantasia?.setValidators([]); // Nome fantasia não é obrigatório para PJ
        documentoCpfCnpj?.setValidators([Validators.required, this.cnpjValidator]);

    // 🔹 Se for Pessoa Física
    } else {
        razaoSocial?.setValidators([]); // Razão social não se aplica a PF
        nomeFantasia?.setValidators([Validators.required]);
        documentoCpfCnpj?.setValidators([Validators.required, this.cpfValidator]);
    }

    // 🔥 Atualiza a validação dos campos
    razaoSocial?.updateValueAndValidity();
    nomeFantasia?.updateValueAndValidity();
    documentoCpfCnpj?.updateValueAndValidity();
    
        
}

cpfValidator(control: AbstractControl): ValidationErrors | null {
  const cpf = control.value?.replace(/\D/g, ''); // Remove caracteres não numéricos
  if (!cpf || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return { cpfInvalido: true };

  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return { cpfInvalido: true };

  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf[10]) ? null : { cpfInvalido: true };
}

cnpjValidator(control: AbstractControl): ValidationErrors | null {
  const cnpj = control.value?.replace(/\D/g, ''); // Remove caracteres não numéricos
  if (!cnpj || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return { cnpjInvalido: true };

  let tamanho = cnpj.length - 2, numeros = cnpj.substring(0, tamanho),
      digitos = cnpj.substring(tamanho), soma = 0, pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos[0])) return { cnpjInvalido: true };

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos[1]) ? null : { cnpjInvalido: true };
}


  atualizarOpcoesTipoPessoa(): void {
    if (this.isModoConsulta) {
        this.opcoesTipoDePessoa = [
            { label: 'Todos', value: 'TODOS' }, // 🔥 Exibe "Todos" no modo consulta
            ...this.tipoDePessoa
        ];
    } else {
        this.opcoesTipoDePessoa = [...this.tipoDePessoa];
    }}

  onCampoPreenchido() {
    const nome = this.fornecedorForm.get('nomeFantasia')?.value;
    const telefone = this.fornecedorForm.get('telefone')?.value;

    if (nome || telefone) {
      this.isModoConsulta = true;
    }
  }




// 🔍 Pesquisa fornecedor pelo nome ou telefone
onPesquisar() {
  
  // 🔥 Se estiver no modo de cadastro e o formulário estiver preenchido, volta para o modo consulta e limpa tudo
  if (!this.isModoConsulta) {
    this.fornecedorForm.reset(); // 🔥 Limpa o formulário

    

  // ✅ Aqui você seta os valores padrão novamente
  this.fornecedorForm.patchValue({
    tipoDePessoa: 'Jurídica',
    ativo: 'true'
  });
  this.atualizarValidacoes('Jurídica');
    this.isModoConsulta = true; // 🔥 Volta para o modo consulta
    this.modoConsultaChange.emit(true); //
    this.listaFornecedores = []; // 🔥 Esconde a tabela de fornecedores, se houver
    this.setExibirTabelaPesquisa(false);
    this.fornecedorCarregadoChange.emit(false); // ✅ Emite para a Janela Padrão
    this.temDadosParaExcluir = false;
    return; // ⛔ Sai da função, pois só queremos limpar o formulário
  }

  this.setExibirTabelaPesquisa(true);


  // 🔍 Obtém os critérios de pesquisa do formulário
  const filtros = {
    tipoDePessoa: this.fornecedorForm.get('tipoDePessoa')?.value,
    dataNascimento: this.fornecedorForm.get('dataNascimento')?.value,
    nomeFantasia: this.fornecedorForm.get('nomeFantasia')?.value,
    razaoSocial: this.fornecedorForm.get('razaoSocial')?.value,
    documentoCpfCnpj: this.fornecedorForm.get('documentoCpfCnpj')?.value,
    documentoRgIe: this.fornecedorForm.get('documentoRgIe')?.value,
    telefone: this.fornecedorForm.get('telefone')?.value,
    email: this.fornecedorForm.get('email')?.value,
    whatsApp: this.fornecedorForm.get('whatsApp')?.value,
    municipioIbge: this.fornecedorForm.get('municipioIbge')?.value,
    uf: this.fornecedorForm.get('uf')?.value,
    ativo: this.fornecedorForm.get('ativo')?.value
  };

  // 🔹 Se não houver nenhum critério de pesquisa, exibe alerta
  if (!filtros.nomeFantasia && !filtros.telefone && !filtros.tipoDePessoa &&
      !filtros.dataNascimento && !filtros.razaoSocial && !filtros.documentoCpfCnpj &&
      !filtros.documentoRgIe && !filtros.municipioIbge && !filtros.uf && !filtros.ativo) {
         alert("Preencha um campo para pesquisar!");
        

    return;
  }

  // 🔍 Realiza a pesquisa com os critérios informados
  this.fornecedorService.buscarFornecedor(
    filtros.tipoDePessoa, 
    filtros.dataNascimento, 
    filtros.nomeFantasia,
    filtros.razaoSocial, 
    filtros.documentoCpfCnpj, 
    filtros.documentoRgIe,
    filtros.telefone, 
    
    filtros.whatsApp, 
    filtros.email, 
    filtros.municipioIbge, 
    filtros.uf, 
    filtros.ativo
  ).subscribe(
    (res: any) => {
      if (res.length === 0) {
            this.isModoConsulta = true; // 🔥 Volta para o modo consulta
            this.modoConsultaChange.emit(true); // ✅ Adicionado
        this.enviarMensagem.emit({ mensagem: "Nenhum fornecedor encontrado.", tipo: "info" });
        this.setExibirTabelaPesquisa(false);

        return;
       
      

      } else if (res.length === 1) {
        // 🔥 Se apenas 1 resultado, carrega os dados no formulário
       
        this.fornecedorForm.patchValue(res[0]);
        this.isModoConsulta = false;
        this.fornecedorCarregado = true;
        this.temDadosParaExcluir = !!res[0].id;
        this.setExibirTabelaPesquisa(false);
        
        this.fornecedorCarregadoChange.emit(true); // ✅ Emite para a Janela Padrão
      } else {
        // 🔥 Exibe a tabela de fornecedores caso haja mais de um resultado
        this.listaFornecedores = res;
        this.setExibirTabelaPesquisa(true);
      }
    },
    (error) => {
      console.error("Erro ao buscar fornecedor", error);
      alert("Erro ao buscar fornecedor. Tente novamente.");
    }
  );

  if(this.exibirTabelaPesquisa===true){
    this.resetarParaModoCadastro();

  }
}

public resetarParaModoCadastro(): void {
  this.listaFornecedores = []; // Esconde a tabela após a seleção
  this.setExibirTabelaPesquisa(false);
  this.isModoConsulta = false;
}

  
  private carregarMunicipiosPorUF(uf: string, municipioIbge?: string) {
    if (!uf) return;
  
    this.municipioService.getMunicipiosPorEstado(uf).subscribe(
      (data) => {
        this.listaMunicipios = data || [];
        
        // 🔥 Se houver um município já cadastrado, seleciona ele na lista
        if (municipioIbge) {
          const municipioEncontrado = this.listaMunicipios.find(m => m.codigoIbge === municipioIbge);
          if (municipioEncontrado) {
            this.fornecedorForm.get('endereco.municipio.municipioIbge')?.setValue(municipioEncontrado.codigoIbge);
          }
        }
  
        this.fornecedorForm.get('endereco.municipio.municipioIbge')?.enable(); // 🔥 Habilita o campo
      },
      (error) => {
        console.error('❌ Erro ao buscar municípios:', error);
        this.listaMunicipios = [];
        this.fornecedorForm.get('endereco.municipio.municipioIbge')?.disable();
      }
    );
  }
  
  
  

onSalvar(): void {
  // 🔥 Força a validação conforme tipo de pessoa
  this.atualizarValidacoes(this.fornecedorForm.get('tipoDePessoa')?.value);

  if (this.fornecedorForm.valid) {
    let formData = this.fornecedorForm.value;

    // 🔹 Converte "Ativo/Inativo" para boolean
    formData.ativo = formData.ativo === 'Ativo';

    // 🔹 Ajusta contatos corretamente
    formData = {
      ...formData,
      contatos: this.contatosFormArray.value
    };
    
    console.log("📨 Contatos a serem enviados:", this.contatosFormArray.value);


    console.log("📤 Enviando dados para a API:", formData);

    // 🔁 Verifica se é um cadastro novo ou uma atualização
    if (formData.id) {
      // 🔄 Atualizar fornecedor
      this.fornecedorService.atualizarFornecedor(formData).subscribe(
        response => {
          
          this.enviarMensagem.emit({ mensagem: "Fornecedor atualizado com sucesso!", tipo: "success" });
          this.fornecedorForm.reset();
          this.fornecedorForm.patchValue({ tipoDePessoa: 'Jurídica' });
          this.atualizarValidacoes('Jurídica');

          // 🔥 NOVO: Muda para modo consulta
          this.isModoConsulta = false;
          this.modoConsultaChange.emit(false); // 🔔 Notifica JanelaPadraoComponent
          this.fornecedorCarregado = false;
          this.fornecedorCarregadoChange.emit(false); // 🔥 dispara evento
          this.temDadosParaExcluirChange.emit(false);
          
          
         
        },
        error => {
          console.error("❌ Erro ao atualizar fornecedor:", error);
          alert("Erro ao atualizar fornecedor. Verifique os dados e tente novamente.");
        }
      );
    } else {
      // ➕ Novo cadastro
      this.fornecedorService.cadastrarFornecedor(formData).subscribe(
        response => {
          
          this.enviarMensagem.emit({ mensagem: "Fornecedor cadastrado com sucesso!", tipo: "success" });
          this.fornecedorForm.reset();
          this.fornecedorForm.patchValue({ tipoDePessoa: 'Jurídica' });
          this.atualizarValidacoes('Jurídica');
        },
        error => {
          console.error("❌ Erro ao cadastrar fornecedor:", error);
          this.enviarMensagem.emit({ mensagem: "Erro ao cadastrar fornecedor. Verifique os dados e tente novamente. ", tipo: "error" });
         
        }
      );
    }
  } else {
    this.marcarCamposInvalidos(this.fornecedorForm);
    alert("⚠️ Preencha todos os campos obrigatórios antes de salvar.");
  }
}


  onExcluir() {
    if (!this.fornecedorForm.value.id) {
      alert("Selecione um fornecedor para excluir!");
      return;
    }
  
    const confirmacao = confirm("Tem certeza que deseja excluir este fornecedor?");
    if (!confirmacao) return;
  
    this.fornecedorService.deletarFornecedor(this.fornecedorForm.value.id).subscribe(
      () => {
        this.enviarMensagem.emit({ mensagem: "Fornecedor excluído com sucesso!", tipo: "success" });
        
        this.fornecedorForm.reset(); // 🔥 Limpa o formulário após a exclusão
        this.temDadosParaExcluir = false; // 🔥 Atualiza para esconder o botão
      },
      (error) => {
        console.error("Erro ao excluir fornecedor", error);
        alert("Erro ao excluir fornecedor. Tente novamente.");
      }
    );
  }
  



selecionarFornecedor(fornecedor: any) {
  console.log("🔍 Dados carregados do fornecedor:", fornecedor);

  if (!fornecedor) return;

  // 🔥 Preenche os dados do fornecedor normalmente
  this.fornecedorForm.patchValue({
    ...fornecedor,
    ativo: fornecedor.ativo ? 'true' : 'false' // Converte para string se necessário
  });

   // 🔥 Atualiza o status de "tem dados para excluir"
   const temDados = !!this.fornecedorForm.get('id')?.value;
   this.temDadosParaExcluirChange.emit(temDados); // ✅ Emite para a Janela Padrão
   this.fornecedorCarregadoChange.emit(true); // ✅ Emite para a Janela Padrão
     
       this.isModoConsulta = false;
       this.modoConsultaChange.emit(false); // 🔔 Notifica JanelaPadraoComponent

       

  
  // 🔥 Obtém a UF e o código do município para carregar a lista correta
  const ufSelecionado = fornecedor?.endereco?.municipio?.uf;
  const municipioIbge = fornecedor?.endereco?.municipio?.municipioIbge;

  if (ufSelecionado) {
    this.carregarMunicipiosPorUF(ufSelecionado, municipioIbge);
  }

  // 🔥 Preenche os contatos corretamente
  this.preencherContatos(fornecedor.contatos);

  this.listaFornecedores = []; // Esconde a tabela após a seleção
  this.setExibirTabelaPesquisa(false);
  this.isModoConsulta = false;
}


private preencherContatos(contatos: any[]) {
  const contatosFormArray = this.fornecedorForm.get('contatos') as FormArray;
  contatosFormArray.clear(); // Limpa os contatos antigos

  // ⚠️ Verifica se há contatos válidos
  if (Array.isArray(contatos) && contatos.length > 0) {
    contatos.forEach(contato => {
      contatosFormArray.push(this.fb.group({
        id: [contato.id || null],
        nome: [contato.nome || ''],
        email: [contato.email || ''],
        telefone: [contato.telefone || ''],
        whatsApp: [contato.whatsApp || '']
      }));
    });
  } else {
    // Só adiciona um contato vazio se realmente não vier nenhum
    contatosFormArray.push(this.fb.group({
      id: [null],
      nome: [''],
      email: [''],
      telefone: [''],
      whatsApp: ['']
    }));
  }
}


get contatos(): FormArray {
  return this.fornecedorForm.get('contatos') as FormArray;
}
private inicializarContatos(): FormArray {
  return this.fb.array([
    this.fb.group({
      id:[''],
      nome: [''],
      email: [''],
      telefone: [''],
      whatsApp: ['']
    })
  ]);
}

atualizarOpcoesAtivo(): void {
  if (this.isModoConsulta) {
    this.ativo = [
      { label: 'Todos', value: 'TODOS' },
      { label: 'Ativo', value: 'true' },
      { label: 'Inativo', value: 'false' }
    ];
  } else {
    this.ativo = [
      { label: 'Ativo', value: 'true' },
      { label: 'Inativo', value: 'false' }
    ];
  }
}



preencherFormulario(fornecedor: any) {
  if (fornecedor) {
    this.fornecedorForm.patchValue(fornecedor);
    this.isModoConsulta = false;
    this.exibirTabela = false; // Oculta a tabela após a seleção
  }
}
  
get contatosFormArray(): FormArray {
  return this.fornecedorForm.get('contatos') as FormArray;
}
adicionarContato() {
  if (this.contatosFormArray.length >= 5) {
    alert("⚠️ Você pode adicionar no máximo 5 contatos.");
    return;
  }

  this.contatosFormArray.push(
    this.fb.group({
      nome: [''],
      email: [''],
      telefone: [''],
      whatsApp: ['']
    })
  );
}
  
/** 🔹 Remove um contato pelo índice */
removerContato(index: number) {
  if (this.contatosFormArray.length === 1) {
    alert("⚠️ O formulário precisa ter pelo menos um contato.");
    return;
  }

  this.contatosFormArray.removeAt(index);
}


  atualizarValidacaoDocumento(exigeDoc: boolean): void {
    const documentoControl = this.fornecedorForm.get('documentoCpfCnpj');
  
    if (exigeDoc) {
      // 🔥 Adiciona a validação se o parâmetro exige documento for "true"
      documentoControl?.setValidators([Validators.required, this.cpfOuCnpjValidator.bind(this)]);
    } else {
      // 🔥 Remove a validação se não for obrigatório
      documentoControl?.clearValidators();
    }
  
    // 🔥 Atualiza o estado do campo
    documentoControl?.updateValueAndValidity();
  }
  
  isPessoaJuridica(): boolean {
    return this.fornecedorForm?.get('tipoDePessoa')?.value === 'Jurídica';
  }

   /** 🔥 Busca o parâmetro "exigeDocNoCadastro" e atualiza o formulário */
   carregarParametroExigeDoc(): void {
    this.empresaParametroService.getParametroPorChave('exigeDocNoCadastro').subscribe({
      next: (valor) => {
        console.log('📌 Parâmetro recebido da API:', valor, typeof valor);
  
        if (valor !== null) {
          const booleanValue = valor === 'true'; // 🔥 Converte "true"/"false" para boolean
  
          // 🔥 Atualiza o formulário
          this.fornecedorForm.patchValue({ exigeDocNoCadastro: booleanValue });
  
          // 🔥 Ajusta a validação do documento
          this.atualizarValidacaoDocumento(booleanValue);
  
          // 🔥 Força a atualização da tela
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('❌ Erro ao buscar parâmetro exigeDocNoCadastro:', err);
      }
    });
  }
  
  

  /** 🔹 Inicializa o formulário completo com a estrutura correta */
  inicializarFormularios() {
 
    this.fornecedorForm = this.fb.group({
      id:[''],
      tipoDePessoa: ['Jurídica'],
      dataNascimento: [''],
      nomeFantasia: ['',[Validators.required,this.nomeValidator.bind(this)]],
      razaoSocial: ['',this.razaoSocialValidator.bind(this)],
      documentoCpfCnpj: ['',[Validators.required, this.cpfOuCnpjValidator.bind(this)]],
      documentoRgIe: ['',[Validators.required, this.cpfOuCnpjValidator.bind(this)]],
      email: [''],
      whatsApp: [''],
      telefone: [''],
      site: [''],
      contatos: this.inicializarContatos(),

   

        endereco: this.fb.group({
          id:[''],
          logradouro: [''],
          numero: [''],
          complemento: [''],
          bairro: [''],
          cep: [''],
          municipio: this.fb.group({
            id:[''],
            codigoIbge:[''],
            municipioIbge: [{ value: '', disabled: false }, Validators.required], // 🔥 Inicia desativado
         
            uf: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
           
            
          }),
          
        }),
      ativo: ['true'],
      observacao: ['']
     
    });
    
  }




  razaoSocialValidator(control: AbstractControl): ValidationErrors | null {
    if (!this.fornecedorForm) return null; // 🔹 Evita erro antes da inicialização
  
    const tipoDePessoa = this.fornecedorForm.get('empresa.tipoDePessoa')?.value;
    
    if (tipoDePessoa === 'Jurídica' && !control.value) {
      return { razaoSocialObrigatoria: true }; // 🔹 Retorna erro quando obrigatório
    }
    
    return null; // 🔹 Se for Pessoa Física, não precisa validar
  }
  
  nomeValidator(control: AbstractControl): ValidationErrors | null {
    // 🔥 Evita erro antes da inicialização do formulário
    if (!this.fornecedorForm) return null;
  
    // 🔥 Obtém o valor atual do tipo de pessoa
    const tipoDePessoa = this.fornecedorForm?.get('tipoDePessoa')?.value;
  
    // 🔥 Se for Pessoa Física e o nome estiver vazio, retorna erro
    if (tipoDePessoa === 'Física' && (!control.value || control.value.trim() === '')) {
      return { nomeObrigatorio: true }; 
    }
  
    return null; // 🔥 Se for Pessoa Jurídica ou preenchido, sem erro
  }
  

 
  
  onUfChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const ufSelecionado = target.value;
  
    const municipioControl = this.fornecedorForm.get('endereco.municipio.municipioIbge');
  
    if (ufSelecionado) {
      this.municipioService.getMunicipiosPorEstado(ufSelecionado).subscribe(
        (data) => {
          this.listaMunicipios = data || [];
          municipioControl?.enable(); // 🔥 Habilita o campo após carregar os municípios
        },
        (error) => {
          console.error('❌ Erro ao buscar municípios:', error);
          this.listaMunicipios = [];
          municipioControl?.disable(); // 🔥 Se houver erro, mantém desativado
        }
      );
    } else {
      this.listaMunicipios = [];
      municipioControl?.disable(); // 🔥 Se não tiver UF selecionada, desativa
    }
  }
  
  

  onEstadoChange(usuarioAlterou: boolean, ufSelecionado: string, municipioIbgeBanco?: string | null): void {
    if (!ufSelecionado) {
      console.warn("⚠️ Nenhuma UF selecionada.");
      this.listaMunicipios = [];
      return;
    }
  
    console.log(`🔄 Buscando municípios para a UF: ${ufSelecionado}...`);
  
    this.municipioService.getMunicipiosPorEstado(ufSelecionado).subscribe(
      (data) => {
        if (data && data.length > 0) {
          this.listaMunicipios = data.map(municipio => ({
            codigoIbge: municipio.codigoIbge,
            nome: municipio.nome,
            uf: municipio.uf
          }));
  
          // 🔥 Se a mudança veio do banco, preenchemos o município
          if (!usuarioAlterou && municipioIbgeBanco) {
            const municipioEncontrado = this.listaMunicipios.find(m => m.nome === municipioIbgeBanco);
            if (municipioEncontrado) {
              this.fornecedorForm.get('empresa.endereco.municipio.municipioIbge')?.setValue(municipioEncontrado.nome);
            }
          } else {
            // 🔥 Se o usuário alterou, apenas limpamos o campo
            this.fornecedorForm.get('empresa.endereco.municipio.municipioIbge')?.setValue('');
          }
        } else {
          console.warn("⚠️ Nenhum município encontrado para a UF:", ufSelecionado);
          this.listaMunicipios = [];
        }
      },
      (error) => {
        console.error('❌ Erro ao buscar municípios:', error);
        this.listaMunicipios = [];
      }
    );
  }
  
  


 
/** 🔥 Função para marcar campos inválidos visualmente */
marcarCamposInvalidos(formGroup: FormGroup): void {
  Object.keys(formGroup.controls).forEach(campo => {
      const controle = formGroup.get(campo);

      if (controle instanceof FormGroup) {
          this.marcarCamposInvalidos(controle); // Aplica recursivamente nos grupos de controle
      } else {
          controle?.markAsTouched(); // Marca como tocado para exibir os erros
          controle?.updateValueAndValidity(); // Atualiza a validade para refletir os erros
      }
  });
}




  cpfOuCnpjValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null; // Se o campo estiver vazio, não valida
  
    const tipoDePessoa = this.fornecedorForm?.get('empresa.tipoDePessoa')?.value;
    const documento = control.value.replace(/\D/g, ''); // Remove caracteres não numéricos
  
    if (tipoDePessoa === 'Física') {
      if (documento.length !== 11 || !this.validarCPF(documento)) {
        return { cpfInvalido: true };
      }
    } else if (tipoDePessoa === 'Jurídica') {
      if (documento.length !== 14 || !this.validarCNPJ(documento)) {
        return { cnpjInvalido: true };
      }
    }
  
    return null;
  }
  

  /** 🔹 Valida CPF */
  validarCPF(cpf: string): boolean {
    if (!cpf || cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let soma = 0, resto;

    for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf[9])) return false;

    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(cpf[10]);
  }

  /** 🔹 Valida CNPJ */
  validarCNPJ(cnpj: string): boolean {
    if (!cnpj || cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    let tamanho = cnpj.length - 2, numeros = cnpj.substring(0, tamanho),
      digitos = cnpj.substring(tamanho), soma = 0, pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }

    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos[0])) return false;

    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;

    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(numeros[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }

    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado === parseInt(digitos[1]);
  }





}
  
  
  
  


