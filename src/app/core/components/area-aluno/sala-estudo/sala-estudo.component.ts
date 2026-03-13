import { FlashcardDTO } from '../models/FlashcardDTO';
import { Component, HostListener, OnInit, OnDestroy, ElementRef, ViewChild, NgZone, AfterViewInit, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { forkJoin, of, from, Observable, Subject, EMPTY } from 'rxjs';
import { catchError, concatMap, distinctUntilChanged, exhaustMap, filter, finalize, map, shareReplay, switchMap, tap, toArray } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ListarTopicosMateriaResponse, MateriaService } from '../services/materia.service';
import { Materia } from '../models/materia.model';
import { BlocosEstudoService } from '../services/blocos-estudo.service';
import {
  SalaEstudoService,
  EstudoTopicoRequest,
  FlashcardRevisaoRespostaRequest,
  TopicoRevisaoRespostaRequest,
  TopicoFinalizadoDTO,
  VocabularioDTO,
  MateriaTopicosDTO,
  NextTopicContext,
  TopicoNodeDTO,
  ResumeTopicResponseDTO
} from '../services/sala-estudo.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';
import { environment } from 'src/environments/environment';
import { extrairStatusCanonicoRevisao } from '../utils/revisao-status.util';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';
import { RetencaoPontoDTO } from 'src/app/core/models/retencao-analytics.models';
import { RefreshBusService } from 'src/app/core/services/refresh-bus.service';
import { ExecutionQueueItem, ExecutionQueueService } from 'src/app/core/services/execution-queue.service';
import { FlashcardService } from '../services/flashcard.service';

type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';
type TopicoViewModel = {
  id: number;
  descricao: string;
  ativo?: boolean;
  nivel: number;
  materiaId?: number;
  hasFilhos: boolean;
  _raw?: TopicoNodeDTO;
  subtopicos?: TopicoNodeDTO[];
  paiId?: number;
  topicoPai?: { id?: number | null };
  pai?: { id?: number | null };
  dataAtualizacao?: string;
  dataCriacao?: string;
  updatedAt?: string;
  filhos?: TopicoViewModel[];
  [key: string]: unknown;
};

type QuillEditorLike = {
  clipboard?: { addMatcher: (tag: string, matcher: () => { ops: unknown[] }) => void };
  on?: (name: string, handler: (range: { index: number; length: number } | null) => void) => void;
  getText?: (index: number, length: number) => string;
  getLength?: () => number;
  deleteText?: (index: number, length: number, source?: string) => void;
  getSelection?: () => { index: number; length: number } | null;
  root?: HTMLElement;
};

interface RevisaoTopicoItem {
  topicoId?: number;
  proximaRevisao?: string | null;
  dataProximaRevisao?: string | null;
  status?: string | null;
  statusCanonico?: string | null;
}

