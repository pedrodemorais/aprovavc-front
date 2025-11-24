
import { Component, EventEmitter, Input, OnInit, Output, ViewChild, ElementRef } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProdutoService } from 'src/app/site/services/produto.service';
import { CategoriaService } from 'src/app/site/services/categoria.service';
import { MarcaService } from 'src/app/site/services/marca.service';
import { UnidadeService } from 'src/app/site/services/unidade.service';
import { ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { TabView } from 'primeng/tabview';
import { Chips } from 'primeng/chips';
import { UnidadeDto } from '../../models/unidade.dto';
import { ProdutoDTO } from '../dto/produto-dto';


export interface InsumoDTO {
  nome: string;
  quantidade: number;
  custo: number;
}
function maiorQueZero(): ValidatorFn {
  return (ctrl: AbstractControl): ValidationErrors | null => {
    const v = parseFloat(ctrl.value);
    return (isNaN(v) || v <= 0)
      ? { maiorQueZero: { actual: ctrl.value } }
      : null;
  };
}

function formatarBigDecimal(valor: any): any {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return valor;
  // Remove pontos de milhar, troca vírgula por ponto
  return Number(String(valor).replace(/\./g, '').replace(',', '.'));
}
function converterDataISOparaBR(data: string | null | undefined): string {
  if (!data || data.length < 10) return '';
  // Garante que pega sempre os 10 primeiros caracteres do ISO
  const [ano, mes, dia] = data.substring(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function converterDataParaISO(data: string): string | null {
  if (!data) return null;
  let dia, mes, ano;
  if (data.length === 8 && /^\d+$/.test(data)) {
    dia = data.substring(0, 2);
    mes = data.substring(2, 4);
    ano = data.substring(4, 8);
  } else if (data.includes('/')) {
    [dia, mes, ano] = data.split('/');
  }
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function parseDateBR(data: any): Date | null {
  if (!data || typeof data !== 'string') return null;

  // Aceita formatos 01011990 ou 01/01/1990
  let dia, mes, ano;

  if (data.length === 8 && /^\d+$/.test(data)) {
    dia = data.substring(0, 2);
    mes = data.substring(2, 4);
    ano = data.substring(4, 8);
  } else if (typeof data === 'string' && data.includes('/')) {
    [dia, mes, ano] = data.split('/');
  } else {
    return null;
  }

  if (!dia || !mes || !ano) return null;
  return new Date(Number(ano), Number(mes) - 1, Number(dia), 0, 0, 0);
}



export function dataPromocaoValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const inicioStr = group.get('dataInicioPromocao')?.value;
    const fimStr = group.get('dataFimPromocao')?.value;

    const inicio = parseDateBR(inicioStr);
    const fim = parseDateBR(fimStr);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let errors: any = {};

    console.log('[VALIDADOR] dataInicioPromocao:', inicioStr, '->', inicio);
    console.log('[VALIDADOR] dataFimPromocao:', fimStr, '->', fim);
    console.log('[VALIDADOR] hoje:', hoje);

    // Data inicial deve ser igual ou maior que hoje
    if (inicio && inicio < hoje) {
      errors.dataInicioPromocao = 'Deve ser igual ou maior que hoje.';

      console.log('[VALIDADOR] Erro início:', errors.dataInicioPromocao);
    }

    // Data final não pode ser antes da inicial
    if (inicio && fim && fim < inicio) {
      errors.dataFimPromocao = 'Não pode ser menor que a inicial.';
      console.log('[VALIDADOR] Erro fim:', errors.dataFimPromocao);
    }

    if (Object.keys(errors).length > 0) {
      console.log('[VALIDADOR] Retornando erros:', errors);
      return errors;
    } else {
      console.log('[VALIDADOR] Sem erro');
      return null;
    }
  };
}


@Component({
  selector: 'app-produto-cadastro',
  templateUrl: './produto-cadastro.component.html',
  styleUrls: ['./produto-cadastro.component.css']
})

export class ProdutoCadastroComponent implements OnInit, AfterViewInit {
addGrade2(arg0: string) {
throw new Error('Method not implemented.');
}
variacoes: any;
removeGrade1(_t395: number) {
throw new Error('Method not implemented.');
}
addGrade1(arg0: string) {
throw new Error('Method not implemented.');
}
  @ViewChild('chipsGrade1') chipsGrade1!: Chips;
  @ViewChild('codigoInput') codigoInput!: ElementRef;
  @ViewChild('descricaoInput') descricaoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('tabView') tabView!: TabView;


  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>(); // 🔥 Notifica mudanças de modo
  @Output() produtoCarregadoChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>(); // ✅ Evento para notificar a Janela Padrão
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();
  private _isModoConsulta: boolean = false;

  categorias: any[] = [];
  marcas: any[] = [];
  //produtoForm!: FormGroup;
  produtoForm: FormGroup = new FormGroup({});
  subCategorias: any[] = [];
  mostrarConversao: boolean = false;
  mostrarIntermediaria = false;
  insumos: any[] = []; // Lista de insumos
  rendimento: number = 0; // Rendimento (quantidade de produtos)
  valorVenda: number = 0; // Valor de venda por unidade
  // Variáveis para os chips e combinações
  

  public exibirConversao: boolean = false;
  insumosDisponiveis: any[] = [];
  filtroInsumo: string = '';
  insumosFiltrados: any[] = [];

nomeVariacao1: string = 'Tamanho';
nomeVariacao2: string = 'Cor';

novaOpcao1: string = '';
novaOpcao2: string = '';

opcoes1: string[] = [];
opcoes2: string[] = [];



  //unidadeEstoquePrincipal: string = 'UN'; // ou carregue dinamicamente depois


  combinacoes: any[] = [];
  unidades: UnidadeDto[] = [];
  table: any;
  tudoTravado: boolean | undefined;

  @Input()
  set isModoConsulta(valor: boolean) {
    this._isModoConsulta = valor;

    // 🔥 Sempre que o valor mudar, atualize as opções dos selects:

    this.atualizarOpcoesAtivo();
  }

  get isModoConsulta(): boolean {
    return this._isModoConsulta;
  }

  temDadosParaExcluir: boolean = false; // ✅ Adiciona a propriedade

  produtos: any[] = []; // Lista de produtos retornados pela pesquisa
  exibirTabela: boolean = false; // Define quando exibir a tabela
  listaProdutos: any[] = [];
  produtoSelecionado: any;
  exibirTabelaPesquisa: boolean = false; // Controla a exibição da tabela

  produtoCarregado: boolean = false;




  grade1Opcoes: string[] = [];
  grade2Opcoes: string[] = [];


  imagensProduto: any[] = []; // Para galeria de imagens


  mostrarAbaCustos = false;
  mostrarAbaKit = false;
  mostrarAbaVariacoes = false;
  mostrarAbaComposicao = false;


  // Listas de dropdowns
  origens = [
    { descricao: 'Nacional', value: '0' },
    { descricao: 'Estrangeira - Importação Direta', value: '1' },
    { descricao: 'Estrangeira - Adquirida no Mercado Interno', value: '2' }
  ];

  cstList = [
    { descricao: '00 - Tributada integralmente', value: '00' },
    { descricao: '20 - Com redução de base de cálculo', value: '20' },
    { descricao: '40 - Isenta', value: '40' },
    { descricao: '41 - Não tributada', value: '41' },
    { descricao: '60 - ICMS cobrado por substituição', value: '60' }
  ];

  readonly YES = 'S';
  readonly NO = 'N';

  fabricacaoPropria = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];
  mostrarNaLojaVirtual = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];

  kit = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];
  calculaEstoque = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];
  insumo = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];
  itemDeVenda = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];

  ativo = [
    { label: 'Todos', value: null },
    { label: 'Ativo', value: true },
    { label: 'Inativo', value: false }
  ];

  utilizaVariacao = [
    { label: 'Sim', value: true },
    { label: 'Não', value: false }
  ];


  constructor(
    private fb: FormBuilder,
    private categoriaService: CategoriaService,
    private marcaService: MarcaService,
    private produtoService: ProdutoService,
    private unidadeService: UnidadeService,

    private cdr: ChangeDetectorRef) {

  }
  ngAfterViewInit(): void {

    // se a aba já começa ativa:
    Promise.resolve().then(() => this.setFocusDescricao());
  }

  private setFocusDescricao() {
    if (!this.isModoConsulta && this.descricaoInput) {
      this.descricaoInput.nativeElement.focus();
    }
  }

  enviarImagemPrincipal(event: any) {
    const file = event.target.files[0];
    if (file) {
      // TODO: lógica de envio para backend
      console.log('Imagem principal selecionada:', file);
    }
  }

  enviarGaleriaImagens(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      // TODO: lógica de envio múltiplo
      console.log('Galeria de imagens selecionada:', files);
    }
  }
  onCampoBlur(nomeCampo: string) {
    this.produtoForm.get(nomeCampo)?.markAsTouched();
    this.produtoForm.updateValueAndValidity();
  }


  enviarFichaTecnica(event: any) {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      // TODO: lógica de envio para backend
      console.log('Ficha técnica selecionada:', file);
    }
  }





  onUnidadeChange(): void {
    const unidadeCompra = this.produtoForm.get('unidadeCompraId')?.value;
    const unidadeIntermediaria = this.produtoForm.get('unidadeIntermediaria')?.value;


    // Se a unidade de compra for a final (ex: UN, ML), desabilita linha intermediária
    if (!unidadeCompra || unidadeCompra === 'UN' || unidadeCompra === 'ML') {
      this.mostrarIntermediaria = false;
      this.produtoForm.patchValue({
        unidadeIntermediaria: null,
        fatorConversaoIntermediaria: 1
      });
    } else {
      this.mostrarIntermediaria = true;
    }
  }

  calcularTotalUnidades(): number {
    const mult1 = this.produtoForm.get('multiplicadorCompra')?.value || 1;
    const mult2 = this.mostrarIntermediaria ? this.produtoForm.get('multiplicadorIntermediaria')?.value || 1 : 1;
    return mult1 * mult2;
  }
  onUploadImagem(event: any): void {
    // Supondo que o backend retorna URL da imagem
    const uploadedFile = event.files[0];
    this.imagensProduto.push({ url: uploadedFile.objectURL || 'CAMINHO_NO_BACKEND' });
  }

  removerImagem(imagem: any): void {
    this.imagensProduto = this.imagensProduto.filter(img => img !== imagem);
  }

  uploadFichaTecnica(event: any): void {
    const file = event.files[0];
    // Após salvar no backend, atribuir o caminho ou ID ao form
    this.produtoForm.patchValue({ fichaTecnica: file.name || 'CAMINHO_DO_ARQUIVO' });
  }
  enviarImagem(event: any): void {
    const file = event.files[0];

    const formData = new FormData();
    formData.append('file', file);


  }



  trackByIndex(index: number, item: any): any {
    return index;
  }



  removerOpcaoGrade1(index: number) {
    this.grade1Opcoes.splice(index, 1);
  }


  removerOpcaoGrade2(index: number) {
    this.grade2Opcoes.splice(index, 1);
  }

  onGerarVariacoes() {
    if (this.grade1Opcoes.length === 0) {
      alert('Adicione pelo menos uma opção em Grade 1');
      return;
    }



  }





  ngOnInit(): void {
this.carregarUnidades(); // ✅ NOVO
    this.inicializarFormularios();
    this.carregarCategorias();
    this.carregarMarcas();
    

    this.carregarInsumosDisponiveis();

    this.insumosFiltrados = this.insumosDisponiveis; // Inicia com todos


    this.produtoForm.get('utilizaVariacao')?.valueChanges.subscribe(() => {
      this.atualizarVisibilidadeAbas();
    });

const produto = this.produtoForm.value;

  if (produto.utilizaVariacao && produto.variacoes) {
    this.variacoes = [...produto.variacoes];
  }

    this.produtoForm.valueChanges.subscribe(() => {
      // 1) mantém a lógica de exclusão
      const temDados = !!this.produtoForm.get('id')?.value;
      this.temDadosParaExcluirChange.emit(temDados);
      this.temDadosParaExcluir = temDados;


      this.atualizarVisibilidadeAbas();
    });

    // chamada inicial
    this.atualizarVisibilidadeAbas();

    this.produtoForm.get('unidadeEstoqueId')?.valueChanges.subscribe(() => {
      this.verificarConversaoNecessaria();
    });

    this.produtoForm.get('unidadeCompraId')?.valueChanges.subscribe(() => {
      this.verificarConversaoNecessaria();
    });

    this.produtoForm.get('unidadeCompraId')!.valueChanges.subscribe(unidadeSelecionada => {
      this.conversoes.clear();

      if (unidadeSelecionada) {
        const primeiraConversao = this.criarConversaoForm({
          unidade: unidadeSelecionada,
          fatorConversao: 1,
          desabilitar: true // desativa o campo unidade
        });

        this.conversoes.push(primeiraConversao);
      }

    });

    // 👇 E também se já vier preenchido (modo edição), adiciona a conversão ao carregar:
    const unidadeInicial = this.produtoForm.get('unidadeCompraId')?.value;
    if (unidadeInicial) {
      const primeiraConversao = this.criarConversaoForm({
        unidade: unidadeInicial,
        fatorConversao: 1,
        desabilitar: true
      });

      this.conversoes.push(primeiraConversao);
    }
    this.produtoForm.get('dataInicioPromocao')?.valueChanges.subscribe(valor => {
      const inicio = parseDateBR(valor);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const dataInvalida = !inicio || inicio < hoje;


    });

      const custoUnid = () => this.calcularCustoPorUnidade();
      let updating = false;
       this.produtoForm.get('markup')!.valueChanges.subscribe(markupPct => {
    if (updating) return;
    updating = true;

    const mk = Number(markupPct) / 100;              // ex: 20% → 0.2
    const venda = custoUnid() * (1 + mk);            // preço de venda
    const mg  = (mk / (1 + mk)) * 100;               // margem = profit / venda

    this.produtoForm.patchValue({
      margemLucro: parseFloat(mg.toFixed(2)),
      valorVenda:  parseFloat(venda.toFixed(2))
    }, { emitEvent: false });

    updating = false;
  });

  // Quando o usuário digita MARGEM DE LUCRO
  this.produtoForm.get('margemLucro')!.valueChanges.subscribe(mgPct => {
    if (updating) return;
    updating = true;

    const mg = Number(mgPct) / 100;                   // ex: 16.67% → 0.1667
    const mk = mg / (1 - mg);                        // markup = mg/(1-mg)
    const venda = custoUnid() * (1 + mk);

    this.produtoForm.patchValue({
      markup:     parseFloat((mk * 100).toFixed(2)),
      valorVenda: parseFloat(venda.toFixed(2))
    }, { emitEvent: false });

    updating = false;
  });

  // Quando o usuário digita VALOR DE VENDA
  this.produtoForm.get('valorVenda')!.valueChanges.subscribe(venda => {
    if (updating) return;
    updating = true;

    const v  = Number(venda);
    const cu = custoUnid();
    const mk = (v / cu) - 1;                          // markup = (v/custo) - 1
    const mg = (v - cu) / v;                          // margem = profit/venda

    this.produtoForm.patchValue({
      markup:     parseFloat((mk * 100).toFixed(2)),
      margemLucro: parseFloat((mg * 100).toFixed(2))
    }, { emitEvent: false });

    updating = false;
  });

  }




  // carregarInsumosDisponiveis() {
  //   this.produtoService.buscarProdutosInsumo().subscribe({
  //     next: (res) => {
  //       this.insumosDisponiveis = (res || []).map((i: any) => ({
  //         id: i.id,
  //         descricao: i.descricao || i.nome || '(Sem descrição)',
  //         custo: i.custo ?? i.precoCompra ?? 0
  //       }));
  //       this.cdr.detectChanges();
  //       // 🔥 Só adiciona o grupo de insumo após garantir que insumosDisponiveis foi carregado!
  //       if (this.produtoForm.get('fabricacaoPropria')?.value === true && this.insumosFormArray.length === 0) {
  //         this.adicionarInsumo();
  //       }
  //       console.log('🔍 insumosDisponiveis:', this.insumosDisponiveis); // Veja o console!
  //     },
  //     error: (err) => {
  //       console.error('Erro ao carregar insumos:', err);
  //       this.insumosDisponiveis = [];
  //     }
  //   });
  // }




  
