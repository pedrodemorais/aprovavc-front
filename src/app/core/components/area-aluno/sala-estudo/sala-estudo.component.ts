import { FlashcardDTO } from '../models/FlashcardDTO';
import { Component, HostListener, OnInit, OnDestroy, ElementRef, ViewChild, NgZone } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MateriaService } from '../services/materia.service';
import { Materia } from '../models/materia.model';
import { BlocosEstudoService } from '../services/blocos-estudo.service';
import {SalaEstudoService,  EstudoTopicoRequest,  FlashcardRevisaoRespostaRequest, TopicoRevisaoRespostaRequest, TopicoFinalizadoDTO, VocabularioDTO
} from '../services/sala-estudo.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {
  mensagemRevisao?: string;
  materiaId!: number;
  materia?: Materia;

  mensagemFlashcardSucesso?: string;
  anotacoesHtmlSeguras: SafeHtml | null = null;

  anotacoes: string = '';
  mensagemEstudoSalvo?: string;
  mensagemTopicoFinalizado?: string;
  pausarAoSairDaAba = true;
  private readonly pausarAoSairDaAbaKey = 'sala-estudo:pausar-ao-sair-aba';
  private salvandoEstudo = false;
  private ultimoSaveKeyPorTopico = new Map<number, string>();
  private ultimoSaveMsPorTopico = new Map<number, number>();
  private ultimoSaveHashPorTopico = new Map<number, number>();
  private editorTopicoId: number | null = null;
  private readonly saveLogKey = 'sala-estudo:save-log';
  private topicosFinalizados = new Set<number>();
  private topicosFinalizadosCarregados = false;
  private topicosFinalizadosPendentes = new Set<number>();
  private topicosResetPendentes = new Set<number>();

  @ViewChild('flashcardModal', { static: false }) flashcardModalRef?: ElementRef<HTMLElement>;
  @ViewChild('flashcardOverlay', { static: false }) flashcardOverlayRef?: ElementRef<HTMLElement>;
  @ViewChild('listaTopicos', { static: false }) listaTopicosRef?: ElementRef<HTMLElement>;
  @ViewChild('listaTopicosContainer', { static: false }) listaTopicosContainerRef?: ElementRef<HTMLElement>;
  private centralizarTopicoTentativas = 0;
  flashcardModalPos = { x: 0, y: 0 };
  flashcardModalDragging = false;
  private flashcardDragOffset = { x: 0, y: 0 };
  private quillEditor?: any;
  private ultimoTrechoSelecionado = '';
  maxCaracteres = 1200;
  caracteresUsados = 0;
  caracteresRestantes = 1200;
  private ajustandoLimiteCaracteres = false;

  topicos: any[] = [];
  topicoSelecionado?: any | null;
  private topicoIdPreferido: number | null = null;
  private autoSelecionarUltimoNaoEstudado = false;
  private topicosCarregados = false;
  private revisoesCarregadas = false;
  private selecionouTopicoInicial = false;
  private modoPreferido: 'estudar' | 'revisar' = 'estudar';
  private temTempoNaoSalvoFlag = false;

  arvoreTopicos: any[] = [];

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // modo de revisao (anotacoes x flashcards)
  modoRevisao: 'anotacoes' | 'flashcards' = 'anotacoes';
  revisaoAutoExplicacaoAtiva = false;

  // controle da coluna esquerda (topicos)
  colunaEsquerdaOculta: boolean = false;

  // ======================= TIMER / POMODORO =======================

  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // total decorrido no cronometro (modo livre)
  tempoTotalSegundos: number = 0;

  // quanto tempo ja foi efetivamente salvo no backend para o topico atual (em segundos)
  private segundosEstudoJaSalvosTopicoAtual: number = 0;

  timerAtivo: boolean = false;
  private timerRef: any;

  pomodoroDuracaoFoco: number = 1500;      // 25 min
  pomodoroDuracaoPausaCurta: number = 300; // 5 min
  pomodoroDuracaoPausaLonga: number = 900; // 15 min
  pomodoroCiclosParaLonga: number = 4;

  pomodoroFase: 'foco' | 'pausa-curta' | 'pausa-longa' = 'foco';
  pomodoroSegundosRestantes: number = this.pomodoroDuracaoFoco;
  pomodoroCiclosConcluidos: number = 0;


  canDeactivate(): boolean {
    if (!this.temTempoNaoSalvo()) {
      return true;
    }

    const salvar = confirm(
      'Voce tem tempo de estudo nao salvo. Deseja salvar antes de sair?'
    );
    if (salvar) {
      this.salvarEstudo();
      return true;
    }
    return false;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.temTempoNaoSalvo()) {
      return;
    }
    event.preventDefault();
    event.returnValue =
      'Voce tem tempo de estudo nao salvo. Deseja salvar antes de sair?';
  }

  toggleColunaEsquerda(): void {
    this.colunaEsquerdaOculta = !this.colunaEsquerdaOculta;
  }

  private audioAlarme?: HTMLAudioElement;
  alarmeAtivo: boolean = false;
  private timerBaseMs: number | null = null;
  private pomodoroFaseInicioMs: number | null = null;

  // =============== FLASHCARD (ESTADO) ===============
  mostrarModalFlashcard: boolean = false;

  // =============== VOCABULARIO (ESTADO) ===============
  mostrarModalVocabulario: boolean = false;
  vocabularioTermo: string = '';
  vocabularioDefinicao: string = '';
  vocabularioTags: string = '';
  vocabularioListaTexto: string = '';
  maxVocabularioChars = 80;
  vocabularios: VocabularioDTO[] = [];
  carregandoVocabularios: boolean = false;
  erroVocabularios?: string;
  salvandoVocabulario: boolean = false;
  salvandoListaVocabulario: boolean = false;
  mensagemVocabularioSucesso?: string;
  vocabularioModo: 'lista' | 'revisar' = 'lista';
  vocabularioIndexAtual: number = 0;
  vocabularioMostrarDefinicao: boolean = false;

  mostrarModalSplit: boolean = false;
  splitTopico: any | null = null;
  splitNovos: Array<{ id?: number; descricao: string; removendo?: boolean }> = [];
  splitTituloPai: string = '';
  private splitTituloPaiOriginal: string = '';
  private splitDescricaoOriginalPorId = new Map<number, string>();
  splitErro?: string;
  splitSalvando: boolean = false;
  flashcardFrente: string = '';
  flashcardVerso: string = '';
  flashcardTipo: string = 'PERGUNTA_RESPOSTA';
  flashcardDificuldade: string = 'MEDIA';
  flashcardTags: string = '';
  flashcardVerdadeiroFalso: 'VERDADEIRO' | 'FALSO' | null = null;
  maxFlashcardFrente = 120;
  maxFlashcardVerso = 200;

  mensagemFlashcardRevisao?: string;

  // status da sessao (opcional)
  revisouAnotacoesSessao: boolean = false;
  revisouFlashcardsSessao: boolean = false;

  // lista de flashcards (usada tanto em estudar quanto revisar)
  flashcards: FlashcardDTO[] = [];
  flashcardIndexAtual: number = 0;
  mostrarVersoAtual: boolean = false;
  flashcardFeedback: 'acerto' | 'erro' | null = null;

  // estado da revisao (carregando flashcards de revisao)
  carregandoFlashcardsRevisao: boolean = false;
  erroFlashcardsRevisao?: string;
  private revisaoItemInicio: number | null = null;
  private ultimoTopicoRevisadoId: number | null = null;
  private readonly revisaoTempoKey = 'revisao:tempoTotalSegundos';
  private readonly revisaoItensKey = 'revisao:itensTotais';
  private readonly ultimoTopicoKeyPrefix = 'sala-estudo:ultimo-topico:';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private blocosService: BlocosEstudoService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {}

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    this.carregarPreferenciaPausaAba();
    this.carregarTopicosFinalizados();
    this.route.queryParamMap.subscribe(queryParams => {
      const topicoId = this.getTopicoIdFromQuery(queryParams);
      const autoTopico = this.getAutoTopicoFromQuery(queryParams);
      const modoAtualizado = this.getModoFromQuery(queryParams, this.modo);

      if (modoAtualizado !== this.modo) {
        this.modoPreferido = modoAtualizado;
        this.modo = modoAtualizado;
        this.ajustarColunaEsquerdaParaModo();
      }

      this.autoSelecionarUltimoNaoEstudado = autoTopico;
      this.topicoIdPreferido = topicoId;

      if (topicoId && topicoId !== this.topicoSelecionado?.id && this.topicosCarregados) {
        const candidato = this.topicos.find(t => t.id === topicoId);
        if (candidato) {
          this.selecionarTopico(candidato);
          this.selecionouTopicoInicial = true;
        }
      }
    });

    this.route.paramMap.subscribe(params => {
      const idParam = params.get('materiaId') ?? params.get('id');
      this.materiaId = idParam ? Number(idParam) : 0;

      console.log('[SALA-ESTUDO] materiaId =', this.materiaId);

      if (!this.materiaId) {
        this.erro = 'Materia nao informada na rota.';
        return;
      }

      this.carregarMateria();
      this.carregarTopicos();
      this.carregarRevisoesDashboard();
    });
  }

  onEditorInit(event: any) {
    const quill = event?.editor || event;
    this.quillEditor = quill;

    // Remove qualquer IMG que venha do clipboard (inclui base64)
    quill.clipboard.addMatcher('IMG', () => {
      return { ops: [] };
    });

    quill.on('selection-change', (range: { index: number; length: number } | null) => {
      if (!range || range.length <= 0) {
        return;
      }
      const texto = quill.getText(range.index, range.length);
      if (texto) {
        this.ultimoTrechoSelecionado = texto.trim();
      }
    });

    const atualizarContador = () => {
      const length = Math.max(0, (quill.getLength?.() ?? 0) - 1);
      this.atualizarContadorCaracteres(length);
    };
    atualizarContador();

    quill.on('text-change', () => {
      if (this.ajustandoLimiteCaracteres) {
        return;
      }
      const length = Math.max(0, (quill.getLength?.() ?? 0) - 1);
      if (length > this.maxCaracteres) {
        this.ajustandoLimiteCaracteres = true;
        // Usa "api" para o PrimeNG sincronizar o ngModel com o conteúdo já truncado.
        quill.deleteText(this.maxCaracteres, length - this.maxCaracteres, 'api');
        this.ajustandoLimiteCaracteres = false;
      }
      this.atualizarContadorCaracteres(Math.min(length, this.maxCaracteres));
    });

    // Bloqueia drop de imagem
    quill.root.addEventListener('drop', (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Bloqueia paste de imagem (binario)
    quill.root.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;

      const hasImage = Array.from(items).some(i => i.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  // ================================================================
  // CARREGAMENTO DE DADOS
  // ================================================================

  private carregarMateria(): void {
    this.carregando = true;
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materia = lista.find(m => m.id === this.materiaId);
        this.carregando = false;

        if (!this.materia) {
          this.erro = 'Materia nao encontrada para este aluno.';
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar materia:', err);
        this.carregando = false;
        this.erro = 'Erro ao carregar dados da materia.';
      }
    });
  }

  private achatarArvoreTopicos(lista: any[], nivel: number = 0, acumulador: any[] = []): any[] {
    for (const dto of lista) {
      const temFilhos = !!(dto.subtopicos && Array.isArray(dto.subtopicos) && dto.subtopicos.length);

      const node = {
        id: dto.id,
        descricao: dto.descricao,
        ativo: dto.ativo ?? true,
        nivel,
        materiaId: dto.materiaId,
        hasFilhos: temFilhos,
        _raw: dto
      };

      acumulador.push(node);

      if (temFilhos) {
        this.achatarArvoreTopicos(dto.subtopicos, nivel + 1, acumulador);
      }
    }
    return acumulador;
  }

  get topicoPermiteEstudo(): boolean {
    return !!(this.topicoSelecionado && this.topicoSelecionado.ativo !== false);
  }

  private carregarTopicos(): void {
    console.log('[SALA-ESTUDO] Carregando topicos da materiaId =', this.materiaId);

    this.materiaService.listarTopicos(this.materiaId).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        console.log('[SALA-ESTUDO] DTO bruto de topicos (arvore):', listaSegura);

        this.arvoreTopicos = listaSegura;
        this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

        console.log('[SALA-ESTUDO] Lista achatada (topicos):', this.topicos);

        this.topicosCarregados = true;
        this.tentarSelecionarTopicoInicial();
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar topicos:', err);
        this.erro = 'Erro ao carregar topicos da materia.';
      }
    });
  }

  private getTopicoIdFromQuery(queryParams?: ParamMap): number | null {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = params.get('topicoId');
    if (!raw) {
      return null;
    }
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private getAutoTopicoFromQuery(queryParams?: ParamMap): boolean {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = (params.get('proximo') || '').toLowerCase();
    const alt = (params.get('autoTopico') || '').toLowerCase();
    const alt2 = (params.get('proximoTopico') || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'sim' || alt === '1' || alt === 'true' || alt === 'sim' ||
      alt2 === '1' || alt2 === 'true' || alt2 === 'sim';
  }

  private getModoFromQuery(queryParams?: ParamMap, fallback: 'estudar' | 'revisar' = 'estudar'): 'estudar' | 'revisar' {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const rawModo = (params.get('modo') || '').toLowerCase();
    const rawRevisar = (params.get('revisar') || '').toLowerCase();
    const rawRevisao = (params.get('revisao') || '').toLowerCase();

    if (rawModo === 'revisar' || rawModo === 'revisao') {
      return 'revisar';
    }

    if (rawRevisar === '1' || rawRevisar === 'true' || rawRevisar === 'sim') {
      return 'revisar';
    }

    if (rawRevisao === '1' || rawRevisao === 'true' || rawRevisao === 'sim') {
      return 'revisar';
    }

    return fallback;
  }

  ativarRevisaoAnotacoes(): void {
  this.modoRevisao = 'anotacoes';

  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    // se quiser, pode for+�ar recarregar anota+�+�es aqui tamb+�m
    this.salaEstudoService.buscarAnotacoes(this.topicoSelecionado.id).subscribe({
	      next: (resp) => {
	        this.anotacoes = resp.anotacoes || '';
	        this.atualizarMarcaAnotacoes(this.topicoSelecionado?.id, this.hasConteudoAnotacoes(this.anotacoes));
	        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
	        this.atualizarContadorCaracteresFromHtml(this.anotacoes);
	      },
	      error: () => {
	        this.anotacoes = '';
	        this.atualizarMarcaAnotacoes(this.topicoSelecionado?.id, false);
	        this.anotacoesHtmlSeguras = null;
	        this.atualizarContadorCaracteres(0);
	      }
    });
  }
}
ativarRevisaoFlashcards(): void {
  this.modoRevisao = 'flashcards';

  // se j+� tiver um t+�pico selecionado, garante que os flashcards dele sejam carregados
  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    this.carregarFlashcards();
  }
}


  // ================================================================
  // INTERA+�+�O COM T+�PICOS
  // ================================================================

  /**
   * Tempo TOTAL que o cron+�metro j+� contou nesta sess+�o (em segundos).
   * - Livre: tempoTotalSegundos
   * - Pomodoro: dura+�+�o da fase - segundosRestantes
   */
  private calcularTempoEstudoAtual(): number {
    if (this.modoTemporizador === 'livre') {
      return this.tempoTotalSegundos;
    }
    return this.duracaoFaseAtual - this.pomodoroSegundosRestantes;
  }

  private temTempoNaoSalvo(): boolean {
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) {
      return false;
    }
    return this.temTempoNaoSalvoFlag;
  }

  private resetarTimerAoTrocarTopico(): void {
    if (this.timerAtivo) {
      this.pararTimerInterno();
      this.timerAtivo = false;
    }

    this.pararTimerInterno();
    this.silenciarAlarme();

    // ao trocar de t+�pico, zera o acumulado j+� salvo para o novo t+�pico
    this.segundosEstudoJaSalvosTopicoAtual = 0;
    this.temTempoNaoSalvoFlag = false;

    if (this.modoTemporizador === 'livre') {
      this.tempoTotalSegundos = 0;
    } else {
      this.pomodoroFase = 'foco';
      this.pomodoroCiclosConcluidos = 0;
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  selecionarTopico(t: any): void {
    this.mensagemRevisao = undefined;
    this.avaliacaoSelecionada = null;
    const trocandoDeTopico =
      this.topicoSelecionado && this.topicoSelecionado.id !== t.id;

    if (trocandoDeTopico && this.modo === 'estudar') {
      const tempoAtual = this.calcularTempoEstudoAtual();

      const temAlgoParaSalvar =
        tempoAtual > 0 &&
        this.topicoPermiteEstudo;

      if (temAlgoParaSalvar) {
        const desejaSalvar = window.confirm(
          'Você já possui tempo de estudo neste tópico. Deseja salvar antes de mudar para outro tópico?'
        );

        if (desejaSalvar) {
          this.salvarEstudo();
          this.temTempoNaoSalvoFlag = false;
        }
      }

      this.resetarTimerAoTrocarTopico();
    }

    this.topicoSelecionado = t;
    this.salvarUltimoTopico(t);
    if (t?.id) {
      this.atualizarQueryTopico(t.id);
    }
    this.editorTopicoId = t?.id ?? null;
    this.centralizarTopicoSelecionado();
    if (this.modo === 'revisar') {
      this.iniciarContagemRevisaoItem();
    }

    // ao selecionar t+�pico, carrega flashcards (modo estudar)
    if (this.topicoPermiteEstudo) {
      this.carregarFlashcards();
    } else {
      this.flashcards = [];
      this.flashcardIndexAtual = 0;
      this.mostrarVersoAtual = false;
    }

    if (!this.topicoPermiteEstudo) {
      this.anotacoes = '';
      return;
    }

    this.salaEstudoService.buscarAnotacoes(t.id).subscribe({
      next: (resp) => {
        this.editorTopicoId = t.id ?? null;
        console.log('[SALA-ESTUDO] buscarAnotacoes resp:', {
          topicoId: t.id,
          respTopicoId: resp?.topicoId,
          tamanho: (resp?.anotacoes || '').length
        });
        this.anotacoes = resp.anotacoes || '';
        this.atualizarMarcaAnotacoes(t.id, this.hasConteudoAnotacoes(this.anotacoes));
        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
        this.atualizarContadorCaracteresFromHtml(this.anotacoes);
      },
      error: () => {
        this.anotacoes = '';
        this.atualizarMarcaAnotacoes(t.id, false);
        this.anotacoesHtmlSeguras = null;
        this.atualizarContadorCaracteres(0);
      }
    });

    // se já estiver no modo revisar, ao trocar de tópico recarrega os flashcards para revisão
    if (this.modo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }

      if (this.mostrarModalVocabulario && this.topicoPermiteEstudo) {
        this.carregarVocabularios();
      }
    }

  private centralizarTopicoSelecionado(): void {
    const container = this.listaTopicosContainerRef?.nativeElement;
    const lista = this.listaTopicosRef?.nativeElement;
    const topicoId = this.topicoSelecionado?.id;
    if (!container || !lista || !topicoId) {
      return;
    }
    const executar = () => {
      const el = lista.querySelector(`[data-topico-id="${topicoId}"]`) as HTMLElement | null;
      if (!el) {
        if (this.centralizarTopicoTentativas < 12) {
          this.centralizarTopicoTentativas += 1;
          setTimeout(executar, 60);
        }
        return;
      }
      this.centralizarTopicoTentativas = 0;
      const containerRect = container.getBoundingClientRect();
      const itemRect = el.getBoundingClientRect();
      const delta = (itemRect.top - containerRect.top) - ((container.clientHeight / 2) - (itemRect.height / 2));
      container.scrollTop += delta;
    };
    requestAnimationFrame(() => requestAnimationFrame(executar));
  }

  private carregarFlashcards(): void {
    if (!this.topicoSelecionado) {
      this.flashcards = [];
      return;
    }

    this.salaEstudoService.listarFlashcardsPorTopico(this.topicoSelecionado.id)
      .subscribe({
        next: (lista) => {
          this.flashcards = lista || [];
          this.flashcardIndexAtual = 0;
          this.mostrarVersoAtual = false;
          this.avaliacaoFlashcardSelecionada = null;
          this.resetFlashcardFeedback();
        },
        error: (err) => {
          console.error('[SALA-ESTUDO] Erro ao carregar flashcards:', err);
          this.flashcards = [];
        }
      });
  }

  private obterUltimoTopicoId(): number | null {
    const key = `${this.ultimoTopicoKeyPrefix}${this.materiaId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private salvarUltimoTopico(t: any): void {
    if (!t?.id || !this.materiaId) {
      return;
    }
    const key = `${this.ultimoTopicoKeyPrefix}${this.materiaId}`;
    localStorage.setItem(key, String(t.id));
  }

  private obterProximoTopicoApos(folhas: any[], topicoId: number): any | null {
    const index = folhas.findIndex(t => t.id === topicoId);
    if (index < 0) {
      return null;
    }
    for (let i = index + 1; i < folhas.length; i += 1) {
      if (!folhas[i]?.hasFilhos && folhas[i]?.ativo !== false) {
        return folhas[i];
      }
    }
    return null;
  }

  isTopicoFinalizado(t: any): boolean {
    const id = t?.id;
    if (!id) {
      return false;
    }
    return this.topicosFinalizados.has(id);
  }

  isTopicoFinalizadoLinha(t: any): boolean {
    const id = t?.id;
    if (!id) {
      return false;
    }
    if (this.topicosFinalizados.has(id)) {
      return true;
    }
    const dto = this.encontrarDtoPorId(this.arvoreTopicos, id);
    if (!dto) {
      return false;
    }
    const filhos = (dto.subtopicos || dto.filhos || []) as any[];
    if (!filhos.length) {
      return false;
    }
    return this.todosFilhosFinalizados(filhos);
  }

  isTopicoFinalizadoPendente(t: any): boolean {
    const id = t?.id;
    if (!id) {
      return false;
    }
    return this.topicosFinalizadosPendentes.has(id);
  }

  isTopicoResetPendente(t: any): boolean {
    const id = t?.id;
    if (!id) {
      return false;
    }
    return this.topicosResetPendentes.has(id);
  }

  private todosFilhosFinalizados(lista: any[]): boolean {
    for (const filho of lista || []) {
      if (filho?.ativo === false) {
        continue;
      }
      const sub = (filho?.subtopicos || filho?.filhos || []) as any[];
      if (sub.length) {
        if (!this.todosFilhosFinalizados(sub)) {
          return false;
        }
        continue;
      }
      const id = this.getTopicoIdFromDto(filho);
      if (!id || !this.topicosFinalizados.has(id)) {
        return false;
      }
    }
    return true;
  }

  private carregarTopicosFinalizados(): void {
    this.salaEstudoService.listarTopicosFinalizados().subscribe({
      next: (lista: TopicoFinalizadoDTO[]) => {
        this.topicosFinalizados = new Set((lista || [])
          .map((item) => item?.topicoId)
          .filter((id): id is number => Number.isFinite(id)));
        this.topicosFinalizadosCarregados = true;
        this.tentarSelecionarTopicoInicial();
      },
      error: () => {
        this.topicosFinalizados = new Set();
        this.topicosFinalizadosCarregados = true;
        this.tentarSelecionarTopicoInicial();
      }
    });
  }

  // ================================================================
  // CONTROLE DO TIMER / POMODORO
  // ================================================================

  get duracaoFaseAtual(): number {
    switch (this.pomodoroFase) {
      case 'foco':
        return this.pomodoroDuracaoFoco;
      case 'pausa-curta':
        return this.pomodoroDuracaoPausaCurta;
      case 'pausa-longa':
        return this.pomodoroDuracaoPausaLonga;
      default:
        return this.pomodoroDuracaoFoco;
    }
  }

  get labelFasePomodoro(): string {
    if (this.pomodoroFase === 'foco') return 'Foco';
    if (this.pomodoroFase === 'pausa-curta') return 'Pausa curta';
    return 'Pausa longa';
  }

  get tempoFormatado(): string {
    let totalSegundos = 0;

    if (this.modoTemporizador === 'livre') {
      totalSegundos = this.tempoTotalSegundos;
    } else {
      totalSegundos = this.pomodoroSegundosRestantes;
    }

    const h = Math.floor(totalSegundos / 3600);
    const m = Math.floor((totalSegundos % 3600) / 60);
    const s = totalSegundos % 60;

    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private pad(v: number): string {
    return v.toString().padStart(2, '0');
  }

  setModoTemporizador(modo: 'livre' | 'pomodoro'): void {
    if (this.modoTemporizador === modo) {
      return;
    }

    if (this.temTempoNaoSalvo()) {
      const desejaSalvar = window.confirm(
        'Ao mudar o tipo de estudo o tempo atual sera zerado. Deseja salvar o tempo ja estudado?'
      );

      if (desejaSalvar) {
        this.salvarEstudo();
      }
    }

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;
    this.temTempoNaoSalvoFlag = false;

    // quando muda de modo, reinicia o acumulado do t+�pico no contexto do timer
    this.segundosEstudoJaSalvosTopicoAtual = 0;
    this.temTempoNaoSalvoFlag = false;

    this.modoTemporizador = modo;

    if (modo === 'livre') {
      this.tempoTotalSegundos = 0;
    } else {
      this.pomodoroFase = 'foco';
      this.pomodoroCiclosConcluidos = 0;
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  toggleTimer(): void {
    this.silenciarAlarme();

    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
      return;
    }

    this.timerAtivo = true;
    this.temTempoNaoSalvoFlag = true;
    if (this.modo === 'estudar' && this.isSmallViewport()) {
      this.colunaEsquerdaOculta = true;
    }
    if (this.modo === 'revisar') {
      this.revisaoAutoExplicacaoAtiva = true;
    }

    if (this.modoTemporizador === 'livre') {
      this.iniciarTimerLivre();
    } else {
      this.iniciarPomodoro();
    }
  }

  zerarTimer(): void {
    if (this.modoTemporizador === 'livre') {
      if (!this.tempoTotalSegundos) {
        return;
      }
    } else {
      if (this.pomodoroSegundosRestantes === this.duracaoFaseAtual) {
        return;
      }
    }

    const confirmou = window.confirm(
      'Se voce zerar o cronometro agora, o tempo estudado ate este momento NAO sera contabilizado para este topico/materia. Deseja realmente zerar?'
    );

    if (!confirmou) {
      return;
    }

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    // o que j+� foi salvo no backend continua valendo

    if (this.modoTemporizador === 'livre') {
      this.tempoTotalSegundos = 0;
    } else {
      this.pomodoroFase = 'foco';
      this.pomodoroCiclosConcluidos = 0;
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  private iniciarTimerLivre(): void {
    this.pararTimerInterno();
    this.timerBaseMs = Date.now() - (this.tempoTotalSegundos * 1000);

    this.timerRef = setInterval(() => {
      this.atualizarTempoLivre();
      this.temTempoNaoSalvoFlag = true;
    }, 500);
  }

  private iniciarPomodoro(): void {
    this.pararTimerInterno();
    this.temTempoNaoSalvoFlag = true;
    this.pomodoroFaseInicioMs = Date.now()
      - ((this.duracaoFaseAtual - this.pomodoroSegundosRestantes) * 1000);

    this.timerRef = setInterval(() => {
      this.atualizarPomodoro();
    }, 500);
  }

  private atualizarTempoLivre(): void {
    if (!this.timerBaseMs) {
      this.timerBaseMs = Date.now();
      return;
    }

    const agora = Date.now();
    this.tempoTotalSegundos = Math.floor((agora - this.timerBaseMs) / 1000);
  }

  private atualizarPomodoro(): void {
    if (!this.pomodoroFaseInicioMs) {
      this.pomodoroFaseInicioMs = Date.now();
      return;
    }

    const agora = Date.now();
    const elapsed = Math.floor((agora - this.pomodoroFaseInicioMs) / 1000);
    const restante = Math.max(0, this.duracaoFaseAtual - elapsed);
    this.temTempoNaoSalvoFlag = true;

    if (restante !== this.pomodoroSegundosRestantes) {
      this.pomodoroSegundosRestantes = restante;
    }

    if (this.pomodoroSegundosRestantes === 0) {
      this.trocarFasePomodoro();
    }
  }

  private trocarFasePomodoro(): void {
    this.pararTimerInterno();
    this.timerAtivo = false;
    this.tocarAlarme();

    if (this.pomodoroFase === 'foco') {
      this.pomodoroCiclosConcluidos++;

      if (this.pomodoroCiclosConcluidos % this.pomodoroCiclosParaLonga === 0) {
        this.pomodoroFase = 'pausa-longa';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaLonga;
      } else {
        this.pomodoroFase = 'pausa-curta';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaCurta;
      }
    } else {
      this.pomodoroFase = 'foco';
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  private pararTimerInterno(): void {
    if (this.timerRef) {
      clearInterval(this.timerRef);
      this.timerRef = null;
    }
    this.timerBaseMs = null;
    this.pomodoroFaseInicioMs = null;
  }

  private tocarAlarme(): void {
    try {
      if (!this.audioAlarme) {
        this.audioAlarme = new Audio('assets/alarm-clock.mp3');
      }

      this.audioAlarme.currentTime = 0;
      this.audioAlarme.loop = true;

      this.audioAlarme.play()
        .then(() => {
          this.alarmeAtivo = true;
        })
        .catch(err => {
          console.warn('[POMODORO] N+�o foi poss+�vel tocar o som de alarme:', err);
        });
    } catch (e) {
      console.warn('[POMODORO] Erro ao tentar tocar o som de alarme:', e);
    }
  }

  private silenciarAlarme(): void {
    if (this.audioAlarme) {
      this.audioAlarme.pause();
      this.audioAlarme.currentTime = 0;
    }
    this.alarmeAtivo = false;
  }

  // ================================================================
  // MODO ESTUDAR / REVISAR
  // ================================================================

  mudarModo(novoModo: 'estudar' | 'revisar'): void {
    if (this.modo === novoModo) {
      return;
    }
    if (this.topicoPermiteEstudo && this.temTempoNaoSalvo()) {
      this.salvarEstudo();
    }
    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }
    this.resetarTimerParaNovoModo();
    this.modo = novoModo;
    this.mensagemRevisao = undefined;
    this.revisaoAutoExplicacaoAtiva = novoModo === 'revisar' && this.timerAtivo;
    this.ajustarColunaEsquerdaParaModo();
    // quando entrar no modo revisar, se tiver topico valido, carrega flashcards de revisao
    if (novoModo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }
  }

  private resetarTimerParaNovoModo(): void {
    this.silenciarAlarme();
    this.segundosEstudoJaSalvosTopicoAtual = 0;
    this.temTempoNaoSalvoFlag = false;
    if (this.modoTemporizador === 'livre') {
      this.tempoTotalSegundos = 0;
    } else {
      this.pomodoroFase = 'foco';
      this.pomodoroCiclosConcluidos = 0;
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  liberarRevisaoAutoExplicacao(): void {
    this.revisaoAutoExplicacaoAtiva = false;
  }

  private ajustarColunaEsquerdaParaModo(): void {
    if (this.modo === 'estudar' && this.isSmallViewport()) {
      this.colunaEsquerdaOculta = true;
    }
  }

  private isSmallViewport(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth <= 768;
  }

  // ================================================================
  // SALVAR ESTUDO
  // ================================================================

  salvarEstudo(motivo: string = 'auto'): void {
    if (!this.topicoSelecionado) {
      this.erro = 'Selecione um topico antes de salvar o estudo.';
      return;
    }
    if (this.salvandoEstudo) {
      return;
    }
    const topicoAtualId = this.topicoSelecionado?.id ?? null;
    if (!topicoAtualId || (this.editorTopicoId && this.editorTopicoId !== topicoAtualId)) {
      this.registrarSaveLog('bloqueado-topico-mismatch', {
        motivo,
        topicoAtualId,
        editorTopicoId: this.editorTopicoId
      });
      try {
        alert('Detectamos um conflito: o editor está vinculado a outro tópico. O salvamento foi bloqueado para evitar gravação no tópico errado.');
      } catch {}
      return;
    }

    // Garante que o HTML salvo é o que está no editor (evita ngModel desatualizado após truncar).
    const quillHtml = this.quillEditor?.root?.innerHTML;
    if (typeof quillHtml === 'string') {
      this.anotacoes = this.normalizarHtmlAnotacoes(quillHtml);
    }

    const modoBack = this.modoTemporizador;

    // tempo TOTAL decorrido no cron+�metro para este t+�pico / sess+�o
    const tempoAtualTotal = this.calcularTempoEstudoAtual();

    // apenas o DELTA desde o +�ltimo salvamento
    let tempoParaSalvar = tempoAtualTotal - this.segundosEstudoJaSalvosTopicoAtual;
    if (tempoParaSalvar < 0) {
      tempoParaSalvar = 0;
    }

    const tipoSessao: EstudoTopicoRequest['tipoSessao'] =
      this.modo === 'revisar' ? 'REVISAO' : 'ESTUDO';
    const payload: EstudoTopicoRequest = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      modoTemporizador: modoBack,
      tipoSessao,
      tempoLivreSegundos: tempoParaSalvar,
      anotacoes: this.anotacoes,
      pomodoroFase: this.modoTemporizador === 'pomodoro' ? this.pomodoroFase : undefined,
      pomodoroCiclosConcluidos: this.modoTemporizador === 'pomodoro'
        ? this.pomodoroCiclosConcluidos
        : undefined
    };

    const anotacoesHash = this.hashTexto(this.anotacoes || '');
    const saveKey = `${payload.topicoId}|${payload.tipoSessao}|${payload.modoTemporizador}|${tempoParaSalvar}|${anotacoesHash}`;
    const ultimoKey = this.ultimoSaveKeyPorTopico.get(payload.topicoId);
    const ultimoMs = this.ultimoSaveMsPorTopico.get(payload.topicoId) || 0;
    const ultimoHash = this.ultimoSaveHashPorTopico.get(payload.topicoId);
    const agora = Date.now();

    if (tempoParaSalvar <= 0 && ultimoHash === anotacoesHash) {
      console.warn('[SALA-ESTUDO] salvarEstudo ignorado (sem alteracao):', {
        motivo,
        topicoId: payload.topicoId,
        tempoParaSalvar
      });
      this.registrarSaveLog('ignorado-sem-alteracao', {
        motivo,
        topicoId: payload.topicoId,
        tempoParaSalvar
      });
      return;
    }

    if (ultimoKey === saveKey && (agora - ultimoMs) < 1500) {
      console.warn('[SALA-ESTUDO] salvarEstudo ignorado (duplicado):', {
        motivo,
        topicoId: payload.topicoId,
        tempoParaSalvar,
        intervaloMs: agora - ultimoMs
      });
      this.registrarSaveLog('ignorado-duplicado', {
        motivo,
        topicoId: payload.topicoId,
        tempoParaSalvar,
        intervaloMs: agora - ultimoMs
      });
      return;
    }

    console.log('[SALA-ESTUDO] salvarEstudo payload:', {
      motivo,
      materiaId: payload.materiaId,
      topicoId: payload.topicoId,
      topicoSelecionado: this.topicoSelecionado?.descricao,
      topicoPaiId: this.topicoSelecionado?.topicoPaiId ?? this.topicoSelecionado?._raw?.topicoPaiId ?? null,
      modo: this.modo,
      modoTemporizador: this.modoTemporizador,
      tempoParaSalvar
    });
    console.log('[SALA-ESTUDO] salvarEstudo debug:', {
      motivo,
      saveKey,
      ultimoKey,
      ultimoMsDelta: agora - ultimoMs
    });
    this.registrarSaveLog('enviado', {
      motivo,
      topicoId: payload.topicoId,
      tempoParaSalvar,
      modo: this.modo,
      modoTemporizador: this.modoTemporizador
    });

    this.salvandoEstudo = true;
    this.salaEstudoService.salvarEstudo(payload).subscribe({
      next: (resp) => {
        console.log('[SALA-ESTUDO] Estudo salvo:', resp);
        this.registrarSaveLog('ok', {
          motivo,
          topicoId: payload.topicoId,
          retornoTopicoId: (resp as any)?.topicoId ?? null
        });

        // ap+�s salvar com sucesso, acumula o que foi enviado
        this.segundosEstudoJaSalvosTopicoAtual += tempoParaSalvar;
        this.temTempoNaoSalvoFlag = false;
        if (this.modo === 'estudar') {
          this.atualizarMarcaAnotacoes(
            this.topicoSelecionado?.id,
            this.hasConteudoAnotacoes(this.anotacoes)
          );
        }

        this.mensagemEstudoSalvo = tipoSessao === 'REVISAO'
          ? 'Revis\u00e3o salva com sucesso.'
          : 'Estudo salvo com sucesso.';
        setTimeout(() => (this.mensagemEstudoSalvo = undefined), 4000);

        if (this.modo === 'estudar' && tempoParaSalvar > 0) {
          this.tentarAvancarCicloSilencioso();
        }

        window.location.reload();
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar estudo:', err);
        this.erro = 'Erro ao salvar o estudo. Tente novamente.';
        this.registrarSaveLog('erro', {
          motivo,
          topicoId: payload.topicoId,
          status: err?.status ?? null
        });
      }
    }).add(() => {
      this.ultimoSaveKeyPorTopico.set(payload.topicoId, saveKey);
      this.ultimoSaveMsPorTopico.set(payload.topicoId, Date.now());
      this.ultimoSaveHashPorTopico.set(payload.topicoId, anotacoesHash);
      this.salvandoEstudo = false;
    });
  }

  private hashTexto(valor: string): number {
    let hash = 5381;
    for (let i = 0; i < valor.length; i += 1) {
      hash = ((hash << 5) + hash) + valor.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }

  private registrarSaveLog(tipo: string, dados: Record<string, any>): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = localStorage.getItem(this.saveLogKey);
      const lista = raw ? JSON.parse(raw) : [];
      const entrada = {
        ts: new Date().toISOString(),
        tipo,
        materiaId: this.materiaId ?? null,
        topicoSelecionadoId: this.topicoSelecionado?.id ?? null,
        editorTopicoId: this.editorTopicoId,
        ...dados
      };
      lista.push(entrada);
      const corte = lista.slice(-200);
      localStorage.setItem(this.saveLogKey, JSON.stringify(corte));
    } catch {
      // ignora falha de log
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (!document.hidden) {
      return;
    }

    if (!this.pausarAoSairDaAba || !this.timerAtivo) {
      return;
    }

    this.timerAtivo = false;
    this.pararTimerInterno();
    this.revisaoAutoExplicacaoAtiva = false;
  }

  onTogglePausarAoSairDaAba(): void {
    localStorage.setItem(this.pausarAoSairDaAbaKey, String(this.pausarAoSairDaAba));
  }

  private carregarPreferenciaPausaAba(): void {
    const raw = localStorage.getItem(this.pausarAoSairDaAbaKey);
    if (raw === null) {
      this.pausarAoSairDaAba = true;
      return;
    }
    this.pausarAoSairDaAba = raw === 'true' || raw === '1';
  }

  private tentarAvancarCicloSilencioso(): void {
    this.blocosService.avancarCiclo().subscribe({
      next: () => {
        this.blocosService.notificarBlocosAlterados();
      },
      error: () => {}
    });
  }

  // ================================================================
  // FLASHCARD ��� MODAL (CRIAR)
  // ================================================================

  abrirModalFlashcard(): void {
    if (!this.topicoPermiteEstudo) {
      return;
    }

    this.mostrarModalFlashcard = true;
    this.onFlashcardTipoChange(this.flashcardTipo);
    setTimeout(() => this.centralizarModalFlashcard());
    this.preencherFlashcardFrenteComSelecao();

    if (!this.flashcardTags && this.materia && this.topicoSelecionado) {
      this.flashcardTags =
        `${this.materia.nome.toLowerCase()}, ${this.topicoSelecionado.descricao.toLowerCase()}`;
    }
  }

  fecharModalFlashcard(): void {
    this.mostrarModalFlashcard = false;
    this.encerrarArrasteFlashcard();
  }

  abrirModalVocabulario(modo: 'lista' | 'revisar' = 'lista'): void {
    if (!this.topicoPermiteEstudo) {
      return;
    }
    this.mostrarModalVocabulario = true;
    this.resetVocabularioForm();
    this.vocabularioModo = modo;
    this.carregarVocabularios();
  }

  fecharModalVocabulario(): void {
    this.mostrarModalVocabulario = false;
    this.erroVocabularios = undefined;
    this.mensagemVocabularioSucesso = undefined;
  }

  private resetVocabularioForm(): void {
    this.vocabularioTermo = '';
    this.vocabularioDefinicao = '';
    this.vocabularioTags = '';
    this.vocabularioListaTexto = '';
    this.vocabularioModo = 'lista';
    this.vocabularioIndexAtual = 0;
    this.vocabularioMostrarDefinicao = false;
  }

  private carregarVocabularios(): void {
    if (!this.topicoSelecionado?.id) {
      this.vocabularios = [];
      return;
    }
    this.carregandoVocabularios = true;
    this.erroVocabularios = undefined;
    this.salaEstudoService.listarVocabularios(this.topicoSelecionado.id).subscribe({
      next: (lista) => {
        this.vocabularios = lista || [];
        if (this.vocabularioIndexAtual >= this.vocabularios.length) {
          this.vocabularioIndexAtual = 0;
          this.vocabularioMostrarDefinicao = false;
        }
        this.carregandoVocabularios = false;
      },
      error: (err) => {
        console.error('[VOCABULARIO] Erro ao carregar:', err);
        this.erroVocabularios = 'Erro ao carregar vocabularios.';
        this.carregandoVocabularios = false;
      }
    });
  }

  salvarVocabulario(): void {
    if (!this.topicoSelecionado?.id || !this.materiaId) {
      return;
    }
    const termo = this.vocabularioTermo.trim();
    const definicao = this.vocabularioDefinicao.trim();
    if (!termo || !definicao) {
      return;
    }
    if (termo.length > this.maxVocabularioChars) {
      this.erroVocabularios = `O termo deve ter no maximo ${this.maxVocabularioChars} caracteres.`;
      return;
    }
    if (definicao.length > this.maxVocabularioChars) {
      this.erroVocabularios = `A definicao deve ter no maximo ${this.maxVocabularioChars} caracteres.`;
      return;
    }
    if (this.isTermoDuplicado(termo)) {
      this.erroVocabularios = 'Esse termo ja existe neste topico.';
      return;
    }
    const payload = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      termo,
      definicao,
      tags: this.vocabularioTags?.trim() || undefined
    };
    this.salvandoVocabulario = true;
    this.erroVocabularios = undefined;
    this.salaEstudoService.criarVocabulario(payload).subscribe({
      next: () => {
        this.salvandoVocabulario = false;
        this.resetVocabularioForm();
        this.carregarVocabularios();
        this.mensagemVocabularioSucesso = 'Vocabulario salvo!';
        setTimeout(() => (this.mensagemVocabularioSucesso = undefined), 3000);
      },
      error: (err) => {
        console.error('[VOCABULARIO] Erro ao salvar:', err);
        this.erroVocabularios = 'Erro ao salvar vocabulario.';
        this.salvandoVocabulario = false;
      }
    });
  }

  salvarListaVocabulario(): void {
    if (!this.topicoSelecionado?.id || !this.materiaId) {
      return;
    }
    const itens = this.parseVocabularioLista(this.vocabularioListaTexto || '');
    if (!itens.length) {
      this.erroVocabularios = 'Nenhum item valido para importar.';
      return;
    }
    const termosVistos = new Set<string>();
    for (const item of itens) {
      const normalizado = this.normalizarTermo(item.termo);
      if (!normalizado) {
        continue;
      }
      if (item.termo.length > this.maxVocabularioChars || item.definicao.length > this.maxVocabularioChars) {
        this.erroVocabularios = `Cada termo e definicao deve ter no maximo ${this.maxVocabularioChars} caracteres.`;
        return;
      }
      if (termosVistos.has(normalizado) || this.isTermoDuplicado(item.termo)) {
        this.erroVocabularios = 'Existe termo repetido nesta lista ou ja cadastrado no topico.';
        return;
      }
      termosVistos.add(normalizado);
    }
    this.salvandoListaVocabulario = true;
    this.erroVocabularios = undefined;
    const requisicoes = itens.map((item) =>
      this.salaEstudoService.criarVocabulario({
        materiaId: this.materiaId,
        topicoId: this.topicoSelecionado.id,
        termo: item.termo,
        definicao: item.definicao,
        tags: this.vocabularioTags?.trim() || undefined
      })
    );
    forkJoin(requisicoes).subscribe({
      next: () => {
        this.salvandoListaVocabulario = false;
        this.vocabularioListaTexto = '';
        this.carregarVocabularios();
        this.mensagemVocabularioSucesso = 'Lista importada!';
        setTimeout(() => (this.mensagemVocabularioSucesso = undefined), 3000);
      },
      error: (err) => {
        console.error('[VOCABULARIO] Erro ao importar lista:', err);
        this.erroVocabularios = 'Erro ao importar lista de vocabulario.';
        this.salvandoListaVocabulario = false;
      }
    });
  }

  private isTermoDuplicado(termo: string): boolean {
    const normalizado = this.normalizarTermo(termo);
    if (!normalizado) {
      return false;
    }
    return (this.vocabularios || []).some((v) =>
      this.normalizarTermo(v?.termo || '') === normalizado
    );
  }

  private normalizarTermo(termo: string): string {
    return (termo || '').trim().toLowerCase();
  }

  private parseVocabularioLista(texto: string): Array<{ termo: string; definicao: string }> {
    const linhas = texto
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0);
    const separadores = [' – ', ' - ', ' : ', '–', '-', ':'];
    const itens: Array<{ termo: string; definicao: string }> = [];

    linhas.forEach((linha) => {
      let termo = '';
      let definicao = '';
      for (const sep of separadores) {
        const idx = linha.indexOf(sep);
        if (idx > 0) {
          termo = linha.slice(0, idx).trim();
          definicao = linha.slice(idx + sep.length).trim();
          break;
        }
      }
      if (!termo || !definicao) {
        return;
      }
      itens.push({ termo, definicao });
    });

    return itens;
  }

  excluirVocabulario(item: VocabularioDTO): void {
    if (!item?.id) {
      return;
    }
    const confirmou = window.confirm('Deseja realmente excluir este vocabulario?');
    if (!confirmou) {
      return;
    }
    this.salaEstudoService.excluirVocabulario(item.id).subscribe({
      next: () => {
        this.vocabularios = this.vocabularios.filter(v => v.id !== item.id);
        if (this.vocabularioIndexAtual >= this.vocabularios.length) {
          this.vocabularioIndexAtual = 0;
          this.vocabularioMostrarDefinicao = false;
        }
      },
      error: (err) => {
        console.error('[VOCABULARIO] Erro ao excluir:', err);
        this.erroVocabularios = 'Erro ao excluir vocabulario.';
      }
    });
  }

  get vocabularioAtual(): VocabularioDTO | null {
    if (!this.vocabularios.length) {
      return null;
    }
    if (this.vocabularioIndexAtual < 0 || this.vocabularioIndexAtual >= this.vocabularios.length) {
      return null;
    }
    return this.vocabularios[this.vocabularioIndexAtual];
  }

  iniciarRevisaoVocabulario(): void {
    if (!this.vocabularios.length) {
      return;
    }
    this.vocabularioModo = 'revisar';
    this.vocabularioIndexAtual = 0;
    this.vocabularioMostrarDefinicao = false;
  }

  voltarListaVocabulario(): void {
    this.vocabularioModo = 'lista';
  }

  toggleDefinicaoVocabulario(): void {
    this.vocabularioMostrarDefinicao = !this.vocabularioMostrarDefinicao;
  }

  proximoVocabulario(): void {
    if (!this.vocabularios.length) {
      return;
    }
    this.vocabularioIndexAtual = (this.vocabularioIndexAtual + 1) % this.vocabularios.length;
    this.vocabularioMostrarDefinicao = false;
  }

  anteriorVocabulario(): void {
    if (!this.vocabularios.length) {
      return;
    }
    this.vocabularioIndexAtual =
      (this.vocabularioIndexAtual - 1 + this.vocabularios.length) % this.vocabularios.length;
    this.vocabularioMostrarDefinicao = false;
  }

  private obterTrechoSelecionado(): string {
    if (this.quillEditor) {
      const range = this.quillEditor.getSelection();
      if (range && range.length > 0) {
        const texto = this.quillEditor.getText(range.index, range.length);
        return texto ? texto.trim() : '';
      }
    }

    return this.ultimoTrechoSelecionado;
  }

  private preencherFlashcardFrenteComSelecao(): void {
    const trecho = this.obterTrechoSelecionado();
    if (!trecho) {
      return;
    }

    this.flashcardFrente = trecho;
  }

  iniciarArrasteFlashcard(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const alvo = event.target as HTMLElement | null;
    if (alvo?.closest('.flashcard-fechar')) {
      return;
    }

    const modalEl = this.flashcardModalRef?.nativeElement;
    const overlayEl = this.flashcardOverlayRef?.nativeElement;
    if (!modalEl || !overlayEl) {
      return;
    }

    const modalRect = modalEl.getBoundingClientRect();
    this.flashcardDragOffset = {
      x: event.clientX - modalRect.left,
      y: event.clientY - modalRect.top
    };
    this.flashcardModalDragging = true;

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.flashcardPointerMove);
      document.addEventListener('pointerup', this.flashcardPointerUp);
    });

    event.preventDefault();
  }

  private flashcardPointerMove = (event: PointerEvent): void => {
    if (!this.flashcardModalDragging) {
      return;
    }

    const modalEl = this.flashcardModalRef?.nativeElement;
    const overlayEl = this.flashcardOverlayRef?.nativeElement;
    if (!modalEl || !overlayEl) {
      return;
    }

    const overlayRect = overlayEl.getBoundingClientRect();
    const modalRect = modalEl.getBoundingClientRect();
    const rawX = event.clientX - overlayRect.left - this.flashcardDragOffset.x;
    const rawY = event.clientY - overlayRect.top - this.flashcardDragOffset.y;
    const maxX = Math.max(0, overlayRect.width - modalRect.width);
    const maxY = Math.max(0, overlayRect.height - modalRect.height);
    const nextX = Math.min(Math.max(0, rawX), maxX);
    const nextY = Math.min(Math.max(0, rawY), maxY);

    this.ngZone.run(() => {
      this.flashcardModalPos = { x: nextX, y: nextY };
    });
  };

  private flashcardPointerUp = (): void => {
    if (!this.flashcardModalDragging) {
      return;
    }

    this.flashcardModalDragging = false;
    document.removeEventListener('pointermove', this.flashcardPointerMove);
    document.removeEventListener('pointerup', this.flashcardPointerUp);
  };

  private encerrarArrasteFlashcard(): void {
    this.flashcardModalDragging = false;
    document.removeEventListener('pointermove', this.flashcardPointerMove);
    document.removeEventListener('pointerup', this.flashcardPointerUp);
  }

  private centralizarModalFlashcard(): void {
    const modalEl = this.flashcardModalRef?.nativeElement;
    const overlayEl = this.flashcardOverlayRef?.nativeElement;
    if (!modalEl || !overlayEl) {
      return;
    }

    const overlayRect = overlayEl.getBoundingClientRect();
    const modalRect = modalEl.getBoundingClientRect();
    const x = Math.max(0, (overlayRect.width - modalRect.width) / 2);
    const y = Math.max(0, (overlayRect.height - modalRect.height) / 2);
    this.flashcardModalPos = { x, y };
  }

  ngOnDestroy(): void {
    this.encerrarArrasteFlashcard();
  }

  abrirModalSplit(topico: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    if (!this.podeQuebrarTopico(topico)) {
      return;
    }

    this.splitTopico = topico;
    this.splitTituloPai = (topico?.descricao || '').toString();
    this.splitTituloPaiOriginal = this.splitTituloPai;
    const filhos = (topico?._raw?.subtopicos || topico?.subtopicos || []) as any[];
    const itens = (filhos || [])
      .map((f) => ({
        id: this.getTopicoIdFromDto(f) ?? undefined,
        descricao: (f?.descricao ?? '').toString().trim()
      }))
      .filter((v) => v.descricao.length > 0);
    this.splitNovos = itens.length ? itens : [{ descricao: '' }];
    this.splitDescricaoOriginalPorId = new Map(
      (itens || [])
        .filter((item) => !!item.id)
        .map((item) => [Number(item.id), item.descricao])
    );
    this.splitErro = undefined;
    this.splitSalvando = false;
    this.mostrarModalSplit = true;
  }

  fecharModalSplit(): void {
    this.mostrarModalSplit = false;
    this.splitTopico = null;
    this.splitNovos = [];
    this.splitTituloPaiOriginal = '';
    this.splitDescricaoOriginalPorId.clear();
    this.splitErro = undefined;
    this.splitSalvando = false;
  }

  adicionarSplitLinha(): void {
    this.splitNovos.push({ descricao: '' });
  }

  removerSplitLinha(index: number): void {
    const item = this.splitNovos[index];
    if (!item) {
      return;
    }

    if (item.id && this.temEstudoNoTopicoId(item.id)) {
      this.splitErro = 'Nao e possivel remover subtopico com estudo iniciado.';
      return;
    }

    if (!item.id) {
      this.splitNovos.splice(index, 1);
      return;
    }

    if (!this.materiaId) {
      this.splitErro = 'Materia nao encontrada.';
      return;
    }

    item.removendo = true;
    this.splitErro = undefined;
    this.materiaService.excluirTopico(this.materiaId, item.id).subscribe({
      next: () => {
        const idx = this.splitNovos.indexOf(item);
        if (idx >= 0) {
          this.splitNovos.splice(idx, 1);
        }
        this.carregarTopicos();
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao remover subtopico:', err);
        item.removendo = false;
        this.splitErro = this.getSplitErroMensagem(err);
      }
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  salvarSplit(): void {
    if (!this.splitTopico || !this.splitTopico.id) {
      return;
    }
    if (!this.materiaId) {
      this.splitErro = 'Materia nao encontrada.';
      return;
    }

    const limpos: string[] = [];
    const tituloPai = (this.splitTituloPai || '').trim();
    if (!tituloPai) {
      this.splitErro = 'Informe o titulo do topico pai.';
      return;
    }
    const tituloChave = tituloPai.toLowerCase();
    const usados = new Set<string>();
    const nomesNormalizados = new Set<string>();

    const edicoesExistentes: Array<{ id: number; descricao: string }> = [];

    for (const item of this.splitNovos) {
      const valor = (item?.descricao || '').trim();
      if (item?.id) {
        if (!valor) {
          this.splitErro = 'Subtopico nao pode ficar vazio.';
          return;
        }
        if (valor.toLowerCase() === tituloChave) {
          this.splitErro = 'Subtopico nao pode ser igual ao titulo do topico pai.';
          return;
        }
        const chave = valor.toLowerCase();
        if (nomesNormalizados.has(chave)) {
          this.splitErro = 'Ha subtopicos duplicados. Ajuste os nomes.';
          return;
        }
        nomesNormalizados.add(chave);
        const original = (this.splitDescricaoOriginalPorId.get(Number(item.id)) || '').trim();
        if (original !== valor) {
          edicoesExistentes.push({ id: Number(item.id), descricao: valor });
        }
        continue;
      }
      if (!valor) {
        continue;
      }
      const chave = valor.toLowerCase();
      if (chave === tituloChave) {
        continue;
      }
      if (nomesNormalizados.has(chave)) {
        continue;
      }
      if (usados.has(chave)) {
        continue;
      }
      nomesNormalizados.add(chave);
      usados.add(chave);
      limpos.push(valor);
    }

    const tituloAlterado = (this.splitTituloPaiOriginal || '').trim() !== tituloPai;
    if (!limpos.length && !edicoesExistentes.length && !tituloAlterado) {
      this.splitErro = 'Nenhuma alteracao para salvar.';
      return;
    }

    this.splitErro = undefined;
    this.splitSalvando = true;

    const requests: any[] = [];

    if (tituloAlterado) {
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          id: this.splitTopico.id,
          descricao: tituloPai,
          ativo: this.splitTopico?.ativo ?? true
        })
      );
    }

    edicoesExistentes.forEach((item) => {
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          id: item.id,
          descricao: item.descricao,
          ativo: true,
          topicoPaiId: this.splitTopico?.id
        })
      );
    });

    limpos.forEach((novo) => {
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          descricao: novo,
          ativo: true,
          topicoPaiId: this.splitTopico?.id
        })
      );
    });

    forkJoin(requests).subscribe({
      next: () => {
        const eraSelecionado = this.topicoSelecionado?.id === this.splitTopico?.id;

        this.splitSalvando = false;
        this.fecharModalSplit();
        this.carregarTopicos();

        if (eraSelecionado) {
          this.resetarTimerAoTrocarTopico();
          this.topicoSelecionado = null;
          this.anotacoes = '';
          this.anotacoesHtmlSeguras = null;
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar edicao de subtopico:', err);
        this.splitSalvando = false;
        this.splitErro = this.getSplitErroMensagem(err);
      }
    });
  }
  private getSplitErroMensagem(err: any): string {
    const mensagem = err?.error?.mensagem || err?.error?.message || err?.error?.erro || err?.message;
    if (mensagem && mensagem.toLowerCase().includes('ja possui estudo')) {
      return 'Nao e possivel quebrar este topico, pois ele ja possui estudo.';
    }
    return mensagem || 'Erro ao salvar. Tente novamente.';
  }

  temEstudoNoTopicoId(id: number): boolean {
    return this.getStatusSimplesTopico(id) !== 'SEM';
  }

  onFlashcardTipoChange(tipo: string): void {
    this.flashcardTipo = tipo;
    if (tipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) {
        this.flashcardVerdadeiroFalso = 'VERDADEIRO';
      }
      this.flashcardVerso = this.flashcardVerdadeiroFalso;
      return;
    }
    this.flashcardVerdadeiroFalso = null;
  }

  onFlashcardVerdadeiroFalsoChange(valor: 'VERDADEIRO' | 'FALSO'): void {
    this.flashcardVerdadeiroFalso = valor;
    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      this.flashcardVerso = valor;
    }
  }

  salvarFlashcard(): void {
    if (!this.topicoSelecionado) {
      alert('Selecione um t+�pico antes de criar o flashcard.');
      return;
    }

    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) {
        alert('Selecione se a resposta � verdadeira ou falsa.');
        return;
      }
      this.flashcardVerso = this.flashcardVerdadeiroFalso;
    }

    const frente = (this.flashcardFrente || '').trim();
    const verso = (this.flashcardVerso || '').trim();
    if (!frente || !verso) {
      alert('Preencha frente e verso do flashcard.');
      return;
    }
    if (frente.length > this.maxFlashcardFrente) {
      alert(`A pergunta deve ter no maximo ${this.maxFlashcardFrente} caracteres.`);
      return;
    }
    if (verso.length > this.maxFlashcardVerso) {
      alert(`A resposta deve ter no maximo ${this.maxFlashcardVerso} caracteres.`);
      return;
    }

    const payload: FlashcardDTO = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      frente,
      verso,
      tipo: this.flashcardTipo as any,
      dificuldade: this.flashcardDificuldade as any,
      tags: this.flashcardTags
    };

    console.log('[FLASHCARD] Enviando payload:', payload);

    this.salaEstudoService.criarFlashcard(payload).subscribe({
      next: (resp) => {
        console.log('[FLASHCARD] Criado com sucesso:', resp);

        // confirma+�+�o visual
        this.mensagemFlashcardSucesso = 'Flashcard salvo com sucesso.';

        // limpa frente e verso pra j+� digitar o pr+�ximo, mant+�m tags e tipo/dificuldade
        this.flashcardFrente = '';
        this.flashcardVerso = '';
        this.flashcardVerdadeiroFalso = null;

        // recarrega a lista de flashcards do t+�pico
        if (this.topicoSelecionado) {
          this.carregarFlashcards();
        }

        setTimeout(() => {
          this.mensagemFlashcardSucesso = undefined;
        }, 3000);
      },
      error: (err) => {
        console.error('[FLASHCARD] Erro ao salvar:', err);
        alert('Erro ao salvar flashcard. Tente novamente.');
      }
    });
  }

  // ================================================================
  // FLASHCARDS ��� NAVEGA+�+�O E EXCLUS+�O
  // ================================================================

  get existeFlashcardAtual(): boolean {
    return this.flashcards && this.flashcards.length > 0 &&
      this.flashcardIndexAtual >= 0 &&
      this.flashcardIndexAtual < this.flashcards.length;
  }

  get flashcardAtual(): FlashcardDTO | null {
    if (!this.existeFlashcardAtual) {
      return null;
    }
    return this.flashcards[this.flashcardIndexAtual];
  }

  private resetFlashcardFeedback(): void {
    this.flashcardFeedback = null;
  }

  private parseRespostaVerdadeiroFalso(valor: string | undefined | null): boolean | null {
    if (!valor) {
      return null;
    }
    const normalizado = valor.trim().toLowerCase();
    if (!normalizado) {
      return null;
    }
    if (normalizado.startsWith('v') || normalizado.startsWith('t')) {
      return true;
    }
    if (normalizado.startsWith('f')) {
      return false;
    }
    return null;
  }

  isVerdadeiroFalso(card: FlashcardDTO | null): boolean {
    return (card as any)?.tipo === 'VERDADEIRO_FALSO';
  }

  responderVerdadeiroFalso(resposta: boolean, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const atual = this.flashcardAtual;
    if (!atual || !this.isVerdadeiroFalso(atual)) {
      return;
    }

    const esperado = this.parseRespostaVerdadeiroFalso(atual.verso || '');
    if (esperado === null) {
      return;
    }

    const acertou = resposta === esperado;
    this.flashcardFeedback = acertou ? 'acerto' : 'erro';
    this.avaliacaoFlashcardSelecionada = acertou ? 'BOM' : 'ERREI';
  }

  virarFlashcard(): void {
    this.mostrarVersoAtual = !this.mostrarVersoAtual;
    if (!this.mostrarVersoAtual) {
      this.resetFlashcardFeedback();
      if (this.isVerdadeiroFalso(this.flashcardAtual)) {
        this.avaliacaoFlashcardSelecionada = null;
      }
    }
  }

  proximoFlashcard(): void {
    if (!this.flashcards.length) {
      return;
    }
    const proximoIndex = this.flashcardIndexAtual + 1;
    if (proximoIndex >= this.flashcards.length) {
      const desejaRefazer = window.confirm(
        'Voce chegou ao ultimo flashcard. Deseja refazer a revisao?'
      );
      if (!desejaRefazer) {
        return;
      }
      this.flashcardIndexAtual = 0;
    } else {
      this.flashcardIndexAtual = proximoIndex;
    }
    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.resetFlashcardFeedback();
    this.iniciarContagemRevisaoItem();
  }

  private getTopicoIdFromDto(dto: any): number | null {
    const id =
      dto?.id ??
      dto?.topicoId ??
      dto?.subtopicoId ??
      dto?.idTopico ??
      dto?.idSubtopico ??
      null;
    return id ? Number(id) : null;
  }

  anteriorFlashcard(): void {
    if (!this.flashcards.length) {
      return;
    }
    this.flashcardIndexAtual =
      (this.flashcardIndexAtual - 1 + this.flashcards.length) % this.flashcards.length;
    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.resetFlashcardFeedback();
    this.iniciarContagemRevisaoItem();
  }

  removerFlashcardAtual(): void {
    if (!this.flashcardAtual || !this.flashcardAtual.id) {
      return;
    }

    const confirmou = window.confirm('Deseja realmente excluir este flashcard?');
    if (!confirmou) {
      return;
    }

    this.salaEstudoService.excluirFlashcard(this.flashcardAtual.id).subscribe({
      next: () => {
        this.carregarFlashcards();
      },
      error: (err) => {
        console.error('[FLASHCARD] Erro ao excluir:', err);
        alert('Erro ao excluir flashcard.');
      }
    });
  }

  // ================================================================
  // REVISÃO ESPAÇADA (FLASHCARDS + ANOTAÇÕES)
  // ================================================================

  /**
   * Carrega apenas os flashcards vencidos / para hoje para o tópico atual.
   */
  private carregarFlashcardsParaRevisao(): void {
    if (!this.topicoSelecionado) {
      this.flashcards = [];
      return;
    }

    this.carregandoFlashcardsRevisao = true;
    this.erroFlashcardsRevisao = undefined;

    this.salaEstudoService.listarFlashcardsParaRevisao(this.topicoSelecionado.id)
      .subscribe({
        next: (lista) => {
          this.flashcards = lista || [];
          this.flashcardIndexAtual = 0;
          this.mostrarVersoAtual = false;
          this.avaliacaoFlashcardSelecionada = null;
          this.carregandoFlashcardsRevisao = false;
          this.resetFlashcardFeedback();
          this.iniciarContagemRevisaoItem();
        },
        error: (err) => {
          console.error('[REVISÃO] Erro ao carregar flashcards de revisão:', err);
          this.erroFlashcardsRevisao = 'Erro ao carregar flashcards para revisão.';
          this.carregandoFlashcardsRevisao = false;
          this.flashcards = [];
        }
      });
  }

  avaliacaoFlashcardSelecionada: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL' | null = null;
  enviandoAvaliacaoFlashcard: boolean = false;

  selecionarAvaliacaoFlashcard(avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'): void {
    this.avaliacaoFlashcardSelecionada = avaliacao;
  }

  /**
   * Marca o flashcard atual como ERREI / DIFICIL / BOM / FACIL
   * e deixa o back recalcular a pr�xima revis�o.
   */
  confirmarAvaliacaoFlashcard(): void {
    const atual = this.flashcardAtual;
    const avaliacao = this.avaliacaoFlashcardSelecionada;
    if (this.enviandoAvaliacaoFlashcard || !avaliacao || !atual || !atual.id) {
      return;
    }

    const req: FlashcardRevisaoRespostaRequest = {
      flashcardId: atual.id,
      avaliacao
    };

    this.enviandoAvaliacaoFlashcard = true;
    this.salaEstudoService.responderRevisaoFlashcard(req).subscribe({
      next: () => {
        this.proximoFlashcard();
        this.recarregarTopicosAposRevisao();
        this.avaliacaoFlashcardSelecionada = null;
        this.enviandoAvaliacaoFlashcard = false;

        this.mostrarMensagemRevisao('Revisao do flashcard registrada!');
        this.temTempoNaoSalvoFlag = false;
      },
      error: (err) => {
        console.error('[REVISAO] Erro ao registrar resposta do flashcard:', err);
        alert('Erro ao registrar resposta da revisao. Tente novamente.');
        this.enviandoAvaliacaoFlashcard = false;
      }
    });
  }
  /**
   * Marca a revisão das anotações (nível tópico) como ERREI / DIFICIL / BOM / FACIL.
   * O servidor cuida da lógica das "caixinhas" do tópico.
   */
  avaliacaoSelecionada: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL' | null = null;
  avaliarRevisaoAnotacao(avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'): void {
  this.avaliacaoSelecionada = avaliacao;
  if (!this.topicoSelecionado) {
    return;
  }

  const req: TopicoRevisaoRespostaRequest = {
    topicoId: this.topicoSelecionado.id,
    avaliacao
  };
  this.ultimoTopicoRevisadoId = req.topicoId;

  console.log('[REVISAO] Enviando avaliacao de anotacoes:', {
    topicoId: req.topicoId,
    avaliacao: req.avaliacao,
    modo: this.modo,
    modoRevisao: this.modoRevisao
  });

  const proximo = this.obterProximoTopicoRevisao();

  this.registrarTempoRevisao();
  this.mostrarMensagemRevisao('Revis\u00e3o das anota\u00e7\u00f5es registrada!');
  this.temTempoNaoSalvoFlag = false;

  if (proximo && this.topicoSelecionado?.id !== proximo.id) {
    this.selecionarTopico(proximo);
  }

    this.salaEstudoService.responderRevisaoTopico(req).subscribe({
      next: () => {
        console.log('[REVISÃO] Revisão de anotações registrada com sucesso');
        this.recarregarTopicosAposRevisao();
    },
      error: (err) => {
        console.error('[REVISÃO] Erro ao registrar revisão de anotações:', err);
        alert('Erro ao registrar revisão das anotações. Tente novamente.');
      }
    });
  }

  private iniciarContagemRevisaoItem(): void {
    this.revisaoItemInicio = Date.now();
    this.avaliacaoSelecionada = null;
  }

  private registrarTempoRevisao(): void {
    const agora = Date.now();
    const inicio = this.revisaoItemInicio;
    let deltaSeg = inicio ? Math.floor((agora - inicio) / 1000) : 0;
    if (deltaSeg <= 0) {
      deltaSeg = 0;
    }
    const deltaNormalizado = this.normalizarDeltaRevisao(deltaSeg);
    const totalAtual = Number(localStorage.getItem(this.revisaoTempoKey)) || 0;
    const itensAtuais = Number(localStorage.getItem(this.revisaoItensKey)) || 0;
    localStorage.setItem(this.revisaoTempoKey, String(totalAtual + deltaNormalizado));
    localStorage.setItem(this.revisaoItensKey, String(itensAtuais + 1));
    this.revisaoItemInicio = agora;
  }

  private normalizarDeltaRevisao(deltaSeg: number): number {
    if (!Number.isFinite(deltaSeg) || deltaSeg <= 0) {
      return 360;
    }
    return Math.min(Math.max(deltaSeg, 20), 1800);
  }



    get podeVoltarRevisao(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  voltarRevisao(): void {
    const anterior = this.obterTopicoAnteriorRevisao();
    if (!anterior) {
      return;
    }
    if (this.topicoSelecionado?.id === anterior.id) {
      return;
    }
    this.selecionarTopico(anterior);
  }

  private obterTopicoAnteriorRevisao(): any | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) {
      return null;
    }

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    for (let offset = 1; offset <= lista.length; offset++) {
      const idx = (startIdx - offset + lista.length) % lista.length;
      const candidato = lista[idx];
      if (this.isRevisaoPrioritaria(candidato)) {
        return candidato;
      }
    }

    if (startIdx >= 0) {
      return lista[(startIdx - 1 + lista.length) % lista.length];
    }

    return lista[0];
  }

  get podeVoltarEstudo(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  voltarEstudo(): void {
    const anterior = this.obterTopicoAnteriorEstudo();
    if (!anterior) {
      return;
    }
    if (this.topicoSelecionado?.id === anterior.id) {
      return;
    }
    this.selecionarTopico(anterior);
  }

  private obterTopicoAnteriorEstudo(): any | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) {
      return null;
    }

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    if (startIdx >= 0) {
      return lista[(startIdx - 1 + lista.length) % lista.length];
    }

    return lista[0];
  }
  get podeIrParaProximaRevisao(): boolean {
    const lista = this.getTopicosParaRevisao();
    return lista.length > 1;
  }

  irParaProximaRevisao(): void {
    const proximo = this.obterProximoTopicoRevisao();
    if (!proximo) {
      return;
    }
    if (this.topicoSelecionado?.id === proximo.id) {
      return;
    }
    this.selecionarTopico(proximo);
  }

  private obterProximoTopicoRevisao(): any | null {
    const lista = this.getTopicosParaRevisao();
    if (!lista.length) {
      return null;
    }

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    for (let offset = 1; offset <= lista.length; offset++) {
      const idx = (startIdx + offset + lista.length) % lista.length;
      const candidato = lista[idx];
      if (this.isRevisaoPrioritaria(candidato)) {
        return candidato;
      }
    }

    if (startIdx >= 0) {
      return lista[(startIdx + 1) % lista.length];
    }

    return lista[0];
  }

  private getTopicosParaRevisao(): any[] {
    return (this.topicos || []).filter(t => t.ativo !== false);
  }

  get podeIrParaProximoEstudo(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  irParaProximoEstudo(): void {
    const proximo = this.obterProximoTopicoEstudo();
    if (!proximo) {
      return;
    }
    if (this.topicoSelecionado?.id === proximo.id) {
      return;
    }
    this.selecionarTopico(proximo);
  }

  private obterProximoTopicoEstudo(): any | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) {
      return null;
    }

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    if (startIdx >= 0) {
      return lista[(startIdx + 1) % lista.length];
    }

    return lista[0];
  }

  private getTopicosFolha(): any[] {
    return (this.topicos || []).filter(t => !t.hasFilhos && t.ativo !== false);
  }

  private isRevisaoPrioritaria(topico: any): boolean {
    const info = this.revisoesPorTopico.get(topico.id);
    return info?.status === 'ATRASADA' || info?.status === 'HOJE';
  }

// --- IN+�CIO BLOCO: SONS DE FOCO POR +�CONE ---




// --- FIM BLOCO: SONS DE FOCO POR TÓPICO ---

  /** Mapa: topicoId -> info de revisão (status + próxima data) */
  private revisoesPorTopico = new Map<number, {
    status: StatusRevisao;
    proximaRevisao?: string | null;
  }>();
  private topicosComAnotacoes = new Set<number>();

    /**
   * Constr+�i uma data local (sem problema de UTC) a partir de 'YYYY-MM-DD'.
   */
  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);

    const data = new Date(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data;
  }

  /**
   * Carrega o dashboard geral de revisões e monta o mapa por tópico.
   * Reutiliza a mesma lógica da tela de matérias.
   */
  private carregarRevisoesDashboard(): void {
    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens) => {
        this.revisoesPorTopico.clear();
        const selecionadoId = this.topicoSelecionado?.id;
        const revisadoId = this.ultimoTopicoRevisadoId;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        (itens || []).forEach((item: any, idx: number) => {
          if (!item.topicoId) {
            return;
          }

          const proxima: string | null =
            item.proximaRevisao ||
            item.dataProximaRevisao ||
            null;

          let status: StatusRevisao = 'SEM';
          const statusRevisaoRaw = String(item.statusRevisao || '').toUpperCase();
          const statusRaw = String(item.status || '').toUpperCase();

          if (statusRevisaoRaw) {
            if (statusRevisaoRaw === 'ATRASADA') status = 'ATRASADA';
            else if (statusRevisaoRaw === 'HOJE') status = 'HOJE';
            else if (statusRevisaoRaw === 'EM_DIA') status = 'HOJE';
            else if (statusRevisaoRaw === 'FUTURA') status = 'FUTURA';
            else status = 'SEM';
          } else if (statusRaw) {
            if (statusRaw === 'VENCIDA') status = 'ATRASADA';
            else if (statusRaw === 'EM_DIA') status = 'HOJE';
            else if (statusRaw === 'FUTURA') status = 'FUTURA';
            else status = 'SEM';
          } else if (proxima) {
            const dataRev = this.construirDataLocal(proxima);

            const hojeTime = hoje.getTime();
            const revTime = dataRev.getTime();

            const hojeFlag = revTime === hojeTime;
            const atrasadoFlag = revTime < hojeTime;

            if (atrasadoFlag) status = 'ATRASADA';
            else if (hojeFlag) status = 'HOJE';
            else status = 'FUTURA';
          }

          this.revisoesPorTopico.set(item.topicoId, {
            status,
            proximaRevisao: proxima
          });

          if (selecionadoId && item.topicoId === selecionadoId) {
            console.log('[SALA-ESTUDO] Status recebido do back (topico selecionado):', {
              topicoId: item.topicoId,
              status,
              proximaRevisao: proxima,
              statusRevisaoRaw,
              statusRaw
            });
          }
          if (revisadoId && item.topicoId === revisadoId) {
            console.log('[SALA-ESTUDO] Status recebido do back (topico revisado):', {
              topicoId: item.topicoId,
              status,
              proximaRevisao: proxima,
              statusRevisaoRaw,
              statusRaw
            });
          }
        });

        console.log('[SALA-ESTUDO] Mapa revisoesPorTopico:', this.revisoesPorTopico);
        this.revisoesCarregadas = true;
        this.tentarSelecionarTopicoInicial();
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar revisões dashboard:', err);
      }
    });
  }

  private tentarSelecionarTopicoInicial(): void {
    if (this.selecionouTopicoInicial || !this.topicosCarregados) {
      return;
    }
    if (this.autoSelecionarUltimoNaoEstudado && !this.revisoesCarregadas) {
      return;
    }
    if (!this.topicosFinalizadosCarregados) {
      return;
    }

    let alvo: any | undefined;
    if (this.topicoIdPreferido) {
      const candidato = this.topicos.find(t => t.id === this.topicoIdPreferido);
      if (candidato) {
        if (this.isTopicoFinalizado(candidato)) {
          const folhas = this.topicos.filter(t => !t.hasFilhos && t.ativo !== false);
          alvo = this.obterProximoTopicoApos(folhas, candidato.id) || candidato;
        } else {
          alvo = candidato;
        }
      }
    }

    if (!alvo) {
      const folhas = this.topicos.filter(t => !t.hasFilhos && t.ativo !== false);
      const ultimoTopicoId = this.obterUltimoTopicoId();
      if (ultimoTopicoId) {
        const ultimoTopico = folhas.find(t => t.id === ultimoTopicoId);
        if (ultimoTopico) {
          if (this.isTopicoFinalizado(ultimoTopico)) {
            const proximo = this.obterProximoTopicoApos(folhas, ultimoTopico.id);
            alvo = proximo || this.obterPrimeiroNaoEstudado(folhas) || ultimoTopico;
          } else {
            alvo = ultimoTopico;
          }
        }
      }

      if (!alvo && this.autoSelecionarUltimoNaoEstudado && folhas.length) {
        const primeiroNaoEstudado = this.obterPrimeiroNaoEstudado(folhas);
        if (primeiroNaoEstudado) {
          const proximoAposUltimoEstudado = this.obterProximoNaoEstudadoAposUltimoEstudado(folhas);
          const precisaConfirmar = this.precisaConfirmarContinuacao(
            folhas,
            primeiroNaoEstudado,
            proximoAposUltimoEstudado
          );
          if (precisaConfirmar) {
            const continuar = window.confirm('Continuar de onde parou?');
            alvo = continuar ? (proximoAposUltimoEstudado || primeiroNaoEstudado) : primeiroNaoEstudado;
          } else {
            alvo = primeiroNaoEstudado;
          }
        }
        if (!alvo) {
          alvo = folhas[0];
        }
      }

      if (alvo) {
        this.selecionarTopico(alvo);
        this.selecionouTopicoInicial = true;
        return;
      }
      if (!alvo) {
        alvo = folhas[0];
      }
    }

    if (!alvo) {
      alvo = this.topicos[0];
    }

    if (alvo) {
      this.selecionarTopico(alvo);
      this.selecionouTopicoInicial = true;
    }
  }

  finalizarTopico(): void {
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) {
      return;
    }
    const topicoId = this.topicoSelecionado?.id;
    if (!topicoId || this.topicosFinalizadosPendentes.has(topicoId)) {
      return;
    }

    if (this.isTopicoFinalizado(this.topicoSelecionado)) {
      const confirmado = window.confirm('Deseja desfazer o finalizado deste topico?');
      if (!confirmado) {
        return;
      }
      this.topicosFinalizadosPendentes.add(topicoId);
      this.topicosFinalizados.delete(topicoId);
      this.salaEstudoService.desfinalizarTopico(topicoId).subscribe({
        next: () => {
          this.topicosFinalizadosPendentes.delete(topicoId);
          this.mensagemTopicoFinalizado = 'Finalizado removido.';
          setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
          this.carregarTopicosFinalizados();
        },
        error: () => {
          this.topicosFinalizadosPendentes.delete(topicoId);
          this.topicosFinalizados.add(topicoId);
          this.mensagemTopicoFinalizado = 'Nao foi possivel desfazer o finalizado.';
          setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
        }
      });
      return;
    }

    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }
    if (this.temTempoNaoSalvo()) {
      this.salvarEstudo();
    }
    const proximoPreferidoId = this.obterProximoTopicoIdAtual(topicoId);
    this.topicosFinalizadosPendentes.add(topicoId);
    this.salaEstudoService.finalizarTopico(topicoId).subscribe({
      next: () => {
        this.topicosFinalizadosPendentes.delete(topicoId);
        this.topicosFinalizados.add(topicoId);
        this.mensagemTopicoFinalizado = 'Topico finalizado.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
        this.carregarTopicosFinalizados();
        this.recarregarTopicosAposRevisao(topicoId, proximoPreferidoId);
      },
      error: () => {
        this.topicosFinalizadosPendentes.delete(topicoId);
        this.mensagemTopicoFinalizado = 'Nao foi possivel finalizar o topico.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
      }
    });
  }

  resetarTopico(): void {
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) {
      return;
    }
    const topicoId = this.topicoSelecionado?.id;
    if (!topicoId || this.topicosResetPendentes.has(topicoId)) {
      return;
    }

    const confirmado = window.confirm(
      'Deseja zerar todo o estudo deste topico? Isso apagará anotacoes, flashcards, vocabulario, tempos e revisoes.'
    );
    if (!confirmado) {
      return;
    }

    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }

    this.topicosResetPendentes.add(topicoId);
    this.salaEstudoService.resetarTopico(topicoId).subscribe({
      next: () => {
        this.topicosResetPendentes.delete(topicoId);
        this.mensagemTopicoFinalizado = 'Topico zerado.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
        window.location.reload();
      },
      error: () => {
        this.topicosResetPendentes.delete(topicoId);
        this.mensagemTopicoFinalizado = 'Nao foi possivel zerar o topico.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
      }
    });
  }

  private obterPrimeiroNaoEstudado(folhas: any[]): any | null {
    const candidato = folhas.find(t => !this.temEstudoNoTopico(t));
    return candidato || null;
  }

  private precisaConfirmarContinuacao(
    folhas: any[],
    primeiroNaoEstudado: any,
    proximoAposUltimoEstudado: any | null
  ): boolean {
    if (!folhas.length) return false;
    if (!primeiroNaoEstudado?.id) return false;
    if (!proximoAposUltimoEstudado?.id) return false;
    const index = folhas.findIndex(t => t.id === primeiroNaoEstudado.id);
    if (index <= 0) return false;
    return folhas.slice(0, index).some(t => this.temEstudoNoTopico(t));
  }

  private obterProximoNaoEstudadoAposUltimoEstudado(folhas: any[]): any | null {
    let ultimoEstudadoIndex = -1;
    for (let i = 0; i < folhas.length; i += 1) {
      if (this.temEstudoNoTopico(folhas[i])) {
        ultimoEstudadoIndex = i;
      }
    }
    if (ultimoEstudadoIndex < 0) {
      return null;
    }
    for (let i = ultimoEstudadoIndex + 1; i < folhas.length; i += 1) {
      if (!this.temEstudoNoTopico(folhas[i])) {
        return folhas[i];
      }
    }
    return null;
  }

    /** Define a "força" de cada status para comparar pai x filhos */
  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3; // mais cr+�tico
      case 'HOJE':     return 2;
      case 'FUTURA':   return 1;
      case 'SEM':
      default:         return 0;
    }
  }

  /** Busca um DTO de t+�pico na +�rvore original pelo id */
  private encontrarDtoPorId(lista: any[], id: number): any | null {
    for (const dto of lista) {
      if (dto.id === id) {
        return dto;
      }
      if (dto.subtopicos && dto.subtopicos.length) {
        const achou = this.encontrarDtoPorId(dto.subtopicos, id);
        if (achou) {
          return achou;
        }
      }
    }
    return null;
  }

  private normalizarStatusRevisao(raw: any): StatusRevisao | null {
    const status = String(raw || '').toUpperCase();
    if (status === 'EM_DIA') {
      return 'HOJE';
    }
    if (status === 'ATRASADA' || status === 'HOJE' || status === 'FUTURA' || status === 'SEM') {
      return status as StatusRevisao;
    }
    return null;
  }

  private getStatusFromDto(dto: any): StatusRevisao {
    if (!dto?.id) {
      return 'SEM';
    }
    const info = this.revisoesPorTopico.get(dto.id);
    if (info?.status) {
      return info.status;
    }
    const statusDto = this.normalizarStatusRevisao(dto.statusRevisao);
    if (statusDto) {
      return statusDto;
    }
    return 'SEM';
  }

  /**
   * Status "simples" de um tópico, olhando só o próprio id no mapa de revisões.
   * (Dashboard já calculou o status com base na data).
   */
  private getStatusSimplesTopico(topicoId: number | undefined): StatusRevisao {
    if (!topicoId) {
      return 'SEM';
    }
    const info = this.revisoesPorTopico.get(topicoId);
    if (!info) {
      const dto = this.encontrarDtoPorId(this.arvoreTopicos, topicoId);
      if (dto) {
        return this.getStatusFromDto(dto);
      }
      return this.topicosComAnotacoes.has(topicoId) ? 'FUTURA' : 'SEM';
    }
    return info.status ?? 'SEM';
  }

  /**
   * Status consolidado do t+�pico na +�RVORE:
   * considera o pr+�prio id + todos os subtopicos.
   */
  private getStatusRevisaoTopicoNaArvore(dto: any): StatusRevisao {
    let pior: StatusRevisao = this.getStatusFromDto(dto);

    const filhos = dto.subtopicos || [];
    filhos.forEach((filho: any) => {
      const stFilho = this.getStatusRevisaoTopicoNaArvore(filho);
      if (this.prioridadeStatus(stFilho) > this.prioridadeStatus(pior)) {
        pior = stFilho;
      }
    });

    return pior;
  }

  /**
   * Dado o n+� achatado (t da lista da esquerda),
   * devolve o status consolidado (ele + filhos), usando a +�rvore original.
   */
  private getStatusRevisaoTopicoView(t: any): StatusRevisao {
    if (!t || !t.id) {
      return 'SEM';
    }

    const dto = this.encontrarDtoPorId(this.arvoreTopicos, t.id);
    if (!dto) {
      // fallback: s+� o pr+�prio
      return this.getStatusSimplesTopico(t.id);
    }

	    return this.getStatusFromDto(dto);
  }

  /** Classes CSS para a bolinha da Sala de Estudo */
  temEstudoNoTopico(t: any): boolean {
    return this.getStatusRevisaoTopicoView(t) !== 'SEM';
  }

  podeQuebrarTopico(t: any): boolean {
    return !!t?.id;
  }

  private coletarIdsSubarvore(dto: any): number[] {
    const ids: number[] = [];
    const stack: any[] = [dto];
    while (stack.length) {
      const atual = stack.pop();
      if (!atual) continue;
      const id =
        atual.id ??
        atual.topicoId ??
        atual.subtopicoId ??
        atual.idTopico ??
        atual.idSubtopico ??
        null;
      if (id) ids.push(Number(id));
      const filhos = atual.subtopicos || atual.filhos || [];
      if (Array.isArray(filhos) && filhos.length) {
        stack.push(...filhos);
      }
    }
    return ids;
  }

  private atualizarContadorCaracteres(quantidade: number): void {
    const usado = Math.max(0, Math.min(this.maxCaracteres, quantidade));
    this.caracteresUsados = usado;
    this.caracteresRestantes = Math.max(0, this.maxCaracteres - usado);
  }

  private atualizarContadorCaracteresFromHtml(html: string): void {
    if (!html) {
      this.atualizarContadorCaracteres(0);
      return;
    }
    if (typeof document === 'undefined') {
      const texto = html.replace(/<[^>]*>/g, '');
      this.atualizarContadorCaracteres(texto.length);
      return;
    }
    const container = document.createElement('div');
    container.innerHTML = html;
    const texto = container.textContent || '';
    this.atualizarContadorCaracteres(texto.length);
  }

  private hasConteudoAnotacoes(html?: string | null): boolean {
    if (!html) {
      return false;
    }
    if (typeof document === 'undefined') {
      return html.replace(/<[^>]*>/g, '').trim().length > 0;
    }
    const container = document.createElement('div');
    container.innerHTML = html;
    const texto = (container.textContent || '').replace(/\u200B/g, '').trim();
    return texto.length > 0;
  }

  private normalizarHtmlAnotacoes(html: string): string {
    if (!html) {
      return '';
    }
    let normalizado = html;
    // Remove parágrafos vazios repetidos gerados pelo editor
    normalizado = normalizado.replace(/(?:<p><br><\/p>|\s*<p>\s*<\/p>)+/gi, '<p><br></p>');
    // Remove espaços em branco no início/fim
    normalizado = normalizado.trim();
    return normalizado;
  }

  private atualizarMarcaAnotacoes(topicoId: number | undefined, temConteudo: boolean): void {
    if (!topicoId) {
      return;
    }
    if (temConteudo) {
      this.topicosComAnotacoes.add(topicoId);
    } else {
      this.topicosComAnotacoes.delete(topicoId);
    }
  }
  classeSemaforoRevisaoSala(t: any) {
    const status = this.getStatusRevisaoTopicoView(t);

    return {
      'badge-sem-revisao': status === 'SEM',
      'badge-revisao-futura': status === 'FUTURA',
      'badge-revisao-hoje': status === 'HOJE',
      'badge-revisao-atrasada': status === 'ATRASADA'
    };
  }

  /** Recarrega a árvore de tópicos para atualizar o semáforo
 *  preservando o tópico selecionado.
 */
/** Recarrega revisões + árvore de tópicos para atualizar o semáforo,
 *  preservando o tópico selecionado.
 */
private recarregarTopicosAposRevisao(proximoAposId?: number | null, proximoPreferidoId?: number | null): void {
  if (!this.materiaId) {
    return;
  }

  const idSelecionado = this.topicoSelecionado?.id;
  console.log('[SALA-ESTUDO] Recarregar apos revisao:', {
    materiaId: this.materiaId,
    idSelecionado,
    proximoAposId,
    proximoPreferidoId
  });

  // 1) Atualiza o mapa de revisões (daqui que vem o semáforo)
  this.carregarRevisoesDashboard();

  // 2) Recarrega a árvore de tópicos (efeito "F5" na coluna esquerda)
  this.materiaService.listarTopicos(this.materiaId).subscribe({
    next: (lista) => {
      const listaSegura = lista || [];
      console.log('[SALA-ESTUDO] Recarregando tópicos após revisão:', listaSegura);
      this.arvoreTopicos = listaSegura;
      this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

      if (proximoPreferidoId) {
        const preferido = this.topicos.find(t => t.id === proximoPreferidoId);
        if (preferido) {
          this.selecionarTopico(preferido);
          return;
        }
      }

      if (proximoAposId) {
        const candidato = this.obterProximoTopicoParaEstudo(proximoAposId);
        if (candidato) {
          this.selecionarTopico(candidato);
          return;
        }
      }

      // tenta manter o mesmo t+�pico selecionado
      if (idSelecionado) {
        const encontrado = this.topicos.find(t => t.id === idSelecionado);
        if (encontrado) {
          this.topicoSelecionado = encontrado;
        }
      }
    },
    error: (err) => {
      console.error('[SALA-ESTUDO] Erro ao recarregar tópicos após revisão:', err);
    }
  });
}

private obterProximoTopicoParaEstudo(atualId: number): any | null {
  const folhas = this.getTopicosFolha();
  if (!folhas.length) {
    return null;
  }

  const index = folhas.findIndex(t => t.id === atualId);
  for (let i = index + 1; i < folhas.length; i += 1) {
    if (!this.isTopicoFinalizado(folhas[i])) {
      return folhas[i];
    }
  }

  for (let i = 0; i < folhas.length; i += 1) {
    if (!this.isTopicoFinalizado(folhas[i])) {
      return folhas[i];
    }
  }

  return null;
}

private obterProximoTopicoIdAtual(atualId: number): number | null {
  const folhas = this.getTopicosFolha();
  if (!folhas.length) {
    return null;
  }

  const index = folhas.findIndex(t => t.id === atualId);
  for (let i = index + 1; i < folhas.length; i += 1) {
    if (!this.isTopicoFinalizado(folhas[i])) {
      return folhas[i]?.id ?? null;
    }
  }

  for (let i = 0; i < folhas.length; i += 1) {
    if (!this.isTopicoFinalizado(folhas[i])) {
      return folhas[i]?.id ?? null;
    }
  }

  return null;
}
private atualizarQueryTopico(topicoId: number): void {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { topicoId },
    queryParamsHandling: 'merge',
    replaceUrl: true
  });
}
private mostrarMensagemRevisao(texto: string): void {
  this.mensagemRevisao = texto;
  setTimeout(() => {
    this.mensagemRevisao = undefined;
  }, 4000);
}


}






