interface AnotacoesPayload {
  anotacoes?: string;
}

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly salvarEstudoTrigger$ = new Subject<string>();
  private readonly escopoParametroChave = 'centro_estudo_filtro_pro_prova';
  private readonly usarRegrasBackV2 = !!environment?.featureFlags?.backendBusinessRulesV2;
  private readonly saveLogFeatureEnabled = !!environment?.featureFlags?.salaEstudoSaveLog;
  mensagemRevisao?: string;
  materiaId!: number;
  materia?: Materia;
  materiasDisponiveisTroca: Materia[] = [];
  carregandoMateriasTroca = false;
  menuTrocaMateriaAberto = false;

  mensagemFlashcardSucesso?: string;
  salvandoFlashcard = false;
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
  private readonly saveLogDebugKey = 'sala-estudo:debug-save-log';
  private readonly saveLogFlushMs = 4000;
  private readonly saveLogMaxEntries = 200;
  private readonly saveLogFlushBatchSize = 12;
  private saveLogPersistido: Array<Record<string, unknown>> = [];
  private saveLogBuffer: Array<Record<string, unknown>> = [];
  private saveLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private saveLogCarregado = false;
  private saveLogRuntimeEnabled: boolean | null = null;
  private anotacoesReqSeq = 0;
  private nextTopicReqSeq = 0;
  private avancandoTopico = false;
  private flashcardsReqSeq = 0;
  private flashcardsRevisaoReqSeq = 0;
  private vocabulariosReqSeq = 0;
  private ultimaAnotacoesReqInfo: { seq: number; topicoId: number | null } | null = null;
  carregandoAnotacoes = false;

  private topicosFinalizados = new Set<number>();
  private topicosFinalizadosCarregados = false;
  private topicosFinalizadosPendentes = new Set<number>();
  private topicosResetPendentes = new Set<number>();

  @ViewChild('flashcardModal', { static: false }) flashcardModalRef?: ElementRef<HTMLElement>;
  @ViewChild('flashcardOverlay', { static: false }) flashcardOverlayRef?: ElementRef<HTMLElement>;
  @ViewChild('listaTopicos', { static: false }) listaTopicosRef?: ElementRef<HTMLElement>;
  @ViewChild('listaTopicosContainer', { static: false }) listaTopicosContainerRef?: ElementRef<HTMLElement>;

  private centralizarTopicoTentativas = 0;
  private centralizacaoSeq = 0;
  private centralizacaoProgramadaRefs: Array<ReturnType<typeof setTimeout>> = [];
  private listaTopicosObserver?: MutationObserver;
  private recentralizarRafId: number | null = null;

  flashcardModalPos = { x: 0, y: 0 };
  flashcardModalDragging = false;
  private flashcardDragOffset = { x: 0, y: 0 };

  private quillEditor?: QuillEditorLike;
  private ultimoTrechoSelecionado = '';

  maxCaracteres = 1200;
  caracteresUsados = 0;
  caracteresRestantes = 1200;
  private ajustandoLimiteCaracteres = false;

  topicos: TopicoViewModel[] = [];
  topicoSelecionado?: TopicoViewModel | null;

  private topicoIdPreferido: number | null = null;
  private origemEntrada: string | null = null;
  private resumeTopic: ResumeTopicResponseDTO | null = null;
  resumeSemConteudoMateria = false;
  private topicoInicialDefinido = false;
  revisaoDirecionadaAtiva = false;
  private autoSelecionarUltimoNaoEstudado = false;

  private topicosCarregados = false;
  private revisoesCarregadas = false;
  private selecionouTopicoInicial = false;

  private modoPreferido: 'estudar' | 'revisar' = 'estudar';
  private temTempoNaoSalvoFlag = false;

  arvoreTopicos: TopicoNodeDTO[] = [];
  private ordemVersionAtual: string | null = null;
  private topicosComMetaCache: { materiaId: number; ordemVersion: string | null; response: ListarTopicosMateriaResponse } | null = null;
  private topicosComMetaInFlight$: Observable<ListarTopicosMateriaResponse> | null = null;
  private topicosComMetaInFlightMateriaId: number | null = null;

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // modo de revisao (anotacoes x flashcards)
  modoRevisao: 'anotacoes' | 'flashcards' = 'anotacoes';
  private preferirFlashcardsAoEntrarRevisao = false;
  revisaoAutoExplicacaoAtiva = false;

  // controle da coluna esquerda (topicos)
  colunaEsquerdaOculta: boolean = false;
  filtroSemaforoSelecionado: StatusRevisao | null = null;
  readonly opcoesFiltroSemaforo: Array<{ status: StatusRevisao; rotulo: string; classe: string }> = [
    { status: 'SEM', rotulo: 'A iniciar', classe: 'badge-sem-revisao' },
    { status: 'FUTURA', rotulo: 'Futura', classe: 'badge-revisao-futura' },
    { status: 'HOJE', rotulo: 'Hoje', classe: 'badge-revisao-hoje' },
    { status: 'ATRASADA', rotulo: 'Atrasadas', classe: 'badge-revisao-atrasada' }
  ];

  // ======================= TIMER / POMODORO =======================

  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // total decorrido no cronometro (modo livre)
  tempoTotalSegundos: number = 0;

  // quanto tempo ja foi efetivamente salvo no backend para o topico atual (em segundos)
  private segundosEstudoJaSalvosTopicoAtual: number = 0;

  timerAtivo: boolean = false;
  private timerRef?: ReturnType<typeof setInterval>;

  pomodoroDuracaoFoco: number = 1500;      // 25 min
  pomodoroDuracaoPausaCurta: number = 300; // 5 min
  pomodoroDuracaoPausaLonga: number = 900; // 15 min
  pomodoroCiclosParaLonga: number = 4;

  pomodoroFase: 'foco' | 'pausa-curta' | 'pausa-longa' = 'foco';
  pomodoroSegundosRestantes: number = this.pomodoroDuracaoFoco;
  pomodoroCiclosConcluidos: number = 0;

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

  // =============== SPLIT (QUEBRAR TOPICO) ===============
  mostrarModalSplit: boolean = false;
  splitTopico: TopicoViewModel | null = null;
  splitNovos: Array<{ id?: number; descricao: string; removendo?: boolean }> = [];
  splitTituloPai: string = '';
  private splitTituloPaiOriginal: string = '';
  private splitDescricaoOriginalPorId = new Map<number, string>();
  private splitOrdemOriginalPorId = new Map<number, number>();
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
  private flashcardModalEdicaoId: number | null = null;

  revisouAnotacoesSessao: boolean = false;
  revisouFlashcardsSessao: boolean = false;

  flashcards: FlashcardDTO[] = [];
  flashcardIndexAtual: number = 0;
  mostrarVersoAtual: boolean = false;
  flashcardFeedback: 'acerto' | 'erro' | null = null;

  carregandoFlashcardsRevisao: boolean = false;
  erroFlashcardsRevisao?: string;

  private revisaoItemInicio: number | null = null;
  private ultimoTopicoRevisadoId: number | null = null;
  private readonly revisaoTempoKey = 'revisao:tempoTotalSegundos';
  private readonly revisaoItensKey = 'revisao:itensTotais';

  /** Mapa: topicoId -> info de revisão (status + próxima data) */
  private revisoesPorTopico = new Map<number, {
    status: StatusRevisao;
    proximaRevisao?: string | null;
  }>();
  private overrideStatusRevisaoPorTopico = new Map<number, { status: StatusRevisao; expiresAt: number }>();

  private topicosComAnotacoes = new Set<number>();
  private revisoesViewVersion = 0;
  private topicosExibidosCacheFonte: TopicoViewModel[] | null = null;
  private topicosExibidosCacheFiltro: StatusRevisao | null = null;
  private topicosExibidosCacheRevisoesVersion = -1;
  private topicosExibidosCacheResultado: TopicoViewModel[] = [];
  private topicosEscopoSemanaIds = new Set<number>();

  avaliacaoFlashcardSelecionada: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL' | null = null;
  enviandoAvaliacaoFlashcard: boolean = false;
  enviandoAvaliacaoAnotacao: boolean = false;

  avaliacaoSelecionada: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL' | null = null;
  feedbackRetencao?: string;
  private scoreRetencaoPorTopico = new Map<number, number>();
  private feedbackRetencaoTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshBusTimers: Array<ReturnType<typeof setTimeout>> = [];
  private modoExecucaoFila = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private empresaParametroService: EmpresaParametroService,
    private blocosService: BlocosEstudoService,
    private retencaoAnalyticsService: RetencaoAnalyticsService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone,
    private messageService: MessageService,
    private refreshBusService: RefreshBusService,
    private executionQueueService: ExecutionQueueService,
    private flashcardService: FlashcardService
  ) {}

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    this.carregarPreferenciaPausaAba();
    this.carregarMateriasDisponiveisTroca();
    this.revisaoDirecionadaAtiva = this.isOrigemRevisaoDirecionada(this.getOrigemFromQuery(this.route.snapshot.queryParamMap));

    this.salvarEstudoTrigger$
      .pipe(
        exhaustMap((motivo) => this.salvarEstudoComResultado(motivo)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((queryParams) => {
        const topicoPreferidoAnterior = this.topicoIdPreferido;
        const topicoId = this.getTopicoIdFromQuery(queryParams);
        const origem = this.getOrigemFromQuery(queryParams);
        const autoTopico = this.getAutoTopicoFromQuery(queryParams);
        const modoAtualizado = this.getModoFromQuery(queryParams, this.modo);
        const filtroSemaforo = this.getFiltroSemaforoFromQuery(queryParams);
        const topicosEscopoSemana = this.getTopicosEscopoSemanaFromQuery(queryParams);
        const filaExecucaoAtiva = (queryParams.get('filaExecucao') || '') === '1';
        this.modoExecucaoFila = this.modoExecucaoFila || filaExecucaoAtiva;
        if (filaExecucaoAtiva && this.executionQueueService.getSnapshot().length === 0) {
          this.hidratarFilaExecucaoDaNavegacao();
        }

        if (modoAtualizado !== this.modo) {
          this.modoPreferido = modoAtualizado;
          this.mudarModo(modoAtualizado);
        }

        if (this.filtroSemaforoSelecionado !== filtroSemaforo) {
          this.filtroSemaforoSelecionado = filtroSemaforo;
          this.invalidarTopicosExibidosCache();
        }
        if (!this.saoMesmosIdsEscopo(this.topicosEscopoSemanaIds, topicosEscopoSemana)) {
          this.topicosEscopoSemanaIds = topicosEscopoSemana;
          this.invalidarTopicosExibidosCache();
        }

        this.autoSelecionarUltimoNaoEstudado = autoTopico;
        this.topicoIdPreferido = topicoId;
        this.origemEntrada = origem;
        this.revisaoDirecionadaAtiva = this.isOrigemRevisaoDirecionada(origem);

        if (topicoId && topicoId !== this.topicoSelecionado?.id && this.topicosCarregados) {
          const mudouTopicoPorNavegacao = topicoId !== topicoPreferidoAnterior;
          if (this.topicoInicialDefinido && !mudouTopicoPorNavegacao) {
            return;
          }
          const candidato = this.topicos.find(t => t.id === topicoId);
          if (candidato) {
            this.selecionarTopico(candidato);
            this.selecionouTopicoInicial = true;
          } else if (this.revisaoDirecionadaAtiva) {
            this.notificarTopicoDirecionadoNaoEncontrado(topicoId);
            this.limparFiltroTopicoDirecionado();
          }
        }
      });

    this.route.paramMap
      .pipe(
        map((params) => {
          const idParamRaw = params.get('materiaId') ?? params.get('id') ?? '';
          const materiaId = idParamRaw ? Number(idParamRaw) : 0;
          return { idParamRaw, materiaId };
        }),
        distinctUntilChanged((a, b) => a.idParamRaw === b.idParamRaw && a.materiaId === b.materiaId),
        tap(({ idParamRaw, materiaId }) => {
          this.modoExecucaoFila = idParamRaw === 'executar';
          this.materiaId = materiaId;
          this.topicoInicialDefinido = false;
          this.selecionouTopicoInicial = false;
          this.resumeTopic = null;
          this.resumeSemConteudoMateria = false;
          if ((this.route.snapshot.queryParamMap.get('filaExecucao') || '') === '1' && this.executionQueueService.getSnapshot().length === 0) {
            this.hidratarFilaExecucaoDaNavegacao();
          }
          this.erro = undefined;
          if (!materiaId && !this.modoExecucaoFila) {
            this.erro = 'Materia nao informada na rota.';
          }
        }),
        switchMap(({ idParamRaw, materiaId }) => {
          if (idParamRaw === 'executar') {
            this.iniciarExecucaoFilaDoDia();
            return EMPTY;
          }

          if (!materiaId) {
            return EMPTY;
          }

          return this.carregarSalaPorMateria$(materiaId).pipe(
            catchError((err) => {
              console.error('[SALA-ESTUDO] Erro ao carregar sala por materia:', err);
              this.erro = 'Erro ao carregar dados da sala de estudo.';
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.flushSaveLogBuffer(true);
    this.destruirObservadorListaTopicos();
    if (this.feedbackRetencaoTimer) {
      clearTimeout(this.feedbackRetencaoTimer);
      this.feedbackRetencaoTimer = null;
    }
    if (this.recentralizarRafId != null) {
      cancelAnimationFrame(this.recentralizarRafId);
      this.recentralizarRafId = null;
    }
    if (this.refreshBusTimers.length) {
      this.refreshBusTimers.forEach((timer) => clearTimeout(timer));
      this.refreshBusTimers = [];
    }
    this.limparCentralizacaoProgramada();
    this.encerrarArrasteFlashcard();
  }

  ngAfterViewInit(): void {
    this.inicializarObservadorListaTopicos();
  }

  canDeactivate(): boolean | Observable<boolean> {
    if (!this.deveAlertarTempoNaoSalvo()) {
      return true;
    }

    const salvar = confirm('Voce tem tempo de estudo nao salvo. Deseja salvar antes de sair?');
    if (salvar) {
      return this.salvarEstudoComResultado('can-deactivate');
    }
    return false;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    this.flushSaveLogBuffer(true);
    if (!this.deveAlertarTempoNaoSalvo()) {
      return;
    }
    event.preventDefault();
    event.returnValue = 'Voce tem tempo de estudo nao salvo. Deseja salvar antes de sair?';
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.menuTrocaMateriaAberto) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.troca-materia')) return;
    this.menuTrocaMateriaAberto = false;
  }

  toggleColunaEsquerda(): void {
    this.colunaEsquerdaOculta = !this.colunaEsquerdaOculta;
  }

  toggleMenuTrocaMateria(event?: Event): void {
    event?.stopPropagation();
    this.menuTrocaMateriaAberto = !this.menuTrocaMateriaAberto;
  }

  trocarMateria(materia: Materia, event?: Event): void {
    event?.stopPropagation();
    const proximaMateriaId = Number(materia?.id);
    if (!Number.isFinite(proximaMateriaId) || proximaMateriaId <= 0) return;

    if (proximaMateriaId === this.materiaId) {
      this.menuTrocaMateriaAberto = false;
      return;
    }

    if (this.modo === 'estudar' && this.deveAlertarTempoNaoSalvo()) {
      const desejaSalvar = window.confirm('Voce possui tempo de estudo nao salvo. Deseja salvar antes de trocar de materia?');
      if (desejaSalvar) {
        this.salvarEstudo('troca-materia');
      }
    }

    this.menuTrocaMateriaAberto = false;
    this.router.navigate(['/area-restrita/sala-estudo', proximaMateriaId], {
      queryParams: { modo: this.modo }
    });
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

  // ================================================================
  // EDITOR (QUILL)
  // ================================================================

  onEditorInit(event: unknown) {
    const eventObj = (event as { editor?: unknown }) || {};
    const quill = (eventObj.editor || event) as QuillEditorLike;
    this.quillEditor = quill;

    quill.clipboard?.addMatcher('IMG', () => ({ ops: [] }));

    quill.on?.('selection-change', (range: { index: number; length: number } | null) => {
      if (!range || range.length <= 0) return;
      const texto = quill.getText?.(range.index, range.length) || '';
      if (texto) this.ultimoTrechoSelecionado = texto.trim();
    });

    const atualizarContador = () => {
      const length = Math.max(0, (quill.getLength?.() ?? 0) - 1);
      this.atualizarContadorCaracteres(length);
    };
    atualizarContador();

    quill.on?.('text-change', () => {
      if (this.ajustandoLimiteCaracteres) return;

      const length = Math.max(0, (quill.getLength?.() ?? 0) - 1);
      if (length > this.maxCaracteres) {
        this.ajustandoLimiteCaracteres = true;
        quill.deleteText?.(this.maxCaracteres, length - this.maxCaracteres, 'api');
        this.ajustandoLimiteCaracteres = false;
      }
      this.atualizarContadorCaracteres(Math.min(length, this.maxCaracteres));
    });

    quill.root?.addEventListener('drop', (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const hasImage = Array.from(files).some(f => f.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    quill.root?.addEventListener('paste', (e: ClipboardEvent) => {
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

  private carregarSalaPorMateria$(materiaId: number): Observable<void> {
    this.carregando = true;
    this.resumeTopic = null;
    this.resumeSemConteudoMateria = false;
    return forkJoin({
      materias: this.materiaService.listarMaterias(),
      topicosResp: this.obterTopicosComMeta$(materiaId),
      revisoesResp: this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }),
      finalizados: this.salaEstudoService.listarTopicosFinalizados().pipe(catchError(() => of([]))),
      resumeResp: this.salaEstudoService.obterResumeTopic(materiaId).pipe(catchError(() => of(null)))
    }).pipe(
      tap(({ materias, topicosResp, revisoesResp, finalizados, resumeResp }) => {
        this.materia = (materias || []).find(m => m.id === materiaId);
        if (!this.materia) {
          this.erro = 'Materia nao encontrada para este aluno.';
        }

        this.aplicarTopicosCarregados(topicosResp);
        this.atualizarMapaRevisoes((revisoesResp?.itens || []) as RevisaoTopicoItem[]);
        this.revisoesCarregadas = true;
        this.topicosFinalizados = new Set((finalizados || [])
          .map((item: TopicoFinalizadoDTO) => item?.topicoId)
          .filter((id: number): id is number => Number.isFinite(id)));
        this.topicosFinalizadosCarregados = true;
        this.resumeTopic = resumeResp;
        this.resumeSemConteudoMateria = this.isResumeSemConteudo(this.resumeTopic);
        this.definirTopicoInicialUmaVez(this.resumeTopic);
      }),
      map(() => void 0),
      finalize(() => {
        this.carregando = false;
      })
    );
  }

  private carregarMateriasDisponiveisTroca(): void {
    this.carregandoMateriasTroca = true;
    this.empresaParametroService.getParametroPorChave(this.escopoParametroChave).pipe(
      map((escopo) => (escopo || 'todas').trim() || 'todas'),
      catchError(() => of('todas')),
      switchMap((escopo) => this.salaEstudoService.listarMateriasParaEstudo(escopo)),
      map((lista: MateriaTopicosDTO[]) => {
        const ids = new Set<number>();
        return (lista || [])
          .map((item) => ({ id: Number(item?.materiaId), nome: String(item?.materiaNome || '').trim() }))
          .filter((item) => Number.isFinite(item.id) && item.id > 0 && !!item.nome)
          .filter((item) => {
            if (ids.has(item.id)) return false;
            ids.add(item.id);
            return true;
          });
      }),
      switchMap((materias) => {
        if (materias.length) return of(materias);
        return this.materiaService.listarMaterias().pipe(
          map((lista) => (lista || [])
            .filter((m: Materia) => Number.isFinite(Number(m?.id)) && Number(m?.id) > 0 && !!String(m?.nome || '').trim()))
        );
      }),
      finalize(() => {
        this.carregandoMateriasTroca = false;
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (materias) => {
        this.materiasDisponiveisTroca = materias;
      },
      error: () => {
        this.materiasDisponiveisTroca = [];
      }
    });
  }

  private achatarArvoreTopicos(
    lista: TopicoNodeDTO[],
    nivel: number = 0,
    acumulador: TopicoViewModel[] = []
  ): TopicoViewModel[] {
    for (const dto of lista || []) {
      const temFilhos = !!(dto.subtopicos && Array.isArray(dto.subtopicos) && dto.subtopicos.length);

      const node: TopicoViewModel = {
        id: Number(dto.id),
        descricao: String(dto.descricao || ''),
        ativo: dto.ativo ?? true,
        nivel,
        materiaId: dto.materiaId,
        hasFilhos: temFilhos,
        _raw: dto
      };

      acumulador.push(node);

      if (temFilhos) {
        this.achatarArvoreTopicos((dto.subtopicos || []) as TopicoNodeDTO[], nivel + 1, acumulador);
      }
    }
    return acumulador;
  }

  get topicoPermiteEstudo(): boolean {
    return !!(this.topicoSelecionado && this.topicoSelecionado.ativo !== false);
  }

  get topicoSelecionadoFinalizado(): boolean {
    return this.isTopicoFinalizado(this.topicoSelecionado);
  }

  get topicoSelecionadoFinalizadoPendente(): boolean {
    return this.isTopicoFinalizadoPendente(this.topicoSelecionado);
  }

  get topicoSelecionadoResetPendente(): boolean {
    return this.isTopicoResetPendente(this.topicoSelecionado);
  }

  private carregarTopicos(): void {
    this.registrarSaveLog('topicos-carregar-inicio', {
      topicoSelecionadoId: this.topicoSelecionado?.id ?? null,
      editorTopicoId: this.editorTopicoId
    });

    this.atualizarTopicosComMeta$().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {

        this.registrarSaveLog('topicos-carregar-ok', {
          total: this.topicos?.length ?? 0,
          topicoSelecionadoId: this.topicoSelecionado?.id ?? null,
          editorTopicoId: this.editorTopicoId
        });

      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar topicos:', err);
        this.erro = 'Erro ao carregar topicos da materia.';
      }
    });
  }

  private invalidarTopicosComMetaCache(): void {
    this.topicosComMetaCache = null;
    this.topicosComMetaInFlight$ = null;
    this.topicosComMetaInFlightMateriaId = null;
  }

  private obterTopicosComMeta$(
    materiaId: number,
    opts?: { force?: boolean; expectedOrdemVersion?: string | null }
  ): Observable<ListarTopicosMateriaResponse> {
    if (!Number.isFinite(materiaId) || materiaId <= 0) {
      return of({ topicos: [], ordemVersion: null } as ListarTopicosMateriaResponse);
    }

    const force = !!opts?.force;
    const expectedOrdemVersion = opts?.expectedOrdemVersion ?? null;

    if (
      this.topicosComMetaCache &&
      this.topicosComMetaCache.materiaId === materiaId &&
      expectedOrdemVersion &&
      this.topicosComMetaCache.ordemVersion !== expectedOrdemVersion
    ) {
      this.topicosComMetaCache = null;
    }

    if (
      !force &&
      this.topicosComMetaCache &&
      this.topicosComMetaCache.materiaId === materiaId
    ) {
      return of(this.topicosComMetaCache.response);
    }

    if (
      !force &&
      this.topicosComMetaInFlight$ &&
      this.topicosComMetaInFlightMateriaId === materiaId
    ) {
      return this.topicosComMetaInFlight$;
    }

    const req$ = this.materiaService.listarTopicosComMeta(materiaId).pipe(
      tap((resp: ListarTopicosMateriaResponse) => {
        this.topicosComMetaCache = {
          materiaId,
          ordemVersion: resp?.ordemVersion ?? null,
          response: resp
        };
      }),
      finalize(() => {
        this.topicosComMetaInFlight$ = null;
        this.topicosComMetaInFlightMateriaId = null;
      }),
      shareReplay(1)
    );

    this.topicosComMetaInFlight$ = req$;
    this.topicosComMetaInFlightMateriaId = materiaId;
    return req$;
  }

  private atualizarTopicosComMeta$(
    materiaId: number = this.materiaId,
    opts?: { force?: boolean; expectedOrdemVersion?: string | null }
  ): Observable<ListarTopicosMateriaResponse> {
    return this.obterTopicosComMeta$(materiaId, opts).pipe(
      tap((resp: ListarTopicosMateriaResponse) => this.aplicarTopicosCarregados(resp))
    );
  }

  private aplicarTopicosCarregados(resp: ListarTopicosMateriaResponse): void {
    const listaSegura = resp?.topicos || [];
    this.ordemVersionAtual = resp?.ordemVersion ?? null;
    if (Number.isFinite(this.materiaId) && this.materiaId > 0) {
      this.topicosComMetaCache = {
        materiaId: this.materiaId,
        ordemVersion: this.ordemVersionAtual,
        response: resp
      };
    }

    this.arvoreTopicos = listaSegura as TopicoNodeDTO[];
    this.topicos = this.achatarArvoreTopicos(listaSegura as TopicoNodeDTO[], 0, []);
    this.invalidarTopicosExibidosCache();
    this.topicosCarregados = true;
    this.inicializarObservadorListaTopicos();
  }

  private getTopicoIdFromQuery(queryParams?: ParamMap): number | null {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = params.get('topicoId');
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private getOrigemFromQuery(queryParams?: ParamMap): string | null {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = String(params.get('origem') || '').trim().toLowerCase();
    return raw || null;
  }

  private isOrigemRevisaoDirecionada(origem: string | null): boolean {
    return origem === 'execucao_plano' || origem === 'preventivo' || origem === 'foco';
  }

  private getAutoTopicoFromQuery(queryParams?: ParamMap): boolean {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = (params.get('proximo') || '').toLowerCase();
    const alt = (params.get('autoTopico') || '').toLowerCase();
    const alt2 = (params.get('proximoTopico') || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'sim'
      || alt === '1' || alt === 'true' || alt === 'sim'
      || alt2 === '1' || alt2 === 'true' || alt2 === 'sim';
  }

  private getModoFromQuery(queryParams?: ParamMap, fallback: 'estudar' | 'revisar' = 'estudar'): 'estudar' | 'revisar' {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const rawModo = (params.get('modo') || '').toLowerCase();
    const rawRevisar = (params.get('revisar') || '').toLowerCase();
    const rawRevisao = (params.get('revisao') || '').toLowerCase();

    if (rawModo === 'revisar' || rawModo === 'revisao') return 'revisar';
    if (rawRevisar === '1' || rawRevisar === 'true' || rawRevisar === 'sim') return 'revisar';
    if (rawRevisao === '1' || rawRevisao === 'true' || rawRevisao === 'sim') return 'revisar';
    return fallback;
  }

  private getFiltroSemaforoFromQuery(queryParams?: ParamMap): StatusRevisao | null {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = (params.get('filtro') || '').trim().toLowerCase();
    if (!raw) return null;

    if (raw === 'atrasadas' || raw === 'atrasada' || raw === 'vencidas' || raw === 'vencida') {
      return 'ATRASADA';
    }
    if (raw === 'hoje') {
      return 'HOJE';
    }
    if (raw === 'emdia' || raw === 'em_dia' || raw === 'futura' || raw === 'futuras') {
      return 'FUTURA';
    }
    if (raw === 'sem' || raw === 'ainiciar' || raw === 'a_iniciar') {
      return 'SEM';
    }
    return null;
  }

  private getTopicosEscopoSemanaFromQuery(queryParams?: ParamMap): Set<number> {
    const params = queryParams ?? this.route.snapshot.queryParamMap;
    const raw = (params.get('topicos') || '').trim();
    if (!raw) return new Set<number>();

    // O fluxo de "Revisar agora" (FOCO) envia o escopo em `topicos` sem `filtro=pressao-semana`.
    // Se `topicos` existir, ele deve ser respeitado como escopo ativo da sala.
    const ids = raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
    return new Set<number>(ids);
  }

  private getEscopoTopicosAtivo(): Set<number> {
    if (this.modoExecucaoFila) {
      const fila = this.executionQueueService.getSnapshot();
      if (Array.isArray(fila) && fila.length > 0) {
        const ids = fila
          .map((item) => Number(item?.topicoId || 0))
          .filter((id) => Number.isFinite(id) && id > 0);
        return new Set<number>(ids);
      }
    }
    return this.topicosEscopoSemanaIds;
  }

  private saoMesmosIdsEscopo(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const id of a) {
      if (!b.has(id)) return false;
    }
    return true;
  }

  private iniciarExecucaoFilaDoDia(): void {
    this.hidratarFilaExecucaoDaNavegacao();
    const fila = this.executionQueueService.getSnapshot();

    if (!fila.length) {
      this.erro = 'Fila de execucao vazia.';
      this.router.navigate(['/area-restrita/foco']);
      return;
    }

    const primeiro = fila[0];
    const materiaId = Number(primeiro?.materiaId || 0);
    const topicoId = Number(primeiro?.topicoId || 0);
    if (materiaId <= 0 || topicoId <= 0) {
      this.erro = 'Fila de execucao invalida.';
      this.router.navigate(['/area-restrita/foco']);
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
      queryParams: {
        modo: 'revisar',
        topicoId,
        filaExecucao: '1'
      },
      state: { executionQueue: fila }
    });
  }

  private hidratarFilaExecucaoDaNavegacao(): void {
    if (this.executionQueueService.getSnapshot().length > 0) {
      return;
    }

    const stateFila = (history?.state?.executionQueue || null) as ExecutionQueueItem[] | null;
    if (Array.isArray(stateFila) && stateFila.length) {
      this.executionQueueService.setFila(stateFila);
      return;
    }

    const topicosRaw = String(this.route.snapshot.queryParamMap.get('topicos') || '').trim();
    if (!topicosRaw) return;
    const ids = topicosRaw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) return;

    // Fallback quando veio somente query string: mantemos fila por topico
    // e tentamos executar na materia atual quando disponivel.
    const materiaContexto = Number(this.materiaId || 0);
    const fallbackFila = ids.map((topicoId) => ({
      topicoId,
      materiaId: materiaContexto > 0 ? materiaContexto : null
    }));
    this.executionQueueService.setFila(fallbackFila);
  }

  private avancarFilaExecucaoAposConclusao(topicoIdConcluido: number): void {
    if (!this.modoExecucaoFila) return;

    const proximo = this.executionQueueService.completeAndGetNext(topicoIdConcluido);
    // Forca recalculo da lista com o escopo pendente atualizado da fila.
    this.revisoesViewVersion += 1;
    this.invalidarTopicosExibidosCache();

    if (!proximo) {
      this.modoExecucaoFila = false;
      this.messageService.add({
        severity: 'success',
        summary: 'Fila concluida',
        detail: 'Revisao do dia finalizada.'
      });
      this.router.navigate(['/area-restrita/foco']);
      return;
    }

    const proximoTopicoId = Number(proximo.topicoId || 0);
    const proximaMateriaId = Number(proximo.materiaId || 0);
    if (proximaMateriaId <= 0 || proximoTopicoId <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Fila incompleta',
        detail: 'Nao foi possivel abrir o proximo item da fila.'
      });
      this.router.navigate(['/area-restrita/revisoes']);
      return;
    }

    if (proximaMateriaId === Number(this.materiaId || 0)) {
      this.atualizarQueryTopico(proximoTopicoId);
      this.selecionarTopicoPorId(proximoTopicoId);
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo', proximaMateriaId], {
      queryParams: {
        modo: 'revisar',
        topicoId: proximoTopicoId,
        filaExecucao: '1'
      },
      state: { executionQueue: this.executionQueueService.getSnapshot() }
    });
  }

  ativarRevisaoAnotacoes(): void {
    this.modoRevisao = 'anotacoes';

    if (this.topicoSelecionado && this.topicoPermiteEstudo) {
      this.salaEstudoService.buscarAnotacoes(this.topicoSelecionado.id).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
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
    if (!this.podeAbrirRevisaoFlashcards) return;
    this.modoRevisao = 'flashcards';
    this.revisaoAutoExplicacaoAtiva = false;
    if (this.topicoSelecionado && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }
  }

  fecharRevisaoFlashcards(event?: Event, exibirAutoExplicacao = false): void {
    event?.stopPropagation();
    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.mensagemFlashcardRevisao = '';
    this.flashcardFeedback = null;
    this.ativarRevisaoAnotacoes();
    if (exibirAutoExplicacao && this.modo === 'revisar' && this.timerAtivo) {
      this.revisaoAutoExplicacaoAtiva = true;
    }
  }

  abrirManutencaoFlashcard(event?: Event): void {
    event?.stopPropagation();
    const atual = this.flashcardAtual;
    const flashcardId = Number(atual?.id || 0);
    if (flashcardId <= 0) return;

    this.flashcardModalEdicaoId = flashcardId;
    this.flashcardFrente = String(atual?.frente || '');
    this.flashcardVerso = String(atual?.verso || '');
    this.flashcardTipo = String(atual?.tipo || 'PERGUNTA_RESPOSTA');
    this.flashcardDificuldade = String(atual?.dificuldade || 'MEDIA');
    this.flashcardTags = String(atual?.tags || '');
    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      const verso = this.flashcardVerso.toUpperCase();
      this.flashcardVerdadeiroFalso = verso.startsWith('F') ? 'FALSO' : 'VERDADEIRO';
    } else {
      this.flashcardVerdadeiroFalso = null;
    }
    this.mensagemFlashcardSucesso = undefined;
    this.mostrarModalFlashcard = true;
    setTimeout(() => this.centralizarModalFlashcard());
  }

  // ================================================================
  // INTERACAO COM TOPICOS
  // ================================================================

  private calcularTempoEstudoAtual(): number {
    if (this.modoTemporizador === 'livre') {
      return this.tempoTotalSegundos;
    }
    return this.duracaoFaseAtual - this.pomodoroSegundosRestantes;
  }

  private calcularTempoNaoSalvoAtual(): number {
    const tempoAtualTotal = this.calcularTempoEstudoAtual();
    return Math.max(0, tempoAtualTotal - this.segundosEstudoJaSalvosTopicoAtual);
  }

  private deveAlertarTempoNaoSalvo(): boolean {
    const limiteSegundosConfirmacao = 30;
    return this.temTempoNaoSalvo() && this.calcularTempoNaoSalvoAtual() >= limiteSegundosConfirmacao;
  }

  private temTempoNaoSalvo(): boolean {
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) return false;
    return this.temTempoNaoSalvoFlag;
  }

  private resetarTimerAoTrocarTopico(): void {
    if (this.timerAtivo) {
      this.pararTimerInterno();
      this.timerAtivo = false;
    }

    this.pararTimerInterno();
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

  selecionarTopico(t: TopicoViewModel): void {
    if (this.carregandoAnotacoes) {
      this.mostrarMensagemRevisao('Aguarde o carregamento das anotações.');
      return;
    }
    this.mensagemRevisao = undefined;
    this.avaliacaoSelecionada = null;

    const trocandoDeTopico = this.topicoSelecionado && this.topicoSelecionado.id !== t.id;

    if (trocandoDeTopico && this.modo === 'estudar') {
      const temAlgoParaSalvar = this.deveAlertarTempoNaoSalvo();

      if (temAlgoParaSalvar) {
        const desejaSalvar = window.confirm('Você já possui tempo de estudo neste tópico. Deseja salvar antes de mudar para outro tópico?');
        if (desejaSalvar) {
          this.salvarEstudo();
          this.temTempoNaoSalvoFlag = false;
        }
      }

      this.resetarTimerAoTrocarTopico();
    }

    this.topicoSelecionado = t;
    this.registrarUltimoTopicoParaDebug(t);

    if (t?.id) {
      this.atualizarQueryTopico(t.id);
    }

    this.editorTopicoId = t?.id ?? null;
    this.centralizarTopicoSelecionado();

    if (this.modo === 'revisar') {
      this.iniciarContagemRevisaoItem();
    }

    if (this.topicoPermiteEstudo) {
      this.carregarFlashcards();
    } else {
      this.flashcards = [];
      this.flashcardIndexAtual = 0;
      this.mostrarVersoAtual = false;
    }

    this.vocabularios = [];
    this.vocabularioIndexAtual = 0;
    this.vocabularioMostrarDefinicao = false;

    if (!this.topicoPermiteEstudo) {
      this.anotacoes = '';
      this.carregandoAnotacoes = false;
      return;
    }

    // Limpa a view imediatamente para evitar exibir anotacoes do topico anterior.
    this.anotacoes = '';
    this.anotacoesHtmlSeguras = null;
    this.atualizarContadorCaracteres(0);

    const reqSeq = ++this.anotacoesReqSeq;
    this.ultimaAnotacoesReqInfo = { seq: reqSeq, topicoId: t.id ?? null };
    this.carregandoAnotacoes = true;
    this.registrarSaveLog('anotacoes-requisicao', {
      reqSeq,
      reqTopicoId: t.id,
      selecionadoId: this.topicoSelecionado?.id ?? null,
      editorTopicoIdAntes: this.editorTopicoId
    });

    this.salaEstudoService.buscarAnotacoes(t.id).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (resp) => {
        if (reqSeq !== this.anotacoesReqSeq || (this.topicoSelecionado?.id ?? null) !== t.id) {
          console.warn('[SALA-ESTUDO][ANOTACOES] resposta-ignorada', {
            reqSeq,
            reqTopicoId: t.id,
            selecionadoId: this.topicoSelecionado?.id ?? null,
            editorTopicoIdAntes: this.editorTopicoId
          });
          this.registrarSaveLog('anotacoes-resposta-ignorada', {
            reqSeq,
            reqTopicoId: t.id,
            selecionadoId: this.topicoSelecionado?.id ?? null,
            editorTopicoIdAntes: this.editorTopicoId
          });
          if (reqSeq === this.anotacoesReqSeq) {
            this.carregandoAnotacoes = false;
          }
          return;
        }
        this.editorTopicoId = t.id ?? null;

        this.anotacoes = resp.anotacoes || '';
        this.atualizarMarcaAnotacoes(t.id, this.hasConteudoAnotacoes(this.anotacoes));
        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
        this.atualizarContadorCaracteresFromHtml(this.anotacoes);
        this.centralizarTopicoSelecionado();
        if (reqSeq === this.anotacoesReqSeq) {
          this.carregandoAnotacoes = false;
        }
      },
      error: () => {
        this.anotacoes = '';
        this.atualizarMarcaAnotacoes(t.id, false);
        this.anotacoesHtmlSeguras = null;
        this.atualizarContadorCaracteres(0);
        this.centralizarTopicoSelecionado();
        if (reqSeq === this.anotacoesReqSeq) {
          this.carregandoAnotacoes = false;
        }
      }
    });

    if (this.modo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
      this.carregarVocabulariosParaRevisao();
    }

    if (this.mostrarModalVocabulario && this.topicoPermiteEstudo) {
      this.carregarVocabularios();
    }
  }

  private recarregarAnotacoesSeNecessario(motivo: string): void {
    if (this.carregandoAnotacoes) return;
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) return;

    const topicoId = this.topicoSelecionado.id;
    const reqSeq = ++this.anotacoesReqSeq;
    this.ultimaAnotacoesReqInfo = { seq: reqSeq, topicoId };
    this.carregandoAnotacoes = true;
    if (motivo === 'mismatch') {
      this.mostrarMensagemRevisao('Recarregando as anotações do tópico atual...');
    }

    this.registrarSaveLog('anotacoes-recarregar', { motivo, reqSeq, topicoId });

    this.salaEstudoService.buscarAnotacoes(topicoId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (resp) => {
        if (reqSeq !== this.anotacoesReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoId) {
          console.warn('[SALA-ESTUDO][ANOTACOES] recarregar-ignorado', { motivo, reqSeq, topicoId });
          this.registrarSaveLog('anotacoes-recarregar-ignorado', { motivo, reqSeq, topicoId });
          if (reqSeq === this.anotacoesReqSeq) this.carregandoAnotacoes = false;
          return;
        }

        this.editorTopicoId = topicoId;
        this.anotacoes = resp.anotacoes || '';
        this.atualizarMarcaAnotacoes(topicoId, this.hasConteudoAnotacoes(this.anotacoes));
        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
        this.atualizarContadorCaracteresFromHtml(this.anotacoes);
        if (reqSeq === this.anotacoesReqSeq) this.carregandoAnotacoes = false;
      },
      error: () => {
        if (reqSeq === this.anotacoesReqSeq) this.carregandoAnotacoes = false;
      }
    });
  }

  private centralizarTopicoSelecionado(): void {
    return;
  }

  private obterOffsetTopDentroDoContainer(el: HTMLElement, container: HTMLElement): number {
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return (elRect.top - containerRect.top) + container.scrollTop;
  }

  private limparCentralizacaoProgramada(): void {
    if (!this.centralizacaoProgramadaRefs.length) return;
    for (const ref of this.centralizacaoProgramadaRefs) {
      clearTimeout(ref);
    }
    this.centralizacaoProgramadaRefs = [];
  }

  private inicializarObservadorListaTopicos(tentativa: number = 0): void {
    return;
  }

  private destruirObservadorListaTopicos(): void {
    if (!this.listaTopicosObserver) return;
    this.listaTopicosObserver.disconnect();
    this.listaTopicosObserver = undefined;
  }

  private agendarRecentralizacaoPorObserver(): void {
    return;
  }

  private carregarFlashcards(): void {
    if (!this.topicoSelecionado) {
      this.flashcards = [];
      return;
    }

    const topicoIdReq = Number(this.topicoSelecionado.id) || null;
    if (!topicoIdReq) {
      this.flashcards = [];
      return;
    }

    const reqSeq = ++this.flashcardsReqSeq;
    this.flashcardService.listarFlashcardsPorTopico(topicoIdReq).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (lista) => {
        if (reqSeq !== this.flashcardsReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        this.flashcards = lista || [];
        this.flashcardIndexAtual = 0;
        this.mostrarVersoAtual = false;
        this.avaliacaoFlashcardSelecionada = null;
        this.resetFlashcardFeedback();
      },
      error: (err) => {
        if (reqSeq !== this.flashcardsReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        console.error('[SALA-ESTUDO] Erro ao carregar flashcards:', err);
        this.flashcards = [];
      }
    });
  }

  private registrarUltimoTopicoParaDebug(t: TopicoViewModel): void {
    // Nao e usado para decisao de topico inicial no bootstrap.
    if (!t?.id || !this.materiaId) return;
    this.registrarSaveLog('debug-ultimo-topico', {
      materiaId: this.materiaId,
      topicoId: t.id
    });
  }

  private obterProximoTopicoApos(folhas: TopicoViewModel[], topicoId: number): TopicoViewModel | null {
    const index = folhas.findIndex(t => t.id === topicoId);
    if (index < 0) return null;

    for (let i = index + 1; i < folhas.length; i += 1) {
      if (!folhas[i]?.hasFilhos && folhas[i]?.ativo !== false) {
        return folhas[i];
      }
    }
    return null;
  }

  isTopicoFinalizado(t: TopicoViewModel | null | undefined): boolean {
    const id = t?.id;
    if (!id) return false;
    return this.topicosFinalizados.has(id);
  }

  isTopicoFinalizadoLinha(t: TopicoViewModel | null | undefined): boolean {
    return this.isTopicoFinalizado(t);
  }

  isTopicoFinalizadoPendente(t: TopicoViewModel | null | undefined): boolean {
    const id = t?.id;
    if (!id) return false;
    return this.topicosFinalizadosPendentes.has(id);
  }

  isTopicoResetPendente(t: TopicoViewModel | null | undefined): boolean {
    const id = t?.id;
    if (!id) return false;
    return this.topicosResetPendentes.has(id);
  }

  private carregarTopicosFinalizados(): void {
    this.carregarTopicosFinalizados$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private carregarTopicosFinalizados$(): Observable<void> {
    return this.salaEstudoService.listarTopicosFinalizados().pipe(
      tap((lista: TopicoFinalizadoDTO[]) => {
        this.topicosFinalizados = new Set((lista || [])
          .map((item) => item?.topicoId)
          .filter((id): id is number => Number.isFinite(id)));

        this.topicosFinalizadosCarregados = true;
      }),
      map(() => void 0),
      catchError(() => {
        this.topicosFinalizados = new Set();
        this.topicosFinalizadosCarregados = true;
        return of(void 0);
      })
    );
  }

  // ================================================================
  // CONTROLE DO TIMER / POMODORO
  // ================================================================

  get duracaoFaseAtual(): number {
    switch (this.pomodoroFase) {
      case 'foco': return this.pomodoroDuracaoFoco;
      case 'pausa-curta': return this.pomodoroDuracaoPausaCurta;
      case 'pausa-longa': return this.pomodoroDuracaoPausaLonga;
      default: return this.pomodoroDuracaoFoco;
    }
  }

  get labelFasePomodoro(): string {
    if (this.pomodoroFase === 'foco') return 'Foco';
    if (this.pomodoroFase === 'pausa-curta') return 'Pausa curta';
    return 'Pausa longa';
  }

  get tempoFormatado(): string {
    let totalSegundos = 0;
    if (this.modoTemporizador === 'livre') totalSegundos = this.tempoTotalSegundos;
    else totalSegundos = this.pomodoroSegundosRestantes;

    const h = Math.floor(totalSegundos / 3600);
    const m = Math.floor((totalSegundos % 3600) / 60);
    const s = totalSegundos % 60;

    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private pad(v: number): string {
    return v.toString().padStart(2, '0');
  }

  setModoTemporizador(modo: 'livre' | 'pomodoro'): void {
    if (this.modoTemporizador === modo) return;

    if (this.deveAlertarTempoNaoSalvo()) {
      const desejaSalvar = window.confirm('Ao mudar o tipo de estudo o tempo atual sera zerado. Deseja salvar o tempo ja estudado?');
      if (desejaSalvar) this.salvarEstudo();
    }

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;
    this.temTempoNaoSalvoFlag = false;

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
      this.revisaoAutoExplicacaoAtiva = this.modoRevisao === 'anotacoes';
    }

    if (this.modoTemporizador === 'livre') this.iniciarTimerLivre();
    else this.iniciarPomodoro();
  }

  zerarTimer(): void {
    if (this.modoTemporizador === 'livre') {
      if (!this.tempoTotalSegundos) return;
    } else {
      if (this.pomodoroSegundosRestantes === this.duracaoFaseAtual) return;
    }

    const confirmou = window.confirm(
      'Se voce zerar o cronometro agora, o tempo estudado ate este momento NAO sera contabilizado para este topico/materia. Deseja realmente zerar?'
    );

    if (!confirmou) return;

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

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
      this.timerRef = undefined;
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
        .then(() => { this.alarmeAtivo = true; })
        .catch(err => { console.warn('[POMODORO] Não foi possível tocar o som de alarme:', err); });

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
    if (this.modo === novoModo) return;

    if (this.topicoPermiteEstudo && this.temTempoNaoSalvo()) {
      this.salvarEstudo();
    }

    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }

    this.resetarTimerParaNovoModo();
    this.preferirFlashcardsAoEntrarRevisao = novoModo === 'revisar';
    this.modo = novoModo;
    this.mensagemRevisao = undefined;

    this.revisaoAutoExplicacaoAtiva = novoModo === 'revisar' && this.timerAtivo;
    this.ajustarColunaEsquerdaParaModo();

    if (novoModo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
      this.carregarVocabulariosParaRevisao();
    }
    if (novoModo === 'estudar' && this.topicoSelecionado && this.topicoPermiteEstudo) {
      this.mostrarMensagemRevisao('Recarregando anotações para o modo Estudar...');
      this.recarregarAnotacoesSeNecessario('modo-estudar');
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
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  }

  // ================================================================
  // SALVAR ESTUDO
  // ================================================================

  salvarEstudo(motivo: string = 'auto'): void {
    this.salvarEstudoTrigger$.next(motivo);
  }

  private salvarEstudoComResultado(motivo: string = 'auto'): Observable<boolean> {
    if (!this.topicoSelecionado) {
      this.erro = 'Selecione um topico antes de salvar o estudo.';
      return of(false);
    }
    if (this.salvandoEstudo) return of(false);

    const topicoAtualId = this.topicoSelecionado?.id ?? null;
    if (!topicoAtualId || (this.editorTopicoId && this.editorTopicoId !== topicoAtualId)) {
      console.warn('[SALA-ESTUDO][EDITOR] bloqueado-topico-mismatch', {
        motivo,
        topicoAtualId,
        editorTopicoId: this.editorTopicoId,
        ultimoReqSeq: this.ultimaAnotacoesReqInfo?.seq ?? null,
        ultimoReqTopicoId: this.ultimaAnotacoesReqInfo?.topicoId ?? null
      });
      this.registrarSaveLog('bloqueado-topico-mismatch', { motivo, topicoAtualId, editorTopicoId: this.editorTopicoId });
      this.recarregarAnotacoesSeNecessario('mismatch');
      try { alert('Detectamos um conflito entre editor e topico selecionado. O salvamento foi bloqueado para evitar gravacao no topico errado.'); } catch {}
      return of(false);
    }

    if (this.modo === 'estudar') {
      const quillHtml = this.quillEditor?.root?.innerHTML;
      if (typeof quillHtml === 'string') {
        this.anotacoes = this.normalizarHtmlAnotacoes(quillHtml);
      }
    }

    const modoBack = this.modoTemporizador;

    const tempoAtualTotal = this.calcularTempoEstudoAtual();
    let tempoParaSalvar = tempoAtualTotal - this.segundosEstudoJaSalvosTopicoAtual;
    if (tempoParaSalvar < 0) tempoParaSalvar = 0;

    const tipoSessao: EstudoTopicoRequest['tipoSessao'] = this.modo === 'revisar' ? 'REVISAO' : 'ESTUDO';
    const anotacoesHash = this.hashTexto(this.anotacoes || '');
    const ultimoHash = this.ultimoSaveHashPorTopico.get(this.topicoSelecionado.id);

    // Garante persistencia de "estudo realizado" no backend quando houve mudanca real
    // de conteudo, mesmo que o delta de tempo arredonde para 0s.
    if (tipoSessao === 'ESTUDO' && tempoParaSalvar <= 0 && ultimoHash !== anotacoesHash) {
      tempoParaSalvar = 1;
    }

    const payload: EstudoTopicoRequest = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      modoTemporizador: modoBack,
      tipoSessao,
      tempoLivreSegundos: tempoParaSalvar,
      anotacoes: this.anotacoes,
      pomodoroFase: this.modoTemporizador === 'pomodoro' ? this.pomodoroFase : undefined,
      pomodoroCiclosConcluidos: this.modoTemporizador === 'pomodoro' ? this.pomodoroCiclosConcluidos : undefined
    };

    const saveKey = `${payload.topicoId}|${payload.tipoSessao}|${payload.modoTemporizador}|${tempoParaSalvar}|${anotacoesHash}`;
    const ultimoKey = this.ultimoSaveKeyPorTopico.get(payload.topicoId);
    const ultimoMs = this.ultimoSaveMsPorTopico.get(payload.topicoId) || 0;
    const agora = Date.now();

    if (tempoParaSalvar <= 0 && ultimoHash === anotacoesHash) {
      this.registrarSaveLog('ignorado-sem-alteracao', { motivo, topicoId: payload.topicoId, tempoParaSalvar });
      return of(true);
    }

    if (ultimoKey === saveKey && (agora - ultimoMs) < 1500) {
      this.registrarSaveLog('ignorado-duplicado', { motivo, topicoId: payload.topicoId, tempoParaSalvar, intervaloMs: agora - ultimoMs });
      return of(true);
    }

    this.registrarSaveLog('enviado', { motivo, topicoId: payload.topicoId, tempoParaSalvar, modo: this.modo, modoTemporizador: this.modoTemporizador });

    this.salvandoEstudo = true;

    return this.salaEstudoService.salvarEstudo(payload).pipe(
      switchMap((resp) => {
        const topicoAindaSelecionado = (this.topicoSelecionado?.id ?? null) === payload.topicoId;
        this.registrarSaveLog('ok', { motivo, topicoId: payload.topicoId, retornoTopicoId: resp?.topicoId ?? null });

        if (topicoAindaSelecionado) {
          this.segundosEstudoJaSalvosTopicoAtual += tempoParaSalvar;
          this.temTempoNaoSalvoFlag = false;

          if (this.modo === 'estudar') {
            this.atualizarMarcaAnotacoes(payload.topicoId, this.hasConteudoAnotacoes(this.anotacoes));
          }
        } else {
          this.registrarSaveLog('ok-topico-diferente', {
            motivo,
            topicoSalvoId: payload.topicoId,
            topicoSelecionadoId: this.topicoSelecionado?.id ?? null
          });
        }

        this.mensagemEstudoSalvo = tipoSessao === 'REVISAO' ? 'Revisao salva com sucesso.' : 'Estudo salvo com sucesso.';
        setTimeout(() => (this.mensagemEstudoSalvo = undefined), 4000);

        if (topicoAindaSelecionado && this.modo === 'estudar' && tempoParaSalvar > 0) {
          this.tentarAvancarCicloSilencioso();
        }

        return this.recarregarTelaAposSalvar$(payload.topicoId).pipe(map(() => true));
      }),
      catchError((err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar estudo:', err);
        this.erro = 'Erro ao salvar o estudo. Tente novamente.';
        this.registrarSaveLog('erro', { motivo, topicoId: payload.topicoId, status: err?.status ?? null });
        return of(false);
      }),
      finalize(() => {
        this.ultimoSaveKeyPorTopico.set(payload.topicoId, saveKey);
        this.ultimoSaveMsPorTopico.set(payload.topicoId, Date.now());
        this.ultimoSaveHashPorTopico.set(payload.topicoId, anotacoesHash);
        this.salvandoEstudo = false;
      })
    );
  }
  private hashTexto(valor: string): number {
    let hash = 5381;
    for (let i = 0; i < valor.length; i += 1) {
      hash = ((hash << 5) + hash) + valor.charCodeAt(i);
      hash |= 0;
    }
    return hash >>> 0;
  }

  private recarregarTelaAposSalvar$(topicoSalvoId?: number): Observable<void> {
    const topicoIdNoInicioReq = this.topicoSelecionado?.id ?? null;
    if (!this.materiaId) return of(void 0);

    const reqs = {
      topicosResp: this.obterTopicosComMeta$(this.materiaId, { force: true }),
      revisoesResp: this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }),
      finalizados: this.salaEstudoService.listarTopicosFinalizados(),
      anotacoes: topicoIdNoInicioReq ? this.salaEstudoService.buscarAnotacoes(topicoIdNoInicioReq) : of(null)
    };

    return forkJoin(reqs).pipe(
      tap(({ topicosResp, revisoesResp, finalizados, anotacoes }) => {
        this.aplicarTopicosCarregados(topicosResp);
        this.overrideStatusRevisaoPorTopico.clear();
        this.revisoesPorTopico.clear();
        this.revisoesViewVersion += 1;
        this.invalidarTopicosExibidosCache();
        const selecionadoId = this.topicoSelecionado?.id;
        this.atualizarMapaRevisoes((revisoesResp?.itens || []) as RevisaoTopicoItem[]);

        // Reprocessa filtros/lista com os status efetivamente carregados
        this.revisoesViewVersion += 1;
        this.invalidarTopicosExibidosCache();

        this.revisoesCarregadas = true;

        const concluido = new Set((finalizados || [])
          .map((item: TopicoFinalizadoDTO) => item?.topicoId)
          .filter((id: number): id is number => Number.isFinite(id)));

        this.topicosFinalizadosPendentes.forEach((finalizado, id) => {
          if (finalizado) concluido.add(id);
          else concluido.delete(id);
        });

        this.topicosFinalizados = concluido;
        this.topicosFinalizadosCarregados = true;

        const topicoAtualId = this.topicoSelecionado?.id ?? null;
        if (
          topicoIdNoInicioReq &&
          anotacoes &&
          (anotacoes as AnotacoesPayload)?.anotacoes !== undefined &&
          topicoAtualId === topicoIdNoInicioReq
        ) {
          // No modo estudar, manter o estado atual do Quill evita inserir quebras
          // de linha/alterar cursor ao salvar manualmente.
          if (this.modo === 'revisar') {
            const resp = anotacoes as AnotacoesPayload;
            this.anotacoes = resp.anotacoes || '';
            this.atualizarMarcaAnotacoes(topicoIdNoInicioReq, this.hasConteudoAnotacoes(this.anotacoes));
            this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
            this.atualizarContadorCaracteresFromHtml(this.anotacoes);
          }
        } else if (topicoIdNoInicioReq && topicoAtualId !== topicoIdNoInicioReq) {
          this.registrarSaveLog('refresh-anotacoes-ignorado-topico-trocado', {
            topicoSalvoId: topicoSalvoId ?? null,
            topicoReqId: topicoIdNoInicioReq,
            topicoAtualId
          });
        }
      }),
      map(() => void 0),
      catchError(() => of(void 0))
    );
  }

  private isSaveLogEnabled(): boolean {
    if (this.saveLogRuntimeEnabled != null) {
      return this.saveLogRuntimeEnabled;
    }
    if (typeof window === 'undefined') {
      this.saveLogRuntimeEnabled = false;
      return false;
    }
    try {
      const debugRaw = localStorage.getItem(this.saveLogDebugKey);
      const debugLigado = debugRaw === '1' || debugRaw === 'true';
      this.saveLogRuntimeEnabled = this.saveLogFeatureEnabled || debugLigado;
    } catch {
      this.saveLogRuntimeEnabled = this.saveLogFeatureEnabled;
    }
    return this.saveLogRuntimeEnabled;
  }

  private carregarSaveLogPersistido(): void {
    if (this.saveLogCarregado || typeof window === 'undefined') return;
    this.saveLogCarregado = true;
    try {
      const raw = localStorage.getItem(this.saveLogKey);
      const lista = raw ? JSON.parse(raw) : [];
      this.saveLogPersistido = Array.isArray(lista) ? (lista as Array<Record<string, unknown>>) : [];
    } catch {
      this.saveLogPersistido = [];
    }
  }

  private agendarFlushSaveLog(): void {
    if (this.saveLogFlushTimer != null) return;
    this.saveLogFlushTimer = setTimeout(() => {
      this.saveLogFlushTimer = null;
      this.flushSaveLogBuffer();
    }, this.saveLogFlushMs);
  }

  private flushSaveLogBuffer(force = false): void {
    if (!this.isSaveLogEnabled() || typeof window === 'undefined') return;
    if (!force && this.saveLogBuffer.length === 0) return;

    if (this.saveLogFlushTimer != null) {
      clearTimeout(this.saveLogFlushTimer);
      this.saveLogFlushTimer = null;
    }

    this.carregarSaveLogPersistido();

    if (this.saveLogBuffer.length > 0) {
      this.saveLogPersistido.push(...this.saveLogBuffer);
      this.saveLogBuffer = [];
    }

    this.saveLogPersistido = this.saveLogPersistido.slice(-this.saveLogMaxEntries);
    try {
      localStorage.setItem(this.saveLogKey, JSON.stringify(this.saveLogPersistido));
    } catch {
      // ignora falha de persistencia
    }
  }

  private registrarSaveLog(tipo: string, dados: Record<string, unknown>): void {
    if (!this.isSaveLogEnabled() || typeof window === 'undefined') return;

    this.carregarSaveLogPersistido();

    const entrada = {
      ts: new Date().toISOString(),
      tipo,
      materiaId: this.materiaId ?? null,
      topicoSelecionadoId: this.topicoSelecionado?.id ?? null,
      editorTopicoId: this.editorTopicoId,
      ...dados
    };

    this.saveLogBuffer.push(entrada);
    if (this.saveLogBuffer.length >= this.saveLogFlushBatchSize) {
      this.flushSaveLogBuffer();
      return;
    }
    this.agendarFlushSaveLog();
  }

  private tentarAvancarCicloSilencioso(): void {
    this.blocosService.avancarCiclo().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => this.blocosService.notificarBlocosAlterados(),
      error: () => {}
    });
  }

  // ================================================================
  // FLASHCARD - MODAL (CRIAR)
  // ================================================================

  abrirModalFlashcard(): void {
    if (!this.topicoPermiteEstudo) return;

    this.flashcardModalEdicaoId = null;
    this.mensagemFlashcardSucesso = undefined;
    this.mostrarModalFlashcard = true;
    this.onFlashcardTipoChange(this.flashcardTipo);

    setTimeout(() => this.centralizarModalFlashcard());
    this.preencherFlashcardFrenteComSelecao();

    if (!this.flashcardTags && this.materia && this.topicoSelecionado) {
      this.flashcardTags = this.montarTagMateriaTopico(this.materia.nome, this.topicoSelecionado.descricao);
    }
  }

  get flashcardModalInitialData(): Partial<FlashcardDTO> {
    return {
      id: this.flashcardModalEdicaoId || undefined,
      materiaId: Number(this.materiaId || 0) || 0,
      topicoId: Number(this.topicoSelecionado?.id || 0) || 0,
      frente: this.flashcardFrente || '',
      verso: this.flashcardVerso || '',
      tipo: (this.flashcardTipo as FlashcardDTO['tipo']) || 'PERGUNTA_RESPOSTA',
      dificuldade: (this.flashcardDificuldade as FlashcardDTO['dificuldade']) || 'MEDIA',
      tags: this.flashcardTags || ''
    };
  }

  onSalvarFlashcardViaModal(payload: FlashcardDTO): void {
    const idEdicao = Number(payload?.id || this.flashcardModalEdicaoId || 0);
    this.flashcardFrente = String(payload?.frente || '');
    this.flashcardVerso = String(payload?.verso || '');
    this.flashcardTipo = String(payload?.tipo || 'PERGUNTA_RESPOSTA');
    this.flashcardDificuldade = String(payload?.dificuldade || 'MEDIA');
    this.flashcardTags = String(payload?.tags || '');
    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      const verso = this.flashcardVerso.toUpperCase();
      this.flashcardVerdadeiroFalso = verso.startsWith('F') ? 'FALSO' : 'VERDADEIRO';
    } else {
      this.flashcardVerdadeiroFalso = null;
    }
    if (idEdicao > 0) {
      this.salvandoFlashcard = true;
      this.flashcardService.atualizarFlashcard(idEdicao, payload).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: (resp) => {
          const atualizado: FlashcardDTO = {
            ...payload,
            ...resp,
            id: idEdicao
          };
          if (this.existeFlashcardAtual) {
            this.flashcards[this.flashcardIndexAtual] = atualizado;
          }
          this.salvandoFlashcard = false;
          this.mensagemFlashcardSucesso = 'Flashcard atualizado com sucesso.';
          setTimeout(() => this.fecharModalFlashcard(), 250);
        },
        error: (err) => {
          this.salvandoFlashcard = false;
          console.error('[FLASHCARD] Erro ao atualizar:', err);
          alert('Erro ao atualizar flashcard. Tente novamente.');
        }
      });
      return;
    }
    this.salvarFlashcard();
  }

  abrirCadernoErros(): void {
    const selecionado = this.topicoSelecionado;
    const selecionadoId = selecionado?.id;
    if (!this.materiaId || !selecionadoId) return;

    const raw: TopicoNodeDTO = (selecionado?._raw || {}) as TopicoNodeDTO;
    const parentIdRaw =
      raw?.topicoPaiId ??
      raw?.paiId ??
      raw?.topicoPai?.id ??
      raw?.pai?.id ??
      null;
    const parentId = Number(parentIdRaw);
    const temPaiValido = Number.isFinite(parentId) && parentId > 0;

    const topicoId = temPaiValido ? parentId : Number(selecionadoId);
    const subtopicoId = temPaiValido ? Number(selecionadoId) : null;

    this.router.navigate(['/area-restrita/caderno-erros'], {
      queryParams: {
        materiaId: this.materiaId,
        topicoId,
        subtopicoId,
        modo: this.modo
      }
    });
  }

  private montarTagMateriaTopico(materiaNome: string, topicoDescricao: string): string {
    const materia = this.toTitleCasePtBr(materiaNome || '');
    const topico = this.toTitleCasePtBr(topicoDescricao || '');
    return [materia, topico].filter(Boolean).join(' - ');
  }

  formatarTagsFlashcard(tags: string | undefined | null): string {
    const raw = (tags || '').trim();
    if (!raw) return '';

    const delimiters = [' - ', ',', ' -', '- '];
    for (const delimiter of delimiters) {
      const idx = raw.indexOf(delimiter);
      if (idx > -1) {
        const materia = this.toTitleCasePtBr(raw.slice(0, idx).trim());
        const topico = this.toTitleCasePtBr(raw.slice(idx + delimiter.length).trim());
        return [materia, topico].filter(Boolean).join(' - ');
      }
    }

    return this.toTitleCasePtBr(raw);
  }

  private toTitleCasePtBr(value: string): string {
    const lowerWords = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os']);
    const normalized = (value || '').trim().toLocaleLowerCase('pt-BR');
    let wordIndex = 0;

    return normalized.replace(/[a-zA-ZÀ-ÖØ-öø-ÿ0-9]+/g, (word) => {
      if (/^\d+$/.test(word)) return word;

      const keepLower = wordIndex > 0 && lowerWords.has(word);
      wordIndex++;
      if (keepLower) return word;

      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
    });
  }

  fecharModalFlashcard(): void {
    this.mostrarModalFlashcard = false;
    this.flashcardModalEdicaoId = null;
    this.salvandoFlashcard = false;
    this.encerrarArrasteFlashcard();
  }

  // ================================================================
  // VOCABULARIO
  // ================================================================

  abrirModalVocabulario(modo: 'lista' | 'revisar' = 'lista'): void {
    if (!this.topicoPermiteEstudo) return;
    if (modo === 'revisar' && !this.podeAbrirRevisaoVocabulario) return;
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

    const topicoIdReq = Number(this.topicoSelecionado.id) || null;
    if (!topicoIdReq) {
      this.vocabularios = [];
      return;
    }

    const reqSeq = ++this.vocabulariosReqSeq;
    this.carregandoVocabularios = true;
    this.erroVocabularios = undefined;

    this.salaEstudoService.listarVocabularios(topicoIdReq).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (lista) => {
        if (reqSeq !== this.vocabulariosReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        this.vocabularios = lista || [];
        if (this.vocabularioIndexAtual >= this.vocabularios.length) {
          this.vocabularioIndexAtual = 0;
          this.vocabularioMostrarDefinicao = false;
        }
        this.carregandoVocabularios = false;
      },
      error: (err) => {
        if (reqSeq !== this.vocabulariosReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        console.error('[VOCABULARIO] Erro ao carregar:', err);
        this.erroVocabularios = 'Erro ao carregar vocabularios.';
        this.carregandoVocabularios = false;
      }
    });
  }

  private carregarVocabulariosParaRevisao(): void {
    if (!this.topicoSelecionado?.id) {
      this.vocabularios = [];
      return;
    }
    this.carregarVocabularios();
  }

  get podeAbrirRevisaoFlashcards(): boolean {
    return !!(this.topicoPermiteEstudo && !this.carregandoFlashcardsRevisao && this.flashcards?.length);
  }

  get podeAbrirRevisaoVocabulario(): boolean {
    return !!(this.topicoPermiteEstudo && !this.carregandoVocabularios && this.vocabularios?.length);
  }

  salvarVocabulario(): void {
    if (!this.topicoSelecionado?.id || !this.materiaId) return;

    const termo = this.vocabularioTermo.trim();
    const definicao = this.vocabularioDefinicao.trim();

    if (!termo || !definicao) return;

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

    this.salaEstudoService.criarVocabulario(payload).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
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
    if (!this.topicoSelecionado?.id || !this.materiaId) return;

    const itens = this.parseVocabularioLista(this.vocabularioListaTexto || '');
    if (!itens.length) {
      this.erroVocabularios = 'Nenhum item valido para importar.';
      return;
    }

    const termosVistos = new Set<string>();
    const itensValidos: Array<{ termo: string; definicao: string }> = [];
    let ignoradosRepetidos = 0;
    let ignoradosInvalidos = 0;

    for (const item of itens) {
      const normalizado = this.normalizarTermo(item.termo);
      if (!normalizado) {
        ignoradosInvalidos += 1;
        continue;
      }

      if (item.termo.length > this.maxVocabularioChars || item.definicao.length > this.maxVocabularioChars) {
        this.erroVocabularios = `Cada termo e definicao deve ter no maximo ${this.maxVocabularioChars} caracteres.`;
        return;
      }

      if (termosVistos.has(normalizado) || this.isTermoDuplicado(item.termo)) {
        ignoradosRepetidos += 1;
        continue;
      }

      termosVistos.add(normalizado);
      itensValidos.push(item);
    }

    if (!itensValidos.length) {
      this.erroVocabularios = 'Todos os itens estavam repetidos ou invalidos.';
      return;
    }

    this.salvandoListaVocabulario = true;
    this.erroVocabularios = undefined;
    const topicoIdAtual = this.topicoSelecionado?.id;
    if (!topicoIdAtual) {
      this.salvandoListaVocabulario = false;
      this.erroVocabularios = 'Selecione um topico antes de importar vocabulario.';
      return;
    }

    const requisicoes = itensValidos.map((item) =>
      this.salaEstudoService.criarVocabulario({
        materiaId: this.materiaId,
        topicoId: topicoIdAtual,
        termo: item.termo,
        definicao: item.definicao,
        tags: this.vocabularioTags?.trim() || undefined
      })
    );

    forkJoin(requisicoes).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.salvandoListaVocabulario = false;
        this.vocabularioListaTexto = '';
        this.carregarVocabularios();

        const extras: string[] = [];
        if (ignoradosRepetidos > 0) extras.push(`${ignoradosRepetidos} repetidos`);
        if (ignoradosInvalidos > 0) extras.push(`${ignoradosInvalidos} invalidos`);

        const sufixo = extras.length ? ` (${extras.join(', ')} ignorados)` : '';
        this.mensagemVocabularioSucesso = `Lista importada!${sufixo}`;
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
    if (!normalizado) return false;
    return (this.vocabularios || []).some((v) => this.normalizarTermo(v?.termo || '') === normalizado);
  }

  private normalizarTermo(termo: string): string {
    return (termo || '').trim().toLowerCase();
  }

  private parseVocabularioLista(texto: string): Array<{ termo: string; definicao: string }> {
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
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

      if (!termo || !definicao) return;
      itens.push({ termo, definicao });
    });

    return itens;
  }

  excluirVocabulario(item: VocabularioDTO): void {
    if (!item?.id) return;
    const confirmou = window.confirm('Deseja realmente excluir este vocabulario?');
    if (!confirmou) return;

    this.salaEstudoService.excluirVocabulario(item.id).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
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
    if (!this.vocabularios.length) return null;
    if (this.vocabularioIndexAtual < 0 || this.vocabularioIndexAtual >= this.vocabularios.length) return null;
    return this.vocabularios[this.vocabularioIndexAtual];
  }

  iniciarRevisaoVocabulario(): void {
    if (!this.vocabularios.length) return;
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
    if (!this.vocabularios.length) return;
    this.vocabularioIndexAtual = (this.vocabularioIndexAtual + 1) % this.vocabularios.length;
    this.vocabularioMostrarDefinicao = false;
  }

  anteriorVocabulario(): void {
    if (!this.vocabularios.length) return;
    this.vocabularioIndexAtual = (this.vocabularioIndexAtual - 1 + this.vocabularios.length) % this.vocabularios.length;
    this.vocabularioMostrarDefinicao = false;
  }

  // ================================================================
  // FLASHCARD DRAG MODAL
  // ================================================================

  private obterTrechoSelecionado(): string {
    if (this.quillEditor) {
      const range = this.quillEditor.getSelection?.();
      if (range && range.length > 0) {
        const texto = this.quillEditor.getText?.(range.index, range.length) || '';
        return texto ? texto.trim() : '';
      }
    }
    return this.ultimoTrechoSelecionado;
  }

  private preencherFlashcardFrenteComSelecao(): void {
    const trecho = this.obterTrechoSelecionado();
    if (!trecho) return;
    this.flashcardFrente = trecho;
  }

  iniciarArrasteFlashcard(event: PointerEvent): void {
    if (event.button !== 0) return;

    const alvo = event.target as HTMLElement | null;
    if (alvo?.closest('.flashcard-fechar')) return;

    const modalEl = this.flashcardModalRef?.nativeElement;
    const overlayEl = this.flashcardOverlayRef?.nativeElement;
    if (!modalEl || !overlayEl) return;

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
    if (!this.flashcardModalDragging) return;

    const modalEl = this.flashcardModalRef?.nativeElement;
    const overlayEl = this.flashcardOverlayRef?.nativeElement;
    if (!modalEl || !overlayEl) return;

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
    if (!this.flashcardModalDragging) return;
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
    if (!modalEl || !overlayEl) return;

    const overlayRect = overlayEl.getBoundingClientRect();
    const modalRect = modalEl.getBoundingClientRect();

    const x = Math.max(0, (overlayRect.width - modalRect.width) / 2);
    const y = Math.max(0, (overlayRect.height - modalRect.height) / 2);

    this.flashcardModalPos = { x, y };
  }

  // ================================================================
  // SPLIT (QUEBRAR TÓPICO) - CORRIGIDO (ESCOPOS E CHAVES)
  // ================================================================

  abrirModalSplit(topico: TopicoViewModel, event?: Event): void {
    if (event) event.stopPropagation();
    if (!this.podeQuebrarTopico(topico)) return;

    this.splitTopico = topico;
    this.splitTituloPai = (topico?.descricao || '').toString();
    this.splitTituloPaiOriginal = this.splitTituloPai;

    const filhos = (topico?._raw?.subtopicos || topico?.subtopicos || []) as TopicoNodeDTO[];

    const itens = (filhos || [])
      .map((f) => ({
        id: this.getTopicoIdFromDto(f) ?? undefined,
        descricao: (f?.descricao ?? '').toString().trim()
      }))
      .filter((v) => v.descricao.length > 0);

    this.splitNovos = itens.length ? itens : [{ descricao: '' }];

    this.splitDescricaoOriginalPorId = new Map(
      (itens || []).filter((item) => !!item.id).map((item) => [Number(item.id), item.descricao])
    );

    this.splitOrdemOriginalPorId = new Map(
      (itens || []).filter((item) => !!item.id).map((item, index) => [Number(item.id), index + 1])
    );

    this.splitErro = undefined;
    this.splitSalvando = false;
    this.mostrarModalSplit = true;
  }

  fecharModalSplit(): void {
    this.mostrarModalSplit = false;
    this.splitTopico = null;
    this.splitNovos = [];
    this.splitTituloPai = '';
    this.splitTituloPaiOriginal = '';
    this.splitDescricaoOriginalPorId.clear();
    this.splitOrdemOriginalPorId.clear();
    this.splitErro = undefined;
    this.splitSalvando = false;
  }

  onSplitDrop(event: CdkDragDrop<Array<{ id?: number; descricao: string; removendo?: boolean }>>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.splitNovos, event.previousIndex, event.currentIndex);
  }

  adicionarSplitLinha(): void {
    this.splitNovos.push({ descricao: '' });
  }

  removerSplitLinha(index: number): void {
    const item = this.splitNovos[index];
    if (!item) return;

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

    this.materiaService.excluirTopico(this.materiaId, item.id).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        const idx = this.splitNovos.indexOf(item);
        if (idx >= 0) this.splitNovos.splice(idx, 1);
        this.invalidarTopicosComMetaCache();
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

  trackByMateriaId(index: number, item: Materia): number {
    return Number(item?.id ?? index);
  }

  trackByStatusRevisao(index: number, item: { status: StatusRevisao }): string {
    return String(item?.status ?? index);
  }

  trackByVocabularioId(index: number, item: VocabularioDTO): number {
    return Number(item?.id ?? index);
  }

  salvarSplit(): void {
    if (!this.splitTopico || !this.splitTopico.id) return;

    if (!this.materiaId) {
      this.splitErro = 'Materia nao encontrada.';
      return;
    }

    const limpos: Array<{ descricao: string; ordem: number }> = [];
    const tituloPai = (this.splitTituloPai || '').trim();

    if (!tituloPai) {
      this.splitErro = 'Informe o titulo do topico pai.';
      return;
    }

    const tituloChave = tituloPai.toLowerCase();
    const usados = new Set<string>();
    const nomesNormalizados = new Set<string>();
    const edicoesExistentes: Array<{ id: number; descricao: string; ordem: number }> = [];

    this.splitErro = undefined;

    this.splitNovos.forEach((item, index) => {
      const valor = (item?.descricao || '').trim();
      const ordem = index + 1;

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
        const ordemOriginal = this.splitOrdemOriginalPorId.get(Number(item.id));

        if (original !== valor || ordemOriginal !== ordem) {
          edicoesExistentes.push({ id: Number(item.id), descricao: valor, ordem });
        }
        return;
      }

      if (!valor) return;

      const chave = valor.toLowerCase();
      if (chave === tituloChave) return;
      if (nomesNormalizados.has(chave)) return;
      if (usados.has(chave)) return;

      nomesNormalizados.add(chave);
      usados.add(chave);
      limpos.push({ descricao: valor, ordem });
    });

    if (this.splitErro) return;

    const tituloAlterado = (this.splitTituloPaiOriginal || '').trim() !== tituloPai;

    if (!limpos.length && !edicoesExistentes.length && !tituloAlterado) {
      this.splitErro = 'Nenhuma alteracao para salvar.';
      return;
    }

    this.splitErro = undefined;
    this.splitSalvando = true;
    this.registrarSaveLog('split-salvar-inicio', {
      topicoPaiId: this.splitTopico?.id ?? null,
      topicoSelecionadoId: this.topicoSelecionado?.id ?? null,
      editorTopicoId: this.editorTopicoId
    });

    const requests: Array<Observable<unknown>> = [];
    const operacoesSplit: Array<{ tipo: 'titulo' | 'edicao' | 'novo'; id?: number }> = [];

    if (tituloAlterado) {
      operacoesSplit.push({ tipo: 'titulo', id: this.splitTopico.id });
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          id: this.splitTopico.id,
          descricao: tituloPai,
          ativo: this.splitTopico?.ativo ?? true
        })
      );
    }

    edicoesExistentes.forEach((item) => {
      operacoesSplit.push({ tipo: 'edicao', id: item.id });
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          id: item.id,
          descricao: item.descricao,
          ativo: true,
          topicoPaiId: this.splitTopico?.id,
          ordem: item.ordem
        })
      );
    });

    limpos.forEach((novo) => {
      operacoesSplit.push({ tipo: 'novo' });
      requests.push(
        this.materiaService.salvarTopico(this.materiaId, {
          descricao: novo.descricao,
          ativo: true,
          topicoPaiId: this.splitTopico?.id,
          ordem: novo.ordem
        })
      );
    });

    from(requests).pipe(
      concatMap((req) => req),
      toArray()
    ).subscribe({
      next: (respostas: unknown[]) => {
        const topicoPaiId = this.splitTopico?.id ?? null;
        const topicoSelecionadoAntesId = this.topicoSelecionado?.id ?? null;
        const eraSelecionado = topicoSelecionadoAntesId === topicoPaiId;

        let alvoIdPreferido: number | null = null;
        const idxPrimeiroNovo = operacoesSplit.findIndex((op) => op.tipo === 'novo');
        if (idxPrimeiroNovo >= 0) {
          alvoIdPreferido = this.getTopicoIdFromDto(respostas[idxPrimeiroNovo] as TopicoNodeDTO);
        }
        if (!alvoIdPreferido) {
          const idxPrimeiraEdicao = operacoesSplit.findIndex((op) => op.tipo === 'edicao');
          if (idxPrimeiraEdicao >= 0) {
            alvoIdPreferido = operacoesSplit[idxPrimeiraEdicao]?.id ?? this.getTopicoIdFromDto(respostas[idxPrimeiraEdicao] as TopicoNodeDTO);
          }
        }

        this.registrarSaveLog('split-salvar-ok', {
          topicoPaiId,
          eraSelecionado,
          topicoSelecionadoId: topicoSelecionadoAntesId,
          alvoIdPreferido,
          editorTopicoId: this.editorTopicoId
        });

        this.splitSalvando = false;
        this.fecharModalSplit();
        this.recarregarTopicosAposSplit(alvoIdPreferido, topicoPaiId, topicoSelecionadoAntesId);
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar edicao de subtopico:', err);
        this.splitSalvando = false;
        this.splitErro = this.getSplitErroMensagem(err);
      }
    });
  }

  private recarregarTopicosAposSplit(
    alvoIdPreferido: number | null,
    topicoPaiId: number | null,
    topicoSelecionadoAntesId: number | null
  ): void {
    this.recarregarTopicosAposSplit$(alvoIdPreferido, topicoPaiId, topicoSelecionadoAntesId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private recarregarTopicosAposSplit$(
    alvoIdPreferido: number | null,
    topicoPaiId: number | null,
    topicoSelecionadoAntesId: number | null
  ): Observable<void> {
    if (!this.materiaId) return of(void 0);
    this.invalidarTopicosComMetaCache();

    return this.atualizarTopicosComMeta$(this.materiaId, { force: true }).pipe(
      tap(() => {
        let alvo: TopicoViewModel | null = null;

        if (alvoIdPreferido) {
          alvo = this.topicos.find(t => t.id === alvoIdPreferido) || null;
        }

        if (!alvo && topicoPaiId) {
          const paiDto = this.encontrarDtoPorId(this.arvoreTopicos, topicoPaiId);
          const primeiroFilho = ((paiDto?.subtopicos || paiDto?.filhos) || [])[0];
          const primeiroFilhoId = this.getTopicoIdFromDto(primeiroFilho);
          if (primeiroFilhoId) {
            alvo = this.topicos.find(t => t.id === primeiroFilhoId) || null;
          }
        }

        if (!alvo && topicoSelecionadoAntesId) {
          alvo = this.topicos.find(t => t.id === topicoSelecionadoAntesId) || null;
        }

        if (!alvo && topicoPaiId) {
          alvo = this.topicos.find(t => t.id === topicoPaiId) || null;
        }

        if (!alvo) {
          alvo = this.topicos.find(t => !t.hasFilhos && t.ativo !== false) || this.topicos[0] || null;
        }

        if (alvo) {
          this.selecionarTopico(alvo);
        }
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('[SALA-ESTUDO] Erro ao recarregar topicos apos editar topico:', err);
        return of(void 0);
      })
    );
  }

  private getSplitErroMensagem(err: unknown): string {
    const erroObj = err as {
      error?: { mensagem?: string; message?: string; erro?: string };
      message?: string;
    };
    const mensagem = erroObj?.error?.mensagem || erroObj?.error?.message || erroObj?.error?.erro || erroObj?.message;
    if (mensagem && String(mensagem).toLowerCase().includes('ja possui estudo')) {
      return 'Nao e possivel quebrar este topico, pois ele ja possui estudo.';
    }
    return mensagem || 'Erro ao salvar. Tente novamente.';
  }

  // ================================================================
  // FLASHCARDS - CRIAR / REMOVER / REVISAO
  // ================================================================

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
      alert('Selecione um tópico antes de criar o flashcard.');
      return;
    }

    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) {
        alert('Selecione se a resposta é verdadeira ou falsa.');
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
      tipo: this.flashcardTipo as FlashcardDTO['tipo'],
      dificuldade: this.flashcardDificuldade as FlashcardDTO['dificuldade'],
      tags: this.formatarTagsFlashcard(this.flashcardTags)
    };

    const idEdicao = Number(this.flashcardModalEdicaoId || 0);
    const requisicao$ = idEdicao > 0
      ? this.flashcardService.atualizarFlashcard(idEdicao, payload)
      : this.flashcardService.criarFlashcard(payload);

    this.salvandoFlashcard = true;

    requisicao$.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.salvandoFlashcard = false; })
    ).subscribe({
      next: (resp) => {
        if (idEdicao > 0) {
          this.mensagemFlashcardSucesso = 'Flashcard atualizado com sucesso.';
          if (this.existeFlashcardAtual) {
            this.flashcards[this.flashcardIndexAtual] = {
              ...this.flashcards[this.flashcardIndexAtual],
              ...payload,
              ...resp,
              id: idEdicao
            };
          }
          setTimeout(() => this.fecharModalFlashcard(), 250);
        } else {
          this.mensagemFlashcardSucesso = 'Flashcard salvo com sucesso.';
          this.flashcardFrente = '';
          this.flashcardVerso = '';
          this.flashcardVerdadeiroFalso = null;
        }

        if (idEdicao <= 0 && this.topicoSelecionado) this.carregarFlashcards();
        setTimeout(() => { this.mensagemFlashcardSucesso = undefined; }, 3000);
      },
      error: (err) => {
        console.error('[FLASHCARD] Erro ao salvar/atualizar:', err);
        alert(idEdicao > 0 ? 'Erro ao atualizar flashcard. Tente novamente.' : 'Erro ao salvar flashcard. Tente novamente.');
      }
    });
  }

  get existeFlashcardAtual(): boolean {
    return this.flashcards && this.flashcards.length > 0 &&
      this.flashcardIndexAtual >= 0 &&
      this.flashcardIndexAtual < this.flashcards.length;
  }

  get flashcardAtual(): FlashcardDTO | null {
    if (!this.existeFlashcardAtual) return null;
    return this.flashcards[this.flashcardIndexAtual];
  }

  private resetFlashcardFeedback(): void {
    this.flashcardFeedback = null;
  }

  private parseRespostaVerdadeiroFalso(valor: string | undefined | null): boolean | null {
    if (!valor) return null;
    const normalizado = valor.trim().toLowerCase();
    if (!normalizado) return null;

    if (normalizado.startsWith('v') || normalizado.startsWith('t')) return true;
    if (normalizado.startsWith('f')) return false;

    return null;
  }

  isVerdadeiroFalso(card: FlashcardDTO | null): boolean {
    return card?.tipo === ('VERDADEIRO_FALSO' as unknown as FlashcardDTO['tipo']);
  }

  responderVerdadeiroFalso(resposta: boolean, event?: Event): void {
    if (event) event.stopPropagation();

    const atual = this.flashcardAtual;
    if (!atual || !this.isVerdadeiroFalso(atual)) return;

    const esperado = this.parseRespostaVerdadeiroFalso(atual.verso || '');
    if (esperado === null) return;

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
    if (!this.flashcards.length) return;

    const proximoIndex = this.flashcardIndexAtual + 1;
    if (proximoIndex >= this.flashcards.length) {
      // Ao concluir o ultimo flashcard, retorna para Anotacoes e abre o bloqueio de autoexplicacao.
      this.fecharRevisaoFlashcards(undefined, true);
      return;
    }

    this.flashcardIndexAtual = proximoIndex;
    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.resetFlashcardFeedback();
    this.iniciarContagemRevisaoItem();
  }

  anteriorFlashcard(): void {
    if (!this.flashcards.length) return;

    this.flashcardIndexAtual =
      (this.flashcardIndexAtual - 1 + this.flashcards.length) % this.flashcards.length;

    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.resetFlashcardFeedback();
    this.iniciarContagemRevisaoItem();
  }

  removerFlashcardAtual(): void {
    if (!this.flashcardAtual || !this.flashcardAtual.id) return;

    const confirmou = window.confirm('Deseja realmente excluir este flashcard?');
    if (!confirmou) return;

    this.flashcardService.excluirFlashcard(this.flashcardAtual.id).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => this.carregarFlashcards(),
      error: (err) => {
        console.error('[FLASHCARD] Erro ao excluir:', err);
        alert('Erro ao excluir flashcard.');
      }
    });
  }

  private carregarFlashcardsParaRevisao(): void {
    if (!this.topicoSelecionado) {
      this.flashcards = [];
      return;
    }

    const topicoIdReq = Number(this.topicoSelecionado.id) || null;
    if (!topicoIdReq) {
      this.flashcards = [];
      return;
    }

    const reqSeq = ++this.flashcardsRevisaoReqSeq;
    this.carregandoFlashcardsRevisao = true;
    this.erroFlashcardsRevisao = undefined;

    this.salaEstudoService.listarFlashcardsParaRevisao(topicoIdReq).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (lista) => {
        if (reqSeq !== this.flashcardsRevisaoReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        this.flashcards = lista || [];
        if (this.modo === 'revisar' && this.preferirFlashcardsAoEntrarRevisao) {
          this.modoRevisao = this.flashcards.length > 0 ? 'flashcards' : 'anotacoes';
          this.preferirFlashcardsAoEntrarRevisao = false;
        }
        this.flashcardIndexAtual = 0;
        this.mostrarVersoAtual = false;
        this.avaliacaoFlashcardSelecionada = null;
        this.carregandoFlashcardsRevisao = false;
        this.resetFlashcardFeedback();
        this.iniciarContagemRevisaoItem();
      },
      error: (err) => {
        if (reqSeq !== this.flashcardsRevisaoReqSeq || (this.topicoSelecionado?.id ?? null) !== topicoIdReq) {
          return;
        }
        this.preferirFlashcardsAoEntrarRevisao = false;
        console.error('[REVISAO] Erro ao carregar flashcards de revisao:', err);
        this.erroFlashcardsRevisao = 'Erro ao carregar flashcards para revisao.';
        this.carregandoFlashcardsRevisao = false;
        this.flashcards = [];
      }
    });
  }

  selecionarAvaliacaoFlashcard(avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'): void {
    this.avaliacaoFlashcardSelecionada = avaliacao;
  }

  confirmarAvaliacaoFlashcard(): void {
    const atual = this.flashcardAtual;
    const avaliacao = this.avaliacaoFlashcardSelecionada;
    if (this.enviandoAvaliacaoFlashcard || !avaliacao || !atual || !atual.id) return;

    const req: FlashcardRevisaoRespostaRequest = {
      flashcardId: atual.id,
      avaliacao
    };
    console.warn('[SALA-ESTUDO][REVISAO][FLASHCARD][INICIO]', {
      flashcardId: Number(req.flashcardId || 0),
      avaliacao: req.avaliacao,
      topicoSelecionadoId: Number(this.topicoSelecionado?.id || 0) || null,
      horarioIso: new Date().toISOString()
    });

    this.enviandoAvaliacaoFlashcard = true;

    this.salaEstudoService.responderRevisaoFlashcard(req).pipe(
      switchMap(() => this.recarregarTopicosAposRevisao$()),
      finalize(() => {
        this.enviandoAvaliacaoFlashcard = false;
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        console.warn('[SALA-ESTUDO][REVISAO][FLASHCARD][SUCESSO]', {
          flashcardId: Number(req.flashcardId || 0),
          avaliacao: req.avaliacao,
          topicoSelecionadoId: Number(this.topicoSelecionado?.id || 0) || null,
          horarioIso: new Date().toISOString()
        });
        this.proximoFlashcard();
        this.avaliacaoFlashcardSelecionada = null;
        this.atualizarFeedbackRetencaoTopico(this.topicoSelecionado?.id ?? null);
        this.notificarRevisaoConcluida('flashcard', this.topicoSelecionado?.id ?? undefined);
        this.temTempoNaoSalvoFlag = false;
      },
      error: (err) => {
        console.error('[REVISAO] Erro ao registrar resposta do flashcard:', err);
        console.error('[SALA-ESTUDO][REVISAO][FLASHCARD][ERRO]', {
          flashcardId: Number(req.flashcardId || 0),
          avaliacao: req.avaliacao,
          topicoSelecionadoId: Number(this.topicoSelecionado?.id || 0) || null,
          horarioIso: new Date().toISOString(),
          mensagem: err?.message || String(err),
          status: err?.status ?? null
        });
        alert('Erro ao registrar resposta da revisao. Tente novamente.');
      }
    });
  }

  avaliarRevisaoAnotacao(avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'): void {
    if (this.enviandoAvaliacaoAnotacao) return;
    this.avaliacaoSelecionada = avaliacao;
    if (!this.topicoSelecionado) return;

    const req: TopicoRevisaoRespostaRequest = {
      topicoId: this.topicoSelecionado.id,
      avaliacao
    };
    console.warn('[SALA-ESTUDO][REVISAO][TOPICO][INICIO]', {
      topicoId: Number(req.topicoId || 0),
      avaliacao: req.avaliacao,
      horarioIso: new Date().toISOString()
    });

    this.ultimoTopicoRevisadoId = req.topicoId;

    const proximo = this.obterProximoTopicoRevisao();

    this.registrarTempoRevisao();
    this.temTempoNaoSalvoFlag = false;
    this.enviandoAvaliacaoAnotacao = true;

    this.salaEstudoService.responderRevisaoTopico(req).pipe(
      tap(() => this.aplicarStatusLocalAposRevisao(req.topicoId, avaliacao)),
      switchMap(() => this.recarregarTopicosAposRevisao$(req.topicoId, proximo?.id ?? null)),
      finalize(() => {
        this.enviandoAvaliacaoAnotacao = false;
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        console.warn('[SALA-ESTUDO][REVISAO][TOPICO][SUCESSO]', {
          topicoId: Number(req.topicoId || 0),
          avaliacao: req.avaliacao,
          horarioIso: new Date().toISOString()
        });
        this.atualizarFeedbackRetencaoTopico(req.topicoId);
        this.mostrarMensagemRevisao('Revisao das anotacoes registrada!');
        this.notificarRevisaoConcluida('anotacao', req.topicoId);
        this.avancarFilaExecucaoAposConclusao(req.topicoId);
      },
      error: (err) => {
        console.error('[REVISAO] Erro ao registrar revisao de anotacoes:', err);
        console.error('[SALA-ESTUDO][REVISAO][TOPICO][ERRO]', {
          topicoId: Number(req.topicoId || 0),
          avaliacao: req.avaliacao,
          horarioIso: new Date().toISOString(),
          mensagem: err?.message || String(err),
          status: err?.status ?? null
        });
        alert('Erro ao registrar revisao das anotacoes. Tente novamente.');
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
    if (deltaSeg <= 0) deltaSeg = 0;

    const deltaNormalizado = this.normalizarDeltaRevisao(deltaSeg);

    const totalAtual = Number(localStorage.getItem(this.revisaoTempoKey)) || 0;
    const itensAtuais = Number(localStorage.getItem(this.revisaoItensKey)) || 0;

    localStorage.setItem(this.revisaoTempoKey, String(totalAtual + deltaNormalizado));
    localStorage.setItem(this.revisaoItensKey, String(itensAtuais + 1));

    this.revisaoItemInicio = agora;
  }

  private normalizarDeltaRevisao(deltaSeg: number): number {
    if (!Number.isFinite(deltaSeg) || deltaSeg <= 0) return 360;
    return Math.min(Math.max(deltaSeg, 20), 1800);
  }

  // ================================================================
  // NAVEGACAO ENTRE TOPICOS (REVISAO/ESTUDO)
  // ================================================================

  get podeVoltarRevisao(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  voltarRevisao(): void {
    const anterior = this.obterTopicoAnteriorRevisao();
    if (!anterior) return;
    if (this.topicoSelecionado?.id === anterior.id) return;
    this.selecionarTopico(anterior);
  }

  private obterTopicoAnteriorRevisao(): TopicoViewModel | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) return null;

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    for (let offset = 1; offset <= lista.length; offset++) {
      const idx = (startIdx - offset + lista.length) % lista.length;
      const candidato = lista[idx];
      if (this.isRevisaoPrioritaria(candidato)) return candidato;
    }

    if (startIdx >= 0) return lista[(startIdx - 1 + lista.length) % lista.length];
    return lista[0];
  }

  get podeVoltarEstudo(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  voltarEstudo(): void {
    const anterior = this.obterTopicoAnteriorEstudo();
    if (!anterior) return;
    if (this.topicoSelecionado?.id === anterior.id) return;
    this.selecionarTopico(anterior);
  }

  private obterTopicoAnteriorEstudo(): TopicoViewModel | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) return null;

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    if (startIdx >= 0) return lista[(startIdx - 1 + lista.length) % lista.length];
    return lista[0];
  }

  get podeIrParaProximaRevisao(): boolean {
    const lista = this.getTopicosParaRevisao();
    return lista.length > 1;
  }

  irParaProximaRevisao(): void {
    if (this.usarRegrasBackV2 && this.getEscopoTopicosAtivo().size === 0) {
      this.irParaProximoTopicoViaBackend('revisar');
      return;
    }

    const proximo = this.obterProximoTopicoRevisao();
    if (!proximo) return;
    if (this.topicoSelecionado?.id === proximo.id) return;
    this.selecionarTopico(proximo);
  }

  private obterProximoTopicoRevisao(): TopicoViewModel | null {
    const lista = this.getTopicosParaRevisao();
    if (!lista.length) return null;

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    for (let offset = 1; offset <= lista.length; offset++) {
      const idx = (startIdx + offset + lista.length) % lista.length;
      const candidato = lista[idx];
      if (this.isRevisaoPrioritaria(candidato)) return candidato;
    }

    if (startIdx >= 0) return lista[(startIdx + 1) % lista.length];
    return lista[0];
  }

  private getTopicosParaRevisao(): TopicoViewModel[] {
    const base = (this.filtroSemaforoSelecionado || this.getEscopoTopicosAtivo().size > 0)
      ? this.topicosExibidos
      : (this.topicos || []);
    return (base || []).filter(t => !t.hasFilhos && t.ativo !== false);
  }

  get podeIrParaProximoEstudo(): boolean {
    const lista = this.getTopicosFolha();
    return lista.length > 1;
  }

  irParaProximoEstudo(): void {
    if (this.usarRegrasBackV2) {
      this.irParaProximoTopicoViaBackend('estudar');
      return;
    }

    const proximo = this.obterProximoTopicoEstudo();
    if (!proximo) return;
    if (this.topicoSelecionado?.id === proximo.id) return;
    this.selecionarTopico(proximo);
  }

  private obterProximoTopicoEstudo(): TopicoViewModel | null {
    const lista = this.getTopicosFolha();
    if (!lista.length) return null;

    const atualId = this.topicoSelecionado?.id ?? null;
    const startIdx = atualId ? lista.findIndex(t => t.id === atualId) : -1;

    if (startIdx >= 0) return lista[(startIdx + 1) % lista.length];
    return lista[0];
  }

  private getTopicosFolha(): TopicoViewModel[] {
    return (this.topicos || []).filter(t => !t.hasFilhos && t.ativo !== false);
  }

  private isRevisaoPrioritaria(topico: TopicoViewModel): boolean {
    const info = this.revisoesPorTopico.get(topico.id);
    return info?.status === 'ATRASADA' || info?.status === 'HOJE';
  }

  private extrairConflitoOrdemNoNextTopic(err: unknown): { ordemVersionBack: string | null; contexto: NextTopicContext } | null {
    const httpErr = err as HttpErrorResponse;
    if (!httpErr || httpErr.status !== 409) return null;

    const body = (httpErr.error || {}) as Record<string, unknown>;
    const detalhes = ((body['detalhes'] as Record<string, unknown>) || (body['details'] as Record<string, unknown>) || {}) as Record<string, unknown>;
    const meta = ((body['meta'] as Record<string, unknown>) || {}) as Record<string, unknown>;

    const contexto =
      (body['contexto'] as NextTopicContext) ||
      (detalhes['contexto'] as NextTopicContext) ||
      (meta['contexto'] as NextTopicContext) ||
      {};

    const motivoRaw =
      String(
        body['motivo'] ??
        body['codigo'] ??
        body['code'] ??
        detalhes['motivo'] ??
        detalhes['codigo'] ??
        meta['motivo'] ??
        contexto?.motivo ??
        ''
      ).toUpperCase();

    if (motivoRaw !== 'ORDEM_DESATUALIZADA') return null;

    const ordemVersionBackRaw =
      body['ordemVersion'] ??
      detalhes['ordemVersion'] ??
      meta['ordemVersion'] ??
      contexto?.ordemVersion ??
      null;

    const ordemVersionBack = ordemVersionBackRaw != null ? String(ordemVersionBackRaw) : null;
    return { ordemVersionBack, contexto };
  }

  private resolverConflitoOrdemNoNextTopic(
    reqSeq: number,
    modo: 'estudar' | 'revisar',
    retryAposRefresh: boolean,
    topicoAtualId: number | null,
    ordemVersionBack: string | null,
    contexto: NextTopicContext = {}
  ): void {
    console.warn('[SALA-ESTUDO][NEXT] ordem desatualizada, recarregando topicos antes de continuar.', {
      reqSeq,
      ordemVersionAtual: this.ordemVersionAtual,
      ordemVersionBack,
      contexto
    });

    if (ordemVersionBack) {
      this.ordemVersionAtual = ordemVersionBack;
      this.invalidarTopicosComMetaCache();
    }
    if (retryAposRefresh) {
      console.warn('[SALA-ESTUDO][NEXT] ORDEM_DESATUALIZADA persistiu apos refresh; interrompendo novo retry.', {
        reqSeq,
        materiaId: this.materiaId,
        topicoAtualId
      });
      this.avancandoTopico = false;
      return;
    }

    this.invalidarTopicosComMetaCache();
    this.atualizarTopicosComMeta$(this.materiaId, {
      force: true,
      expectedOrdemVersion: this.ordemVersionAtual
    }).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (respTopicos) => {
        this.ordemVersionAtual = respTopicos?.ordemVersion ?? this.ordemVersionAtual ?? null;
        if (!this.ordemVersionAtual) {
          this.ordemVersionAtual = this.obterOrdemVersionFallbackLocal();
        }
        this.avancandoTopico = false;
        this.irParaProximoTopicoViaBackend(modo, true);
      },
      error: (erroRefresh) => {
        console.error('[SALA-ESTUDO][NEXT] falha ao recarregar topicos apos ORDEM_DESATUALIZADA.', {
          reqSeq,
          materiaId: this.materiaId,
          erro: erroRefresh
        });
        this.avancandoTopico = false;
      }
    });
  }

  private irParaProximoTopicoViaBackend(modo: 'estudar' | 'revisar', retryAposRefresh = false): void {
    if (this.avancandoTopico) {
      console.warn('[SALA-ESTUDO][NEXT] requisição de avanço já em andamento; ignorando novo clique.', {
        modo,
        materiaId: this.materiaId,
        topicoAtualId: this.topicoSelecionado?.id ?? null
      });
      return;
    }

    if (!this.materiaId) {
      console.warn('[SALA-ESTUDO][NEXT] materiaId invalido para next-topic.', {
        modo,
        materiaId: this.materiaId
      });
      return;
    }

    if (!this.ordemVersionAtual) {
      if (retryAposRefresh) {
        console.warn('[SALA-ESTUDO][NEXT] ordemVersion ausente mesmo apos refresh; cancelando avanço.', {
          modo,
          materiaId: this.materiaId,
          topicoAtualId: this.topicoSelecionado?.id ?? null
        });
        return;
      }

      this.avancandoTopico = true;
      this.atualizarTopicosComMeta$(this.materiaId, { force: true }).pipe(
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: (respTopicos) => {
          this.ordemVersionAtual = respTopicos?.ordemVersion ?? this.ordemVersionAtual ?? null;
          if (!this.ordemVersionAtual) {
            this.ordemVersionAtual = this.obterOrdemVersionFallbackLocal();
          }
          this.avancandoTopico = false;

          if (!this.ordemVersionAtual) {
            console.warn('[SALA-ESTUDO][NEXT] backend de topicos nao retornou ordemVersion; avanço cancelado.', {
              modo,
              materiaId: this.materiaId
            });
            return;
          }

          this.irParaProximoTopicoViaBackend(modo, true);
        },
        error: (erroRefresh) => {
          console.error('[SALA-ESTUDO][NEXT] falha ao carregar ordemVersion antes do avanço.', {
            modo,
            materiaId: this.materiaId,
            erro: erroRefresh
          });
          this.avancandoTopico = false;
        }
      });
      return;
    }

    this.avancandoTopico = true;
    const reqSeq = ++this.nextTopicReqSeq;
    const topicoAtualId = this.topicoSelecionado?.id ?? null;
    if (!topicoAtualId || !Number.isFinite(topicoAtualId)) {
      console.warn('[SALA-ESTUDO][NEXT] sem currentTopicoId válido, avanço ignorado.', {
        modo,
        materiaId: this.materiaId,
        topicoAtualId
      });
      this.avancandoTopico = false;
      return;
    }
    this.salaEstudoService.obterProximoTopico(
      this.materiaId,
      modo,
      undefined,
      topicoAtualId,
      this.ordemVersionAtual
    ).subscribe({
      next: (resp) => {
        if (reqSeq !== this.nextTopicReqSeq) {
          return;
        }

        const topicoId = Number(resp?.topicoId);
        const motivo = String(resp?.motivo || '').toUpperCase();
        const contexto: NextTopicContext = resp?.contexto || {};
        const topicosVisuais = (this.topicos || []).filter((t) => t?.ativo !== false);
        const idxLocalAtual = topicosVisuais.findIndex((t) => t?.id === topicoAtualId);
        const idxLocalRetornado = topicosVisuais.findIndex((t) => t?.id === topicoId);
        const atualLocal = idxLocalAtual >= 0 ? topicosVisuais[idxLocalAtual] : null;
        const retornadoLocal = idxLocalRetornado >= 0 ? topicosVisuais[idxLocalRetornado] : null;
        const indiceAtualBack = Number(contexto?.indiceAtual);
        const indiceRetornadoBack = Number(contexto?.indiceRetornado);
        if (Number.isFinite(indiceAtualBack) && Number.isFinite(indiceRetornadoBack)) {
          if (indiceRetornadoBack !== indiceAtualBack + 1) {
            console.warn('[SALA-ESTUDO][NEXT] backend não avançou +1 na ordem canônica.', {
              indiceAtualBack,
              indiceRetornadoBack,
              ordemVersion: contexto?.ordemVersion ?? null
            });
          }
        }

        if (idxLocalAtual >= 0 && idxLocalRetornado >= 0 && idxLocalRetornado !== idxLocalAtual + 1) {
          console.warn('[SALA-ESTUDO][NEXT] divergência entre sequência visual local e retorno do backend.', {
            idxLocalAtual,
            idxLocalRetornado,
            topicoAtualId,
            topicoIdRetornado: topicoId
          });
        }
        const semProximo =
          motivo === 'FIM_DA_LISTA' ||
          motivo === 'LISTA_VAZIA';
        if (motivo === 'ORDEM_DESATUALIZADA') {
          const ordemVersionBack = resp?.ordemVersion ?? contexto?.ordemVersion ?? null;
          this.resolverConflitoOrdemNoNextTopic(
            reqSeq,
            modo,
            retryAposRefresh,
            topicoAtualId,
            ordemVersionBack != null ? String(ordemVersionBack) : null,
            contexto
          );
          return;
        }
        if (semProximo || !Number.isFinite(topicoId) || topicoId <= 0) {
          this.avancandoTopico = false;
          return;
        }
        const selecionado = this.selecionarTopicoPorId(topicoId);
        if (!selecionado) {
          console.warn('[SALA-ESTUDO][NEXT] topico retornado nao pode ser aplicado localmente. Recarregando topicos.', {
            reqSeq,
            modo,
            materiaId: this.materiaId,
            topicoAtualId,
            topicoIdRetornado: topicoId,
            motivo: motivo || null
          });
          this.invalidarTopicosComMetaCache();
          this.atualizarTopicosComMeta$(this.materiaId, { force: true })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.selecionarTopicoPorId(topicoId);
              },
              error: () => {
                this.erro = 'Erro ao sincronizar topicos da materia.';
              }
            });
        }
        this.avancandoTopico = false;
      },
      error: (err) => {
        if (reqSeq !== this.nextTopicReqSeq) {
          return;
        }
        const conflito = this.extrairConflitoOrdemNoNextTopic(err);
        if (conflito) {
          this.resolverConflitoOrdemNoNextTopic(
            reqSeq,
            modo,
            retryAposRefresh,
            topicoAtualId,
            conflito.ordemVersionBack,
            conflito.contexto
          );
          return;
        }
        console.error('[SALA-ESTUDO][NEXT] erro ao consultar next-topic.', {
          reqSeq,
          modo,
          materiaId: this.materiaId,
          erro: err
        });
        this.avancandoTopico = false;
      }
    });
  }

  private obterOrdemVersionFallbackLocal(): string | null {
    const candidatos: Array<string | null | undefined> = [];
    const visitar = (lista: Array<{ dataAtualizacao?: string; dataCriacao?: string; updatedAt?: string; filhos?: unknown[] }> ) => {
      (lista || []).forEach((item) => {
        if (!item) return;
        candidatos.push(item?.dataAtualizacao, item?.dataCriacao, item?.updatedAt);
        if (Array.isArray(item?.filhos) && item.filhos.length) {
          visitar(item.filhos as Array<{ dataAtualizacao?: string; dataCriacao?: string; updatedAt?: string; filhos?: unknown[] }>);
        }
      });
    };
    visitar((this.arvoreTopicos || []) as Array<{ dataAtualizacao?: string; dataCriacao?: string; updatedAt?: string; filhos?: unknown[] }>);
    visitar((this.topicos || []) as Array<{ dataAtualizacao?: string; dataCriacao?: string; updatedAt?: string; filhos?: unknown[] }>);

    let maxTime = Number.NaN;
    candidatos.forEach((valor) => {
      if (!valor) return;
      const dt = new Date(valor);
      const t = dt.getTime();
      if (Number.isFinite(t) && (Number.isNaN(maxTime) || t > maxTime)) {
        maxTime = t;
      }
    });

    if (!Number.isFinite(maxTime)) {
      return null;
    }

    return new Date(maxTime).toISOString().replace('Z', '');
  }

  private selecionarTopicoPorId(topicoId: number): boolean {
    const candidato = (this.topicos || []).find((t) => t?.id === topicoId);
    if (!candidato) {
      console.warn('[SALA-ESTUDO][NEXT] tópico retornado não existe na lista carregada.', {
        topicoId,
        totalTopicos: (this.topicos || []).length
      });
      return false;
    }
    if (this.topicoSelecionado?.id === candidato.id) {
      console.warn('[SALA-ESTUDO][NEXT] backend retornou tópico atual (sem avanço).', {
        topicoIdAtual: this.topicoSelecionado?.id ?? null,
        topicoIdRetornado: candidato.id
      });
      return false;
    }
    this.selecionarTopico(candidato);
    return true;
  }

  // ================================================================
  // DASHBOARD REVISÕES
  // ================================================================

  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);

    const data = new Date(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data;
  }

  private definirTopicoInicialUmaVez(resume: ResumeTopicResponseDTO | null): void {
    // ================================================================
    // GUARDRAIL DE REGRA DE NEGOCIO:
    // NUNCA usar localStorage para decidir topico inicial no bootstrap.
    // Fonte oficial: queryParam topicoId (acao explicita do usuario)
    // -> /resume-topic (backend source of truth) -> SEM_CONTEUDO -> fallback.
    // ================================================================
    if (this.topicoInicialDefinido) return;
    this.topicoInicialDefinido = true;

    const fromQuery = Number(this.topicoIdPreferido || 0);
    const resumeTopicoId = Number(resume?.topicoId || 0);
    const folhas = this.obterFolhasEmOrdemVisual();
    const origemExecucaoPlano = this.origemEntrada === 'execucao_plano';
    const escopoFila = this.getEscopoTopicosAtivo();
    const estaEmExecucaoFila = this.modoExecucaoFila || escopoFila.size > 0;

    // Fluxo "Revisar agora": sempre iniciar pelo primeiro topico da ordem da arvore
    // dentro do escopo recebido (query topicos/fila), independentemente do topicoId da query.
    if (estaEmExecucaoFila && folhas.length > 0) {
      const primeiroDaArvoreNoEscopo = folhas.find((topico) => escopoFila.has(Number(topico?.id || 0))) || null;
      if (primeiroDaArvoreNoEscopo) {
        this.selecionarTopico(primeiroDaArvoreNoEscopo);
        this.selecionouTopicoInicial = true;
        console.log('topico final selecionado', this.topicoSelecionado?.id);
        return;
      }
    }

    // Logs temporarios para validar ordem de decisao e race condition
    console.log('resume-topic', resume);
    console.log('topicoIdPreferido(query)', this.topicoIdPreferido);
    if (origemExecucaoPlano) {
      console.info('[SALA-ESTUDO] origem=execucao_plano', {
        materiaId: Number(this.materiaId || 0) || null,
        topicoIdQuery: fromQuery > 0 ? fromQuery : null,
        origem: this.origemEntrada
      });
    }

    if (origemExecucaoPlano) {
      const alvoQueryExecucao = fromQuery > 0
        ? (folhas.find((x) => x.id === fromQuery) || this.topicos.find((x) => x.id === fromQuery) || null)
        : null;

      if (alvoQueryExecucao && !this.isTopicoFinalizado(alvoQueryExecucao)) {
        this.selecionarTopico(alvoQueryExecucao);
        this.selecionouTopicoInicial = true;
        console.info('[SALA-ESTUDO] topicoInicialEscolhido', {
          materiaId: Number(this.materiaId || 0) || null,
          topicoId: Number(alvoQueryExecucao.id || 0) || null,
          origem: this.origemEntrada
        });
        console.log('topico final selecionado', this.topicoSelecionado?.id);
        return;
      }

      const proximoNaoFinalizado = folhas.find((topico) => !this.isTopicoFinalizado(topico)) || null;
      if (proximoNaoFinalizado) {
        this.selecionarTopico(proximoNaoFinalizado);
        this.selecionouTopicoInicial = true;
        console.info('[SALA-ESTUDO] topicoInicialEscolhido', {
          materiaId: Number(this.materiaId || 0) || null,
          topicoId: Number(proximoNaoFinalizado.id || 0) || null,
          origem: this.origemEntrada
        });
        console.log('topico final selecionado', this.topicoSelecionado?.id);
        return;
      }
    }

    if (fromQuery > 0) {
      const alvoQuery = folhas.find((x) => x.id === fromQuery) || this.topicos.find((x) => x.id === fromQuery);
      if (alvoQuery) {
        this.selecionarTopico(alvoQuery);
        this.selecionouTopicoInicial = true;
        console.log('topico final selecionado', this.topicoSelecionado?.id);
        return;
      }
    }

    if (resumeTopicoId > 0) {
      const alvoResume = folhas.find((x) => x.id === resumeTopicoId) || this.topicos.find((x) => x.id === resumeTopicoId);
      if (alvoResume) {
        this.selecionarTopico(alvoResume);
        this.selecionouTopicoInicial = true;
        console.log('topico final selecionado', this.topicoSelecionado?.id);
        return;
      }
    }

    if (this.isResumeSemConteudo(resume)) {
      this.topicoSelecionado = null;
      this.resumeSemConteudoMateria = true;
      this.selecionouTopicoInicial = true;
      console.log('topico final selecionado', null);
      return;
    }

    if (resume === null && folhas?.length) {
      this.selecionarTopico(folhas[0]);
      this.selecionouTopicoInicial = true;
      console.log('topico final selecionado', this.topicoSelecionado?.id);
      return;
    }

    console.log('topico final selecionado', this.topicoSelecionado?.id);
  }

  private obterFolhasEmOrdemVisual(): TopicoViewModel[] {
    const topicosBase = (this.filtroSemaforoSelecionado || this.getEscopoTopicosAtivo().size > 0)
      ? this.topicosExibidos
      : this.topicos;
    return topicosBase.filter((t) => !t.hasFilhos && t.ativo !== false);
  }

  private isResumeSemConteudo(resume: ResumeTopicResponseDTO | null | undefined): boolean {
    const motivo = String(resume?.motivo || '').toUpperCase();
    return motivo === 'SEM_CONTEUDO' || motivo === 'SEM_CONTEUDO_NOVO';
  }

  finalizarTopico(): void {
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) return;

    const topicoId = this.topicoSelecionado?.id;
    if (!topicoId || this.topicosFinalizadosPendentes.has(topicoId)) return;

    if (this.isTopicoFinalizado(this.topicoSelecionado)) {
      const confirmado = window.confirm('Deseja desfazer o finalizado deste topico?');
      if (!confirmado) return;

      this.topicosFinalizadosPendentes.add(topicoId);
      this.topicosFinalizados.delete(topicoId);

      this.salaEstudoService.desfinalizarTopico(topicoId).pipe(
        switchMap(() => this.carregarTopicosFinalizados$()),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: () => {
          this.topicosFinalizadosPendentes.delete(topicoId);
          this.mensagemTopicoFinalizado = 'Finalizado removido.';
          setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
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

    if (this.temTempoNaoSalvo()) this.salvarEstudo();

    const proximoPreferidoId = this.obterProximoTopicoIdAtual(topicoId);

    this.topicosFinalizadosPendentes.add(topicoId);

    this.salaEstudoService.finalizarTopico(topicoId).pipe(
      switchMap(() => this.carregarTopicosFinalizados$()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: () => {
        this.topicosFinalizadosPendentes.delete(topicoId);
        this.topicosFinalizados.add(topicoId);
        this.mensagemTopicoFinalizado = 'Topico finalizado.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
        this.notificarRevisaoConcluida('finalizacao-topico', topicoId);
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
    if (!this.topicoSelecionado || !this.topicoPermiteEstudo) return;

    const topicoId = this.topicoSelecionado?.id;
    if (!topicoId || this.topicosResetPendentes.has(topicoId)) return;

    const confirmado = window.confirm(
      'Deseja zerar todo o estudo deste topico? Isso apagará anotacoes, flashcards, vocabulario, tempos e revisoes.'
    );

    if (!confirmado) return;

    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }

    this.topicosResetPendentes.add(topicoId);

    this.salaEstudoService.resetarTopico(topicoId).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
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

  private obterPrimeiroNaoEstudado(folhas: TopicoViewModel[]): TopicoViewModel | null {
    const candidato = folhas.find(t => !this.temEstudoNoTopico(t));
    return candidato || null;
  }

  private precisaConfirmarContinuacao(
    folhas: TopicoViewModel[],
    primeiroNaoEstudado: TopicoViewModel,
    proximoAposUltimoEstudado: TopicoViewModel | null
  ): boolean {
    if (!folhas.length) return false;
    if (!primeiroNaoEstudado?.id) return false;
    if (!proximoAposUltimoEstudado?.id) return false;

    const index = folhas.findIndex(t => t.id === primeiroNaoEstudado.id);
    if (index <= 0) return false;

    return folhas.slice(0, index).some(t => this.temEstudoNoTopico(t));
  }

  private obterProximoNaoEstudadoAposUltimoEstudado(folhas: TopicoViewModel[]): TopicoViewModel | null {
    let ultimoEstudadoIndex = -1;

    for (let i = 0; i < folhas.length; i += 1) {
      if (this.temEstudoNoTopico(folhas[i])) {
        ultimoEstudadoIndex = i;
      }
    }

    if (ultimoEstudadoIndex < 0) return null;

    for (let i = ultimoEstudadoIndex + 1; i < folhas.length; i += 1) {
      if (!this.temEstudoNoTopico(folhas[i])) return folhas[i];
    }

    return null;
  }

  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3;
      case 'HOJE': return 2;
      case 'FUTURA': return 1;
      case 'SEM':
      default: return 0;
    }
  }

  private encontrarDtoPorId(lista: TopicoNodeDTO[], id: number): TopicoNodeDTO | null {
    for (const dto of lista) {
      if (dto.id === id) return dto;
      if (dto.subtopicos && dto.subtopicos.length) {
        const achou = this.encontrarDtoPorId(dto.subtopicos, id);
        if (achou) return achou;
      }
    }
    return null;
  }

  private normalizarStatusRevisao(raw: unknown): StatusRevisao | null {
    const status = String(raw || '').toUpperCase();
    if (status === 'EM_DIA') return 'HOJE';
    if (status === 'VENCIDA') return 'ATRASADA';
    if (status === 'ATRASADA' || status === 'HOJE' || status === 'FUTURA' || status === 'SEM') {
      return status as StatusRevisao;
    }
    return null;
  }

  private getStatusFromDto(dto: TopicoNodeDTO): StatusRevisao {
    if (!dto?.id) return 'SEM';

    const statusOverride = this.getStatusOverrideRevisao(dto.id);
    if (statusOverride) return statusOverride;

    const info = this.revisoesPorTopico.get(dto.id);
    if (info?.status) return info.status;

    const statusCanonico = this.normalizarStatusRevisao(dto.statusCanonico);
    if (statusCanonico && statusCanonico !== 'SEM') return statusCanonico;

    const statusDto = this.normalizarStatusRevisao(dto.statusRevisao);
    if (statusDto && statusDto !== 'SEM') return statusDto;

    if (statusCanonico === 'SEM') return 'SEM';
    if (statusDto === 'SEM') return 'SEM';

    return 'SEM';
  }

  private getStatusSimplesTopico(topicoId: number | undefined): StatusRevisao {
    if (!topicoId) return 'SEM';

    const statusOverride = this.getStatusOverrideRevisao(topicoId);
    if (statusOverride) return statusOverride;

    const info = this.revisoesPorTopico.get(topicoId);
    if (!info) {
      const dto = this.encontrarDtoPorId(this.arvoreTopicos, topicoId);
      if (dto) return this.getStatusFromDto(dto);
      return this.topicosComAnotacoes.has(topicoId) ? 'FUTURA' : 'SEM';
    }

    return info.status ?? 'SEM';
  }

  private getStatusRevisaoTopicoView(t: TopicoViewModel): StatusRevisao {
    if (!t || !t.id) return 'SEM';

    const dto = this.encontrarDtoPorId(this.arvoreTopicos, t.id);
    if (!dto) return this.getStatusSimplesTopico(t.id);

    return this.getStatusFromDto(dto);
  }

  temEstudoNoTopico(t: TopicoViewModel): boolean {
    return this.getStatusRevisaoTopicoView(t) !== 'SEM';
  }

  podeQuebrarTopico(t: TopicoViewModel): boolean {
    return !!t?.id;
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
    if (!html) return false;

    if (typeof document === 'undefined') {
      return html.replace(/<[^>]*>/g, '').trim().length > 0;
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    const texto = (container.textContent || '').replace(/\u200B/g, '').trim();
    return texto.length > 0;
  }

  private normalizarHtmlAnotacoes(html: string): string {
    if (!html) return '';
    let normalizado = html;
    normalizado = normalizado.replace(/(?:<p><br><\/p>|\s*<p>\s*<\/p>)+/gi, '<p><br></p>');
    normalizado = normalizado.trim();
    return normalizado;
  }

  private atualizarMarcaAnotacoes(topicoId: number | undefined, temConteudo: boolean): void {
    if (!topicoId) return;
    if (temConteudo) this.topicosComAnotacoes.add(topicoId);
    else this.topicosComAnotacoes.delete(topicoId);
  }

  classeSemaforoRevisaoSala(t: TopicoViewModel) {
    const status = this.getStatusRevisaoTopicoView(t);
    return {
      'badge-sem-revisao': status === 'SEM',
      'badge-revisao-futura': status === 'FUTURA',
      'badge-revisao-hoje': status === 'HOJE',
      'badge-revisao-atrasada': status === 'ATRASADA'
    };
  }

  get topicosExibidos(): TopicoViewModel[] {
    const fonte = this.topicos || [];
    const filtro = this.filtroSemaforoSelecionado;
    if (
      this.topicosExibidosCacheFonte === fonte &&
      this.topicosExibidosCacheFiltro === filtro &&
      this.topicosExibidosCacheRevisoesVersion === this.revisoesViewVersion
    ) {
      return this.topicosExibidosCacheResultado;
    }

    const escopoAtivo = this.getEscopoTopicosAtivo();
    const comEscopo = escopoAtivo.size > 0
      ? fonte.filter((t) => escopoAtivo.has(Number(t?.id || 0)))
      : fonte;
    const resultado = !filtro
      ? comEscopo
      : comEscopo.filter(t => this.getStatusRevisaoTopicoView(t) === filtro);

    this.topicosExibidosCacheFonte = fonte;
    this.topicosExibidosCacheFiltro = filtro;
    this.topicosExibidosCacheRevisoesVersion = this.revisoesViewVersion;
    this.topicosExibidosCacheResultado = resultado;
    return resultado;
  }

  alternarFiltroSemaforo(status: StatusRevisao): void {
    this.filtroSemaforoSelecionado = this.filtroSemaforoSelecionado === status ? null : status;
    this.invalidarTopicosExibidosCache();
  }

  isFiltroSemaforoAtivo(status: StatusRevisao): boolean {
    return this.filtroSemaforoSelecionado === status;
  }

  get descricaoFiltroSemaforoAtual(): string {
    if (!this.filtroSemaforoSelecionado) return '';
    const opcao = this.opcoesFiltroSemaforo.find(item => item.status === this.filtroSemaforoSelecionado);
    return opcao?.rotulo || '';
  }

  private recarregarTopicosAposRevisao(proximoAposId?: number | null, proximoPreferidoId?: number | null): void {
    this.recarregarTopicosAposRevisao$(proximoAposId, proximoPreferidoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private recarregarTopicosAposRevisao$(proximoAposId?: number | null, proximoPreferidoId?: number | null): Observable<void> {
    if (!this.materiaId) return of(void 0);

    const idSelecionado = this.topicoSelecionado?.id;

    const startedAt = Date.now();
    console.warn('[SALA-ESTUDO][REVISAO][RELOAD][INICIO]', {
      materiaId: Number(this.materiaId || 0),
      topicoSelecionadoId: Number(idSelecionado || 0) || null,
      proximoAposId: Number(proximoAposId || 0) || null,
      proximoPreferidoId: Number(proximoPreferidoId || 0) || null,
      horarioIso: new Date(startedAt).toISOString()
    });

    return forkJoin({
      revisoesResp: this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 })
    }).pipe(
      tap(({ revisoesResp }) => {
        const itens = (revisoesResp?.itens || []) as RevisaoTopicoItem[];
        console.warn('[SALA-ESTUDO][REVISAO][RELOAD][OK]', {
          elapsedMs: Date.now() - startedAt,
          revisoesItens: itens.length,
          topicoSelecionadoId: Number(this.topicoSelecionado?.id || 0) || null,
          horarioIso: new Date().toISOString()
        });
        this.atualizarMapaRevisoes((revisoesResp?.itens || []) as RevisaoTopicoItem[]);
        this.revisoesCarregadas = true;

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

        if (idSelecionado) {
          const encontrado = this.topicos.find(t => t.id === idSelecionado);
          if (encontrado) {
            this.topicoSelecionado = encontrado;
          }
        }
      }),
      map(() => void 0),
      catchError((err) => {
        console.error('[SALA-ESTUDO] Erro ao recarregar topicos apos revisao:', err);
        console.error('[SALA-ESTUDO][REVISAO][RELOAD][ERRO]', {
          elapsedMs: Date.now() - startedAt,
          mensagem: err?.message || String(err),
          status: err?.status ?? null,
          horarioIso: new Date().toISOString()
        });
        return of(void 0);
      })
    );
  }

  private atualizarMapaRevisoes(itens: RevisaoTopicoItem[] | null | undefined): void {
    const proximoMapa = new Map<number, { status: StatusRevisao; proximaRevisao?: string | null }>();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    (itens || []).forEach((item: RevisaoTopicoItem) => {
      if (!item?.topicoId) return;

      const topicoId = Number(item.topicoId);
      const proxima: string | null = item.proximaRevisao || item.dataProximaRevisao || null;
      const statusBackend: StatusRevisao = extrairStatusCanonicoRevisao(item, hoje);
      const statusOverride = this.getStatusOverrideRevisao(topicoId);

      const statusFinal = (statusOverride && statusOverride !== statusBackend)
        ? statusOverride
        : statusBackend;
      if (!statusOverride || statusOverride === statusBackend) {
        this.overrideStatusRevisaoPorTopico.delete(topicoId);
      }

      const atual = proximoMapa.get(topicoId);
      if (!atual) {
        proximoMapa.set(topicoId, { status: statusFinal, proximaRevisao: proxima });
      } else {
        const atualPeso = this.prioridadeStatus(atual.status);
        const novoPeso = this.prioridadeStatus(statusFinal);
        if (novoPeso > atualPeso) {
          proximoMapa.set(topicoId, { status: statusFinal, proximaRevisao: proxima ?? atual.proximaRevisao ?? null });
        } else if (novoPeso === atualPeso) {
          const dataAtual = atual.proximaRevisao || null;
          const dataNova = proxima || null;
          const manterNova = !!dataNova && (!dataAtual || dataNova < dataAtual);
          if (manterNova) {
            proximoMapa.set(topicoId, { status: statusFinal, proximaRevisao: dataNova });
          }
        }
      }
    });

    for (const [topicoId] of this.overrideStatusRevisaoPorTopico) {
      const statusOverride = this.getStatusOverrideRevisao(topicoId);
      if (!statusOverride) continue;
      if (!proximoMapa.has(topicoId)) {
        const atual = this.revisoesPorTopico.get(topicoId);
        proximoMapa.set(topicoId, { status: statusOverride, proximaRevisao: atual?.proximaRevisao ?? null });
      }
    }

    this.revisoesPorTopico.clear();
    for (const [topicoId, info] of proximoMapa) {
      this.revisoesPorTopico.set(topicoId, info);
    }

    this.revisoesViewVersion += 1;
    this.invalidarTopicosExibidosCache();
  }

  private aplicarStatusLocalAposRevisao(
    topicoId: number,
    avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'
  ): void {
    if (!topicoId) return;

    const status: StatusRevisao =
      avaliacao === 'ERREI' ? 'ATRASADA' :
      avaliacao === 'DIFICIL' ? 'HOJE' :
      'FUTURA';

    const atual = this.revisoesPorTopico.get(topicoId);
    this.revisoesPorTopico.set(topicoId, {
      status,
      proximaRevisao: atual?.proximaRevisao ?? null
    });
    this.overrideStatusRevisaoPorTopico.set(topicoId, {
      status,
      expiresAt: Date.now() + 120000
    });
    this.revisoesViewVersion += 1;
    this.invalidarTopicosExibidosCache();
  }

  private getStatusOverrideRevisao(topicoId: number): StatusRevisao | null {
    const override = this.overrideStatusRevisaoPorTopico.get(topicoId);
    if (!override) return null;
    if (Date.now() > override.expiresAt) {
      this.overrideStatusRevisaoPorTopico.delete(topicoId);
      return null;
    }
    return override.status;
  }

  private obterProximoTopicoParaEstudo(atualId: number): TopicoViewModel | null {
    const lista = this.getTopicosParaRevisao();
    if (!lista.length) return null;

    const index = lista.findIndex(t => t.id === atualId);

    for (let i = index + 1; i < lista.length; i += 1) {
      if (!this.isTopicoFinalizado(lista[i])) return lista[i];
    }

    for (let i = 0; i < lista.length; i += 1) {
      if (!this.isTopicoFinalizado(lista[i])) return lista[i];
    }

    return null;
  }

  private obterProximoTopicoIdAtual(atualId: number): number | null {
    const lista = this.getTopicosParaRevisao();
    if (!lista.length) return null;

    const index = lista.findIndex(t => t.id === atualId);

    for (let i = index + 1; i < lista.length; i += 1) {
      if (!this.isTopicoFinalizado(lista[i])) return lista[i]?.id ?? null;
    }

    for (let i = 0; i < lista.length; i += 1) {
      if (!this.isTopicoFinalizado(lista[i])) return lista[i]?.id ?? null;
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

  limparFiltroTopicoDirecionado(): void {
    this.revisaoDirecionadaAtiva = false;
    this.topicoIdPreferido = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { topicoId: null, origem: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private notificarTopicoDirecionadoNaoEncontrado(topicoId: number): void {
    this.messageService.add({
      severity: 'warn',
      summary: 'Tópico não encontrado',
      detail: `O tópico ${topicoId} não pertence a esta matéria.`
    });
  }

  private mostrarMensagemRevisao(texto: string): void {
    this.mensagemRevisao = texto;
    setTimeout(() => { this.mensagemRevisao = undefined; }, 4000);
  }

  private mostrarFeedbackRetencao(texto: string): void {
    this.feedbackRetencao = texto;
    if (this.feedbackRetencaoTimer) {
      clearTimeout(this.feedbackRetencaoTimer);
    }
    this.feedbackRetencaoTimer = setTimeout(() => {
      this.feedbackRetencao = undefined;
      this.feedbackRetencaoTimer = null;
    }, 2000);
  }

  private notificarRevisaoConcluida(
    origem: 'anotacao' | 'flashcard' | 'finalizacao-topico',
    topicoId?: number
  ): void {
    console.warn('[SALA-ESTUDO][REVISAO][BUS][EMIT]', {
      origem,
      topicoId: Number(topicoId || 0) || null,
      horarioIso: new Date().toISOString()
    });
    this.refreshBusService.emitRevisaoConcluida({ origem, topicoId });

    // Retry curto para mitigar eventual consistencia do backend.
    const retryTimer = setTimeout(() => {
      console.warn('[SALA-ESTUDO][REVISAO][BUS][RETRY_EMIT]', {
        origem,
        topicoId: Number(topicoId || 0) || null,
        horarioIso: new Date().toISOString()
      });
      this.refreshBusService.emitRevisaoConcluida({ origem, topicoId });
      this.refreshBusTimers = this.refreshBusTimers.filter((timer) => timer !== retryTimer);
    }, 2000);
    this.refreshBusTimers.push(retryTimer);
  }

  private atualizarFeedbackRetencaoTopico(topicoId: number | null): void {
    if (!topicoId) return;

    const scoreAnterior = this.scoreRetencaoPorTopico.get(topicoId);

    this.retencaoAnalyticsService.buscarSerieTopico(topicoId, 30).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (serie: RetencaoPontoDTO[]) => {
        const scoreAtual = this.extrairUltimoScoreRetencao(serie);
        if (scoreAtual === null) return;

        const mensagem = scoreAnterior !== undefined
          ? `Retencao estimada: ${scoreAnterior.toFixed(2)} -> ${scoreAtual.toFixed(2)}`
          : `Retencao atual: ${scoreAtual.toFixed(2)}`;

        this.scoreRetencaoPorTopico.set(topicoId, scoreAtual);
        this.mostrarFeedbackRetencao(mensagem);
      },
      error: () => {
        // Sem impacto no fluxo principal de revisao.
      }
    });
  }

  private extrairUltimoScoreRetencao(serie: RetencaoPontoDTO[] | null | undefined): number | null {
    if (!Array.isArray(serie) || !serie.length) return null;
    for (let i = serie.length - 1; i >= 0; i -= 1) {
      const score = serie[i]?.scoreDia;
      if (typeof score === 'number' && Number.isFinite(score)) {
        return score;
      }
    }
    return null;
  }

  private getTopicoIdFromDto(dto: TopicoNodeDTO | TopicoViewModel | null | undefined): number | null {
    const id =
      dto?.id ??
      dto?.topicoId ??
      dto?.subtopicoId ??
      dto?.idTopico ??
      dto?.idSubtopico ??
      null;

    return id ? Number(id) : null;
  }

  trackByTopicoId(index: number, t: TopicoViewModel): number {
    return Number(t?.id ?? index);
  }

  private invalidarTopicosExibidosCache(): void {
    this.topicosExibidosCacheFonte = null;
    this.topicosExibidosCacheFiltro = null;
    this.topicosExibidosCacheRevisoesVersion = -1;
    this.topicosExibidosCacheResultado = [];
  }
}