getUnidadeSigla(insumoId: number): string {
  console.log('🔍 getUnidadeSigla(', insumoId, ')');
  console.log('📦 insumosDisponiveis:', this.insumosDisponiveis);

  const ins = this.insumosDisponiveis.find(i => i.id === insumoId);
  console.log('🔎 encontrou:', ins);

  return ins?.unidadeSigla || '';
}
getCodInsumos(insumoId: number): string {


  const ins = this.insumosDisponiveis.find(i => i.id === insumoId);
  console.log('🔎 encontrou:', ins);

  return ins?.codigo || '';
}
carregarInsumosDisponiveis() {
  this.produtoService.buscarProdutosInsumo()
    .subscribe((res: ProdutoDTO[]) => {
      console.log('🔍 insumos raw DTO:', res);

      this.insumosDisponiveis = res.map(insumoDTO => {
        // pega o ID da unidade do DTO
        const unidadeId = insumoDTO.unidadeEstoqueId  
                       ?? insumoDTO.unidadeCompraId 
                       ?? null;

        // faz lookup em this.unidades
        const unidadeDto = this.unidades.find(u => u.id === unidadeId);
        console.log(`🔄 Insumo ${insumoDTO.id} -> unidadeId=${unidadeId} ->`, unidadeDto);

        return {
          id:            insumoDTO.id!,
          codigo:            insumoDTO.codigo,  
          descricao:     insumoDTO.descricao,
          custo:         insumoDTO.custo ?? insumoDTO.precoCompra ?? 0,
          unidadeSigla:  unidadeDto?.sigla ?? '??',   // fallback visual
         
        };
      });

      console.log('✅ insumosDisponiveis enriquecidos:', this.insumosDisponiveis);
      this.cdr.detectChanges();

      if (this.produtoForm.get('fabricacaoPropria')?.value && this.insumosFormArray.length === 0) {
        this.adicionarInsumo();
      }
    },
    err => {
      console.error('❌ Erro ao carregar insumos:', err);
      this.insumosDisponiveis = [];
    });
}
getCodigoInsumo(insumoId: number | null): string {
  if (insumoId == null) {
    return '';
  }
  const ins = this.insumosDisponiveis.find(i => i.id === insumoId);
  return ins?.codigo ?? '';
}

  atualizarCustoInsumo(index: number) {
    const grupo = this.insumosFA.at(index);
    const insumoId = grupo.get('insumos')?.value;
    const insumo = this.insumosDisponiveis.find(i => String(i.id) === String(insumoId));
    console.log('🔁 Atualizou custo', insumo, 'ID:', insumoId, 'Insumos disponíveis:', this.insumosDisponiveis);
    if (insumo) {
      grupo.get('custo')?.setValue(insumo.custo ?? insumo.precoCompra ?? 0);
    }
  }



  verificarConversaoNecessaria(): void {
    const unidadeEstoque = this.produtoForm.get('unidadeEstoqueId')?.value;
    const unidadeCompra = this.produtoForm.get('unidadeCompraId')?.value;

    // Se ambas estão preenchidas e diferentes
    this.exibirConversao = !!(unidadeEstoque && unidadeCompra && unidadeEstoque !== unidadeCompra);
  }

  private atualizarVisibilidadeAbas(): void {

    this.mostrarAbaKit = this.produtoForm.get('kit')!.value === true;
    this.mostrarAbaVariacoes = this.produtoForm.get('utilizaVariacao')!.value === true;
    this.mostrarAbaComposicao = this.produtoForm.get('fabricacaoPropria')!.value === true;
    this.mostrarAbaVariacoes = this.produtoForm.get('utilizaVariacao')!.value === true;

    this.cdr.detectChanges();
  }


  private carregarUnidades(): void {
    this.unidadeService.buscarTodasUnidades()
      .subscribe({
        next: (unidades) => this.unidades = unidades,
     
        error: (err) => console.error('Erro ao buscar unidades', err)
      });
  }


  carregarCategorias(): void {
    this.categoriaService.buscarTodasCategorias().subscribe(
      (res) => {
        this.categorias = res;
        console.log("✅ Categorias com subcategorias:", this.categorias);
      },
      (err) => {
        console.error("❌ Erro ao carregar categorias:", err);
      }
    );
  }

  carregarSubcategorias(categoria: any): void {
    console.log('🔍 Categoria recebida:', categoria);

    // 1) cheque a propriedade correta (tudo minúsculo)
    if (!categoria?.subcategorias?.length) {
      this.subCategorias = [];
      this.produtoForm.patchValue({ subCategoria: null });
      return;
    }

    // 2) atribua sem “?” de diferença
    this.subCategorias = categoria.subcategorias;

    // 3) zere o control singular
    this.produtoForm.get('subCategoria')!.setValue(null);
  }
  /** Retorna a quantidade de insumos atualmente carregados no formulário */
  get insumosCount(): number {
    const arr = this.produtoForm.get('insumos') as FormArray;
    return arr ? arr.length : 0;
  }


  carregarMarcas(): void {
    this.marcaService.buscarTodasMarcas().subscribe(
      (res) => {
        this.marcas = res;
        console.log("✅ ✅ Marcas carregadas:", this.marcas);
      },
      (err) => {
        console.error("❌ Erro ao carregar marcas:", err);
      }
    );
  }


  private setExibirTabelaPesquisa(valor: boolean): void {
    this.exibirTabelaPesquisa = valor;
    this.mostrarTelaDePesquisa.emit(valor);
  }





  onPesquisar() {
    // 🔥 Se estiver no modo de cadastro e o formulário estiver preenchido, volta para modo consulta e limpa tudo
    if (!this.isModoConsulta) {
      this.produtoForm.reset();

      // ✅ Define valores padrão novamente
      this.produtoForm.patchValue({
        ativo: 'true'
      });

      this.isModoConsulta = true;
      this.modoConsultaChange.emit(true);
      this.listaProdutos = [];
      this.setExibirTabelaPesquisa(false);
      this.produtoCarregadoChange.emit(true);
      this.temDadosParaExcluir = false;
      return;
    }

    this.setExibirTabelaPesquisa(true);

    // 🔍 Obtém os critérios de pesquisa do formulário
    const filtros = {
      codigo: this.produtoForm.get('codigo')?.value,
      descricao: this.produtoForm.get('descricao')?.value,
      categoriaId: this.produtoForm.get('categoriaId')?.value,
      subcategoriaId: this.produtoForm.get('subcategoriaId')?.value,
      marcaId: this.produtoForm.get('marcaId')?.value,
      ativo: this.produtoForm.get('ativo')?.value
    };

    // 🔹 Se nenhum campo preenchido, exibe alerta
    if (!filtros.codigo && !filtros.descricao && !filtros.categoriaId &&
      !filtros.subcategoriaId && !filtros.marcaId && !filtros.ativo) {
      alert("Preencha pelo menos um campo para pesquisar!");
      return;
    }


    this.produtoService.buscarProdutosPorFiltro(filtros).subscribe(
      (res: ProdutoDTO[]) => {
        if (res.length === 0) {
          this.isModoConsulta = true;
          this.modoConsultaChange.emit(true);
          this.enviarMensagem.emit({ mensagem: "Nenhum produto encontrado.", tipo: "info" });
          this.setExibirTabelaPesquisa(false);
          return;
        }

        else {
          this.listaProdutos = res;
          this.setExibirTabelaPesquisa(true);
        }
      },
      (error) => {
        console.error("Erro ao buscar produtos", error);
        alert("Erro ao buscar produtos. Tente novamente.");
      }
    );

    if (this.exibirTabelaPesquisa === true) {
      this.resetarParaModoCadastro();
    }
  }



  setarInsumos(insumos: any[] = []): void {
    // Mapeia o array do backend para o formato do formulário
    const fg = insumos.map(i => this.fb.group({
      insumos: [i.id ?? null, Validators.required], // Só o id do insumo!
      quantidade: [i.quantidade, Validators.required],
      custo: [i.custo, Validators.required]
    }));
    this.produtoForm.setControl('insumos', this.fb.array(fg));
    this.cdr.detectChanges();
  }

  private garantirInsumosDisponiveis(insumosDoProduto: any[]): void {
    insumosDoProduto.forEach(insumo => {
      const existe = this.insumosDisponiveis.some(i => i.id === insumo.id);
      if (!existe) {
        this.insumosDisponiveis.push({
          id: insumo.id,
          descricao: insumo.nome ?? insumo.descricao ?? '(Sem descrição)',
          precoCompra: insumo.custo ?? 0 // ou outro campo padrão
        });
      }
    });
  }



  resetarParaModoCadastro(): void {
    this.listaProdutos = [];
    this.setExibirTabelaPesquisa(false);
    this.isModoConsulta = false;
    this.produtoForm.reset({
      ativo: true,
      fabricacaoPropria: true
    });

    // Limpa e ADICIONA insumo inicial se fabricação própria
    this.insumosFormArray.clear();
    if (this.produtoForm.get('fabricacaoPropria')?.value === true) {
      this.adicionarInsumo();
    }

    // Força valueChanges a rodar
    this.produtoForm.get('fabricacaoPropria')?.setValue(true, { emitEvent: true });

    this.atualizarVisibilidadeAbas();
  }



  get insumosFormArray(): FormArray {
    return this.produtoForm.get('insumos') as FormArray;
  }



  onSalvar(): void {
    const arr = this.insumosFormArray;
    for (let i = arr.length - 1; i >= 0; i--) {
      const grupo = arr.at(i);
      // Se todos os campos estão vazios (ou seja, nunca foi preenchido)
      if (
        !grupo.get('insumos')?.value &&
        (!grupo.get('quantidade')?.value || grupo.get('quantidade')?.value === 0) &&
        (!grupo.get('custo')?.value || grupo.get('custo')?.value === 0)
      ) {
        arr.removeAt(i);
      }
    }

    if (this.produtoForm.invalid) {
      this.produtoForm.markAllAsTouched();

      const invalidControls = Object.entries(this.produtoForm.controls)
        .filter(([_, control]) => control.invalid)
        .map(([name, _]) => name);
      console.warn('Controles inválidos:', invalidControls);

      alert("⚠️ Preencha todos os campos obrigatórios antes de salvarrrrr.");
      return;
    }

    if (this.produtoForm.valid) {
      // 🔄 Clona os dados do form
      const formValue = this.produtoForm.value;

      // 🔥 Extrai os IDs de categoria e subCategoria se existirem
      const categoriaId = formValue.categoria?.id;
      const subcategoriaId = formValue.subCategoria?.id;


      // ✅ Monta payload limpo, removendo os objetos e substituindo por IDs
      const payload: any = {
        ...formValue,
        categoriaId: categoriaId ?? formValue.categoriaId,
        subcategoriaId: subcategoriaId ?? formValue.subcategoriaId,
        ativo: formValue.ativo === 'Ativo'
      };
      payload.precoCompra = formatarBigDecimal(payload.precoCompra);
      payload.precoVendaVarejo = formatarBigDecimal(payload.precoVendaVarejo);
      payload.precoVendaAtacado = formatarBigDecimal(payload.precoVendaAtacado);
      payload.precoPromocional = formatarBigDecimal(payload.precoPromocional);
      payload.valorVenda = formatarBigDecimal(payload.valorVenda);
      delete payload.categoria;
      delete payload.subCategoria;

      // -------------- AJUSTE PARA INSUMOS! ----------------
      if (payload.insumos && Array.isArray(payload.insumos)) {
        payload.insumos = payload.insumos
          .filter((i: any) => !!i.insumos && i.quantidade > 0) // só envia os válidos
          .map((i: any) => {
            const insumoInfo = this.insumosDisponiveis.find(ins => ins.id == i.insumos);
            return {
              id: insumoInfo ? insumoInfo.id : i.insumos,
              nome: insumoInfo ? insumoInfo.descricao : '',
              quantidade: i.quantidade,
              custo: i.custo
            };
          });
      }

      // -------------- FIM DO AJUSTE ----------------
      // ...dentro do seu onSalvar(), antes do cadastrarProduto() ou atualizarProduto()
      if (payload.dataInicioPromocao) {
        payload.dataInicioPromocao = converterDataParaISO(payload.dataInicioPromocao);
      }
      if (payload.dataFimPromocao) {
        payload.dataFimPromocao = converterDataParaISO(payload.dataFimPromocao);
      }


      console.log("📤 Enviando dados para a API:", payload);

      if (payload.id) {
        // 🔄 Atualizar produtos
        this.produtoService.atualizarProduto(payload).subscribe(
          response => {
            this.enviarMensagem.emit({ mensagem: "Produto atualizado com sucesso!", tipo: "success" });
            this.produtoForm.reset();

            this.isModoConsulta = false;
            this.modoConsultaChange.emit(false);
            this.produtoCarregado = false;
            this.produtoCarregadoChange.emit(false);
            this.temDadosParaExcluirChange.emit(false);
          },
          error => {
            console.error("❌ Erro ao atualizar produto:", error);
            alert("Erro ao atualizar produto. Verifique os dados e tente novamente.");
          }
        );
      } else {
        // ➕ Novo cadastro
        this.produtoService.cadastrarProduto(payload).subscribe(
          response => {
            this.enviarMensagem.emit({ mensagem: "Produto cadastrado com sucesso!", tipo: "success" });
            this.produtoForm.reset();
          },
          error => {
            console.error("❌ Erro ao cadastrar produto:", error);
            this.enviarMensagem.emit({
              mensagem: "Erro ao cadastrar produto. Verifique os dados e tente novamente.",
              tipo: "error"
            });
          }
        );
      }
    } else {
      this.marcarCamposInvalidos(this.produtoForm);
      alert("⚠️ Preencha todos os campos obrigatórios antes de salvar.");
    }
  }


  onExcluir() {
    if (!this.produtoForm.value.id) {
      alert("Selecione um produto para excluir!");
      return;
    }

    const confirmacao = confirm("Tem certeza que deseja excluir este produto?");
    if (!confirmacao) return;

    this.produtoService.deletarProduto(this.produtoForm.value.id).subscribe(
      () => {
        this.enviarMensagem.emit({ mensagem: "Produto excluído com sucesso!", tipo: "success" });

        this.produtoForm.reset(); // 🔥 Limpa o formulário após a exclusão
        this.temDadosParaExcluir = false; // 🔥 Atualiza para esconder o botão
      },
      (error) => {
        console.error("Erro ao excluir produto", error);
        alert("Erro ao excluir produto. Tente novamente.");
      }
    );
  }
  formatarValor(controlName: string) {
    let valor = this.produtoForm.get(controlName)?.value;
    if (valor !== null && valor !== undefined && valor !== '') {
      // Remove todos os caracteres que não são número nem vírgula
      valor = valor.replace(/[^\d,]/g, '');

      // Se não tem vírgula, adiciona ",00" no final
      if (!valor.includes(',')) {
        valor += ',00';
      } else {
        // Se tem vírgula, garante duas casas decimais
        let partes = valor.split(',');
        let decimais = (partes[1] || '');
        if (decimais.length === 0) {
          valor += '00';
        } else if (decimais.length === 1) {
          valor += '0';
        } else if (decimais.length > 2) {
          valor = partes[0] + ',' + decimais.substring(0, 2);
        }
      }

      // Agora converte para número para formatar com milhar
      let numero = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
      let valorFormatado = 'R$' +numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      this.produtoForm.get(controlName)?.setValue(valorFormatado, { emitEvent: false });
    }
  }



  selecionarProduto(produto: any) {
    console.log("🔍 Dados carregados do produto:", produto);
    console.log("🔍 Produto selecionado:", produto);
    console.log("🟡 MarcaId do produto:", produto.marcaId);
    // 1. Converte as datas antes do patchValue!
    if (produto.dataInicioPromocao) {
      produto.dataInicioPromocao = converterDataISOparaBR(produto.dataInicioPromocao);
    }
    if (produto.dataFimPromocao) {
      produto.dataFimPromocao = converterDataISOparaBR(produto.dataFimPromocao);
    }

    if (!produto) return;

    const marcaId = produto.marcaId;
    const marcaExiste = this.marcas.some(m => m.id === marcaId);

    if (!marcaExiste) {
      console.warn('🚫 Marca não encontrada na lista atual de marcas!');
      // opcional: mostrar alerta pro usuário
    }
    const categoriaSelecionada = this.categorias.find(c => c.id === produto.categoriaId);
    let subcategoriaSelecionada = null;

    // ⚠️ Carrega as subcategorias da categoria correspondente
    if (categoriaSelecionada) {
      this.carregarSubcategorias(categoriaSelecionada); // já seta this.subCategorias
      subcategoriaSelecionada = categoriaSelecionada.subcategorias?.find(
        (sc: { id: any; }) => sc.id === produto.subcategoriaId
      );
    }

    this.produtoForm.patchValue({
      ...produto,
      categoria: categoriaSelecionada ?? null,
      subCategoria: subcategoriaSelecionada ?? null,
      marcaId: marcaExiste ? marcaId : null,
      ativo: produto.ativo === true
    });


    this.produtoForm.patchValue({
      ...produto,
      usaConversao: !!produto.usaConversao,
      marcaId: marcaId,
      ativo: produto.ativo === true || produto.ativo === 'true' || produto.ativo === 'Ativo'
    });

    if (produto.insumos && produto.insumos.length) {
      // 👇 Garante que todos os insumos do produto existam em insumosDisponiveis
      this.garantirInsumosDisponiveis(produto.insumos);

      this.setarInsumos(produto.insumos);
    }


    this.temDadosParaExcluirChange.emit(!!produto.id);
    this.produtoCarregadoChange.emit(true);
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.listaProdutos = [];
    this.setExibirTabelaPesquisa(false);
  }


  compararValores(op1: any, op2: any): boolean {
    return op1 === op2;
  }


  atualizarOpcoesAtivo(): void {
    if (this.isModoConsulta) {
      this.ativo = [
        { label: 'Todos', value: null },
        { label: 'Ativo', value: true },
        { label: 'Inativo', value: false }
      ];
    } else {
      this.ativo = [
        { label: 'Ativo', value: true },
        { label: 'Inativo', value: false }
      ];
    }
  }



  preencherFormulario(produto: any) {
    if (produto) {
      this.produtoForm.patchValue(produto);
      this.isModoConsulta = false;
      this.exibirTabela = false; // Oculta a tabela após a seleção
    }
  }



  /** 🔹 Inicializa o formulário completo com a estrutura correta */
  inicializarFormularios() {
    this.produtoForm = this.fb.group({
      // Identificação
      id: [null],
      codigo: [null],
      codigoProprio: [null],
      referencia: [null],
      descricao: [null],

      //unidade: [''],
      marcaId: [null],
      categoria: [null],
      subCategoria: [null],

      mostrarNaLojaVirtual: [null],

      rendimento: [null],

      // Variações e tipos
      fabricacaoPropria: [false],
      kit: [false],
      calculaEstoque: [null],
      insumos: this.fb.array([]),
      ativo: [true],
      utilizaVariacao: [false],


      itemDeVenda: [null],
      insumo: [false],


      // Dimensões
      altura: [null],
      largura: [null],
      profundidade: [null],
      volume: [null],
      pesoBruto: [null],
      pesoLiquido: [null],

      // Estoque
      unidadeEstoqueId: [null],
      unidadeCompraId: [null],
      conversoes: this.fb.array([]),

      estoqueAtual: [{ value: null, disabled: true }],
      estoqueMinimo: [null],
      estoqueMaximo: [null],
      localizacaoEstoque: [null],

      // Estoque Avançado
      produtoPerecivel: [null],
      controlaValidade: [null],
      controlaLote: [null],
      controlaSerie: [null],


      // Conversão

      // Preço e Custos
      precoCompra: [null],
      precoVendaVarejo: [null],
      precoVendaAtacado: [null],
      precoPromocional: [null],
      dataInicioPromocao: [null],
      dataFimPromocao: [null],
      markup: [null],
      margemLucro: [null],
      descontoPermitido: [null],

      // Complementares
      observacoesInternas: [null],
      descricaoPublica: [null],

      // Fiscal/Tributação
      ncm: [null],
      cfop: [null],
      cest: [null],
      origem: [null],
      cst: [null],
      aliquotaIcms: [null],
      aliquotaIpi: [null],

      // Extras não usados diretamente (mantidos se forem usados no backend)




      valorVenda: [null],

    }, { validators: [dataPromocaoValidator()] });
  }
  /** Getter só para facilitar o acesso na template */

  get conversoes(): FormArray {
    return this.produtoForm.get('conversoes') as FormArray;
  }

  get desabilitarAdicionarNivel(): boolean {

    const unidadeEstoque = this.produtoForm.get('unidadeEstoqueId')?.value;
    const ultimaConversao = this.conversoes.at(this.conversoes.length - 1);

    // ❌ Se última conversão for igual à unidade de estoque → bloqueia
    if (ultimaConversao?.get('unidade')?.value === unidadeEstoque) {
      return true;
    }

    // ❌ Se algum nível estiver inválido (sem unidade ou multiplicador) → bloqueia
    for (let i = 0; i < this.conversoes.length; i++) {
      const grupo = this.conversoes.at(i);
      if (
        !grupo.get('unidade')?.value ||
        !grupo.get('fatorConversao')?.value ||
        grupo.get('fatorConversao')?.value <= 0
      ) {
        return true;
      }
    }

    return false; // ✅ Pode adicionar
  }
  getNomeCategoria(produto: any): string {
    // pega o id da categoria (objeto ou só o id)
    const categoriaId = produto.categoria?.id ?? produto.categoriaId;
    const categoria = this.categorias.find(c => c.id === categoriaId);
    return categoria?.nome || '---';
  }
  getNomeMarca(produto: any): string {
    // pega o id da marca (objeto ou só o id)
    const marcaId = produto.marca?.id ?? produto.marcaId;
    const marca = this.marcas.find(m => m.id === marcaId);
    return marca?.nome || '---';
  }

  adicionarNivelConversao(): void {
    const ultima = this.conversoes.at(this.conversoes.length - 1);
    const unidadeUltima = ultima?.get('unidade')?.value;
    const unidadeEstoque = this.produtoForm.get('unidadeEstoqueId')?.value;

    if (unidadeUltima?.id === unidadeEstoque?.id) {
      // Opcional: exibir alerta se o botão for forçado via devtools
      return;
    }

    const novaConversao = this.criarConversaoForm();
    this.conversoes.push(novaConversao);
  }

  getTotalAcumulado(index: number): number {
    let total = 1;
    for (let i = 0; i <= index; i++) {
      const mult = Number(this.conversoes.at(i).get('fatorConversao')?.value || 1);
      total *= mult;
    }
    return total;
  }




  private criarInsumoGroup(ini?: any): FormGroup {
    return this.fb.group({
      insumos: [ini?.insumos ?? null, Validators.required],
      quantidade: [ini?.quantidade ?? null, [Validators.required, Validators.min(0.0001)]],
      custo: [ini?.custo ?? null, [Validators.required, Validators.min(0)]]
    });
  }

  /** Popular quando estiver editando */
  inicializarInsumos(lista: InsumoDTO[]): void {
    lista.forEach(insumo => this.insumosFA.push(this.criarInsumoGroup(insumo)));
  }


  get insumosFA(): FormArray {
    const ctrl = this.produtoForm.get('insumos');
    return ctrl instanceof FormArray ? ctrl : this.fb.array([]);
  }



  // Exibe resultado cumulativo da conversão
  getResultadoConversao(index: number): number {
    let total = 1;
    const valores = this.conversoes.controls;
    for (let i = 0; i <= index; i++) {
      const valor = valores[i].get('fatorConversao')?.value;
      total *= valor ? +valor : 1;
    }
    return total;
  }


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


  ultimoInsumoPreenchido(): boolean {
    const arr = this.insumosFormArray;
    if (!arr.length) return true; // Se não tem nenhum, pode adicionar

    const ultimo = arr.at(arr.length - 1);
    return (
      !!ultimo.get('insumos')?.value &&
      +ultimo.get('quantidade')?.value > 0 &&
      +ultimo.get('custo')?.value > 0
    );
  }
  getInsumos(index: number) {
    const selecionados = this.insumosFA.controls
      .map((g, i) => i !== index ? g.get('insumos')?.value : null)
      .filter(v => v != null);

    return this.insumosDisponiveis
      .filter(opt =>
        opt.id === this.insumosFA.at(index).get('insumos')?.value ||
        !selecionados.includes(opt.id)
      );
  }

  adicionarInsumo(): void {

    console.log("Adicionar insumo clicado!");
    if (!this.insumosDisponiveis.length) {
      alert('A lista de insumos ainda não foi carregada!');
      return;
    }
    if (this.insumosFormArray.length) {
      const ultimo = this.insumosFormArray.at(this.insumosFormArray.length - 1);

      // Validação completa
      const insumoValido = !!ultimo.get('insumos')?.value;
      const quantidadeValida = !!ultimo.get('quantidade')?.value && Number(ultimo.get('quantidade')?.value) > 0;
      const custoValido = !!ultimo.get('custo')?.value || Number(ultimo.get('custo')?.value) === 0; // custo pode ser zero, mas não nulo

      if (!insumoValido || !quantidadeValida || !custoValido) {
        // Marca todos os campos como tocados para exibir erros visuais
        ultimo.get('insumos')?.markAsTouched();
        ultimo.get('quantidade')?.markAsTouched();
        ultimo.get('custo')?.markAsTouched();

        let msg = '⚠️ Preencha corretamente todos os campos do insumo antes de adicionar outro.';
        if (!quantidadeValida) {
          msg = '⚠️ A quantidade do insumo deve ser maior que zero!';
        }
        alert(msg);
        return;
      }
    }

    // Se passou na validação, adiciona novo insumo
    this.insumosFormArray.push(this.fb.group({
      insumos: [null, Validators.required],
      quantidade: [null, [Validators.required, Validators.min(0.0001)]], // já obriga a ser maior que zero
      custo: [0, Validators.required]
    }));
  }





  criarInsumo(): FormGroup {
    return this.fb.group({
      insumos: [null, Validators.required],
      quantidade: [null, [Validators.required, Validators.min(0)]],
      custo: [null, [Validators.required, Validators.min(0)]],
    });
  }

  removerInsumo(index: number) {
    (this.produtoForm.get('insumos') as FormArray).removeAt(index);
    this.cdr.detectChanges();
  }


  calcularTotalCusto(): number {
    // pega o array de objetos diretamente do formulário
    const insumos: { quantidade: number, custo: number }[] = this.insumosFormArray.value;
    return insumos.reduce((sum, ins) =>
      sum + (ins.quantidade ?? 0) * (ins.custo ?? 0)
      , 0);
  }


  calcularCustoPorUnidade(): number {
    // lê o rendimento direto do form control
    const rendimento = this.produtoForm.get('rendimento')?.value ?? 0;
    if (rendimento <= 0) {
      return 0;
    }
    return this.calcularTotalCusto() / rendimento;
  }

  calcularLucroPorUnidade(): number {
    const valorVenda = this.produtoForm.get('valorVenda')?.value ?? 0;
    const custoPorUnidade = this.calcularCustoPorUnidade();
    return valorVenda - custoPorUnidade;
  }


