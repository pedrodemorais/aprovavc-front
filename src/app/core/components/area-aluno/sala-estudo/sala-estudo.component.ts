import { FlashcardDTO } from '../models/FlashcardDTO';
import { Component, HostListener, OnInit, OnDestroy, ElementRef, ViewChild, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from '../services/materia.service';
import { Materia } from '../models/materia.model';
import { BlocosEstudoService } from '../services/blocos-estudo.service';
import {SalaEstudoService,  EstudoTopicoRequest,  FlashcardRevisaoRespostaRequest, TopicoRevisaoRespostaRequest, TopicoFinalizadoDTO
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
  mensagemAvancoCiclo?: string;
  mensagemTopicoFinalizado?: string;
  pausarAoSairDaAba = true;
  private readonly pausarAoSairDaAbaKey = 'sala-estudo:pausar-ao-sair-aba';
  private topicosFinalizados = new Set<number>();

  @ViewChild('flashcardModal', { static: false }) flashcardModalRef?: ElementRef<HTMLElement>;
  @ViewChild('flashcardOverlay', { static: false }) flashcardOverlayRef?: ElementRef<HTMLElement>;
  flashcardModalPos = { x: 0, y: 0 };
  flashcardModalDragging = false;
  private flashcardDragOffset = { x: 0, y: 0 };
  private quillEditor?: any;
  private ultimoTrechoSelecionado = '';

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

  mostrarModalSplit: boolean = false;
  splitTopico: any | null = null;
  splitNovos: string[] = [];
  splitTituloPai: string = '';
  splitErro?: string;
  splitSalvando: boolean = false;
  flashcardFrente: string = '';
  flashcardVerso: string = '';
  flashcardTipo: string = 'PERGUNTA_RESPOSTA';
  flashcardDificuldade: string = 'MEDIA';
  flashcardTags: string = '';
  flashcardVerdadeiroFalso: 'VERDADEIRO' | 'FALSO' | null = null;

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
  private readonly revisaoTempoKey = 'revisao:tempoTotalSegundos';
  private readonly revisaoItensKey = 'revisao:itensTotais';
  private readonly ultimoTopicoKeyPrefix = 'sala-estudo:ultimo-topico:';

  constructor(
    private route: ActivatedRoute,
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
    this.route.paramMap.subscribe(params => {
      const idParam = params.get('materiaId') ?? params.get('id');
      this.materiaId = idParam ? Number(idParam) : 0;
      this.topicoIdPreferido = this.getTopicoIdFromQuery();
      this.autoSelecionarUltimoNaoEstudado = this.getAutoTopicoFromQuery();
      this.modoPreferido = this.getModoFromQuery();
      this.modo = this.modoPreferido;
      this.ajustarColunaEsquerdaParaModo();

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
    return !!(this.topicoSelecionado && !this.topicoSelecionado.hasFilhos);
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

  private getTopicoIdFromQuery(): number | null {
    const raw = this.route.snapshot.queryParamMap.get('topicoId');
    if (!raw) {
      return null;
    }
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private getAutoTopicoFromQuery(): boolean {
    const raw = (this.route.snapshot.queryParamMap.get('proximo') || '').toLowerCase();
    const alt = (this.route.snapshot.queryParamMap.get('autoTopico') || '').toLowerCase();
    const alt2 = (this.route.snapshot.queryParamMap.get('proximoTopico') || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'sim' || alt === '1' || alt === 'true' || alt === 'sim' ||
      alt2 === '1' || alt2 === 'true' || alt2 === 'sim';
  }

  private getModoFromQuery(): 'estudar' | 'revisar' {
    const rawModo = (this.route.snapshot.queryParamMap.get('modo') || '').toLowerCase();
    const rawRevisar = (this.route.snapshot.queryParamMap.get('revisar') || '').toLowerCase();
    const rawRevisao = (this.route.snapshot.queryParamMap.get('revisao') || '').toLowerCase();

    if (rawModo === 'revisar' || rawModo === 'revisao') {
      return 'revisar';
    }

    if (rawRevisar === '1' || rawRevisar === 'true' || rawRevisar === 'sim') {
      return 'revisar';
    }

    if (rawRevisao === '1' || rawRevisao === 'true' || rawRevisao === 'sim') {
      return 'revisar';
    }

    return 'estudar';
  }

  ativarRevisaoAnotacoes(): void {
  this.modoRevisao = 'anotacoes';

  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    // se quiser, pode for+�ar recarregar anota+�+�es aqui tamb+�m
    this.salaEstudoService.buscarAnotacoes(this.topicoSelecionado.id).subscribe({
      next: (resp) => {
        this.anotacoes = resp.anotacoes || '';
        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
      },
      error: () => {
        this.anotacoes = '';
        this.anotacoesHtmlSeguras = null;
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
        this.anotacoes = resp.anotacoes || '';
        this.anotacoesHtmlSeguras = this.sanitizer.bypassSecurityTrustHtml(this.anotacoes);
      },
      error: () => {
        this.anotacoes = '';
        this.anotacoesHtmlSeguras = null;
      }
    });

    // se já estiver no modo revisar, ao trocar de tópico recarrega os flashcards para revisão
    if (this.modo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }
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
    if (!t?.id || t?.hasFilhos || !this.materiaId) {
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

  private isTopicoFinalizado(t: any): boolean {
    const id = t?.id;
    if (!id) {
      return false;
    }
    return this.topicosFinalizados.has(id);
  }

  private carregarTopicosFinalizados(): void {
    this.salaEstudoService.listarTopicosFinalizados().subscribe({
      next: (lista: TopicoFinalizadoDTO[]) => {
        this.topicosFinalizados = new Set((lista || [])
          .map((item) => item?.topicoId)
          .filter((id): id is number => Number.isFinite(id)));
      },
      error: () => {
        this.topicosFinalizados = new Set();
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
    this.modo = novoModo;
    this.mensagemRevisao = undefined;
    this.revisaoAutoExplicacaoAtiva = novoModo === 'revisar' && this.timerAtivo;
    this.ajustarColunaEsquerdaParaModo();
    // quando entrar no modo revisar, se tiver tópico válido, carrega flashcards de revisão
    if (novoModo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
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

  salvarEstudo(): void {
    if (!this.topicoSelecionado) {
      this.erro = 'Selecione um topico antes de salvar o estudo.';
      return;
    }

    const modoBack = this.modoTemporizador;

    // tempo TOTAL decorrido no cron+�metro para este t+�pico / sess+�o
    const tempoAtualTotal = this.calcularTempoEstudoAtual();

    // apenas o DELTA desde o +�ltimo salvamento
    let tempoParaSalvar = tempoAtualTotal - this.segundosEstudoJaSalvosTopicoAtual;
    if (tempoParaSalvar < 0) {
      tempoParaSalvar = 0;
    }

    const payload: EstudoTopicoRequest = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      modoTemporizador: modoBack,
      tipoSessao: this.modo === 'revisar' ? 'REVISAO' : 'ESTUDO',
      tempoLivreSegundos: tempoParaSalvar,
      anotacoes: this.anotacoes,
      pomodoroFase: this.modoTemporizador === 'pomodoro' ? this.pomodoroFase : undefined,
      pomodoroCiclosConcluidos: this.modoTemporizador === 'pomodoro'
        ? this.pomodoroCiclosConcluidos
        : undefined
    };

    this.salaEstudoService.salvarEstudo(payload).subscribe({
      next: (resp) => {
        console.log('[SALA-ESTUDO] Estudo salvo:', resp);

        // ap+�s salvar com sucesso, acumula o que foi enviado
        this.segundosEstudoJaSalvosTopicoAtual += tempoParaSalvar;
        this.temTempoNaoSalvoFlag = false;

        this.mensagemEstudoSalvo = this.modo === 'revisar'
          ? 'Revis\u00e3o salva com sucesso.'
          : 'Estudo salvo com sucesso.';
        setTimeout(() => (this.mensagemEstudoSalvo = undefined), 4000);

        if (this.modo === 'estudar' && tempoParaSalvar > 0) {
          this.tentarAvancarCicloSilencioso();
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar estudo:', err);
        this.erro = 'Erro ao salvar o estudo. Tente novamente.';
      }
    });
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
        this.mensagemAvancoCiclo = undefined;
        this.blocosService.notificarBlocosAlterados();
      },
      error: (err) => {
        const msg = err?.error?.message
          || 'Estudo salvo, mas o tempo minimo para avancar o modulo ainda nao foi atingido.';
        this.mensagemAvancoCiclo = msg;
        setTimeout(() => (this.mensagemAvancoCiclo = undefined), 5000);
      }
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

    if (!topico || topico.hasFilhos) {
      return;
    }

    this.splitTopico = topico;
    this.splitNovos = ['', ''];
    this.splitErro = undefined;
    this.splitSalvando = false;
    this.mostrarModalSplit = true;
  }

  fecharModalSplit(): void {
    this.mostrarModalSplit = false;
    this.splitTopico = null;
    this.splitNovos = [];
    this.splitErro = undefined;
    this.splitSalvando = false;
  }

  adicionarSplitLinha(): void {
    this.splitNovos.push('');
  }

  removerSplitLinha(index: number): void {
    if (this.splitNovos.length <= 2) {
      return;
    }
    this.splitNovos.splice(index, 1);
  }

  trackByIndex(index: number): number {
    return index;
  }

  salvarSplit(): void {
    if (!this.splitTopico || !this.splitTopico.id) {
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

    for (const item of this.splitNovos) {
      const valor = (item || '').trim();
      if (!valor) {
        continue;
      }
      const chave = valor.toLowerCase();
      if (chave === tituloChave) {
        continue;
      }
      if (usados.has(chave)) {
        continue;
      }
      usados.add(chave);
      limpos.push(valor);
    }

    if (limpos.length < 2) {
      this.splitErro = 'Informe pelo menos dois subtopicos diferentes do titulo do topico pai.';
      return;
    }

    this.splitErro = undefined;
    this.splitSalvando = true;

    this.salaEstudoService
      .splitSubtopico(this.splitTopico.id, {
        novosSubtopicos: limpos,
        novoTituloPai: tituloPai,
        desativarOriginal: false
      })
      .subscribe({
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
          console.error('[SALA-ESTUDO] Erro ao quebrar subtopico:', err);
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

    if (!this.flashcardFrente || !this.flashcardVerso) {
      alert('Preencha frente e verso do flashcard.');
      return;
    }

    const payload: FlashcardDTO = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      frente: this.flashcardFrente,
      verso: this.flashcardVerso,
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
    const lista = this.getTopicosFolha();
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
    const lista = this.getTopicosFolha();
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

          if (proxima) {
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

    let alvo: any | undefined;
    if (this.topicoIdPreferido) {
      const candidato = this.topicos.find(t => t.id === this.topicoIdPreferido);
      if (candidato && !candidato.hasFilhos) {
        alvo = candidato;
      }
    }

    if (!alvo) {
      const folhas = this.topicos.filter(t => !t.hasFilhos && t.ativo !== false);
      if (this.autoSelecionarUltimoNaoEstudado && folhas.length) {
        const ultimoTopicoId = this.obterUltimoTopicoId();
        if (ultimoTopicoId) {
          const ultimoTopico = folhas.find(t => t.id === ultimoTopicoId);
          if (ultimoTopico) {
            const continuar = window.confirm('Continuar de onde parou?');
            if (continuar) {
              if (this.isTopicoFinalizado(ultimoTopico)) {
                const proximo = this.obterProximoTopicoApos(folhas, ultimoTopico.id);
                alvo = proximo || this.obterPrimeiroNaoEstudado(folhas) || ultimoTopico;
              } else {
                alvo = ultimoTopico;
              }
            }
          }
        }
      }

      if (alvo) {
        this.selecionarTopico(alvo);
        this.selecionouTopicoInicial = true;
        return;
      }
      if (this.autoSelecionarUltimoNaoEstudado && folhas.length) {
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
      } else {
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
    if (this.timerAtivo) {
      this.timerAtivo = false;
      this.pararTimerInterno();
      this.revisaoAutoExplicacaoAtiva = false;
    }
    if (this.temTempoNaoSalvo()) {
      this.salvarEstudo();
    }
    const topicoId = this.topicoSelecionado?.id;
    if (!topicoId) {
      return;
    }
    this.salaEstudoService.finalizarTopico(topicoId).subscribe({
      next: () => {
        this.topicosFinalizados.add(topicoId);
        this.mensagemTopicoFinalizado = 'Topico finalizado.';
        setTimeout(() => (this.mensagemTopicoFinalizado = undefined), 4000);
      },
      error: () => {
        this.mensagemTopicoFinalizado = 'Nao foi possivel finalizar o topico.';
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
      return 'SEM';
    }
    return info.status ?? 'SEM';
  }

  /**
   * Status consolidado do t+�pico na +�RVORE:
   * considera o pr+�prio id + todos os subtopicos.
   */
  private getStatusRevisaoTopicoNaArvore(dto: any): StatusRevisao {
    let pior: StatusRevisao = this.getStatusSimplesTopico(dto.id);

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

    return this.getStatusRevisaoTopicoNaArvore(dto);
  }

  /** Classes CSS para a bolinha da Sala de Estudo */
  temEstudoNoTopico(t: any): boolean {
    return this.getStatusRevisaoTopicoView(t) !== 'SEM';
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
private recarregarTopicosAposRevisao(): void {
  if (!this.materiaId) {
    return;
  }

  const idSelecionado = this.topicoSelecionado?.id;

  // 1) Atualiza o mapa de revisões (daqui que vem o semáforo)
  this.carregarRevisoesDashboard();

  // 2) Recarrega a árvore de tópicos (efeito "F5" na coluna esquerda)
  this.materiaService.listarTopicos(this.materiaId).subscribe({
    next: (lista) => {
      const listaSegura = lista || [];
      console.log('[SALA-ESTUDO] Recarregando tópicos após revisão:', listaSegura);
      this.arvoreTopicos = listaSegura;
      this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

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
private mostrarMensagemRevisao(texto: string): void {
  this.mensagemRevisao = texto;
  setTimeout(() => {
    this.mensagemRevisao = undefined;
  }, 4000);
}


}





