calcularPorcentagemLucro(): number {
  const custoUnid = this.calcularCustoPorUnidade();
  const valorVenda = this.produtoForm.get('valorVenda')?.value ?? 0;
  if (!valorVenda) {
    return 0;
  }
  const lucro = valorVenda - custoUnid;
  return lucro / valorVenda;
}


  calcularLucroTotal(): number {
    const rendimento = this.produtoForm.get('rendimento')?.value ?? 0;
    return rendimento * this.calcularLucroPorUnidade();
  }
  // dentro de ProdutoCadastroComponent
  get lucroUnitario(): number {
    return this.calcularLucroPorUnidade();
  }
  get lucroPercentual(): number {
    return this.calcularPorcentagemLucro();
  }
  get lucroTotal(): number {
    return this.calcularLucroTotal();
  }

  get labelUnitario(): string {
    return this.lucroUnitario < 0 ? 'Prejuízo por Unidade' : 'Lucro por Unidade';
  }
  get labelPercentual(): string {
    return this.lucroPercentual < 0 ? '% Prejuízo' : '% Lucro';
  }
  get labelTotal(): string {
    return this.lucroTotal < 0 ? 'Prejuízo Total' : 'Lucro Total';
  }

  criarConversaoForm(init?: { unidade?: any; fatorConversao?: number; desabilitar?: boolean }): FormGroup {
    return this.fb.group({
      unidade: [{ value: init?.unidade ?? null, disabled: init?.desabilitar ?? false }, Validators.required],
      fatorConversao: [init?.fatorConversao ?? 1, [Validators.required, Validators.min(1)]]
    });
  }


  adicionarConversao(): void {
    this.conversoes.push(this.criarConversaoForm());
  }

  removerConversao(index: number): void {
    this.conversoes.removeAt(index);
  }

  buscarProdutosPorFiltro(): void {
    const filtro = {
      codigo: this.produtoForm.get('codigo')?.value,
      descricao: this.produtoForm.get('descricao')?.value,
      categoriaId: this.produtoForm.get('categoria')?.value?.id,
      marcaId: this.produtoForm.get('marcaId')?.value?.id,
      subcategoriaId: this.produtoForm.get('subCategoria')?.value?.id,
      ativo: this.produtoForm.get('ativo')?.value,
    };

    this.produtoService.buscarProdutosPorFiltro(filtro).subscribe({
      next: (produtos) => {
        this.listaProdutos = produtos;
        this.setExibirTabelaPesquisa(true);
      },
      error: (error) => {
        console.error("Erro ao buscar produtos:", error);
        this.enviarMensagem.emit({ mensagem: 'Erro ao buscar produtos. Tente novamente.', tipo: 'error' });
      }
    });
  }

addOpcao1() {
   console.log('Clicou em adicionar:', this.novaOpcao1);
  const opcao = this.novaOpcao1.trim();
  if (opcao && !this.opcoes1.includes(opcao)) {
    this.opcoes1.push(opcao);
  }
  this.novaOpcao1 = '';
}

addOpcao2() {
  const opcao = this.novaOpcao2.trim();
  if (opcao && !this.opcoes2.includes(opcao)) {
    this.opcoes2.push(opcao);
  }
  this.novaOpcao2 = '';
}

removerOpcao1(index: number) {
  this.opcoes1.splice(index, 1);
}

removerOpcao2(index: number) {
  this.opcoes2.splice(index, 1);
}

gerarCombinacoes() {
this.variacoes = [];

for (let v1 of this.opcoes1) {
  for (let v2 of this.opcoes2) {
    this.variacoes.push({
      variacao1: v1,
      variacao2: v2,
      descricao: `${this.produtoForm.get('descricao')?.value || ''} ${v1} ${v2}`,
      preco: this.produtoForm.get('precoVendaVarejo')?.value || 0,
      estoque: 0,
      peso: 0,
      altura: 0,
      largura: 0,
      comprimento: 0,
      ativo: true
    });
  }
}

}

}






