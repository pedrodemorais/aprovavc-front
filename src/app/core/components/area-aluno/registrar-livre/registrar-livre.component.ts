import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Observable, of, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap, tap } from 'rxjs/operators';
import { EstudoLivreService } from '../services/estudo-livre.service';
import { MateriaTopicosDTO, SalaEstudoService, TopicoNodeDTO, VocabularioDTO } from '../services/sala-estudo.service';
import { EditalService } from '../services/edital.service';
import { MateriaService } from '../services/materia.service';
import { FlashcardService } from '../services/flashcard.service';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { CadernoErroFonte, CadernoErroPayload, CadernoErrosService } from '../services/caderno-erros.service';

interface EstruturaCriada {
  materiaNome: string;
  topicoNome: string;
  subtopicoNome?: string;
}

type CampoAutocomplete = 'agrupador' | 'materiaNome' | 'topicoNome' | 'subtopicoNome';

interface HistoricoRegistroLivre {
  agrupadores: string[];
  materias: string[];
  topicos: string[];
  subtopicos: string[];
}

interface EditalCatalogoItem {
  nome: string;
  key: string;
}

type TopicoFlatNode = {
  id: number;
  descricao: string;
  parentId: number | null;
  nivel: number;
  hasFilhos: boolean;
  ativo: boolean;
};

type QuillEditorLike = {
  clipboard?: { addMatcher: (tag: string, matcher: () => { ops: unknown[] }) => void };
  on?: (name: string, handler: (range: { index: number; length: number } | null) => void) => void;
  getLength?: () => number;
  deleteText?: (index: number, length: number, source?: string) => void;
  root?: HTMLElement;
};

@Component({
  selector: 'app-registrar-livre',
  templateUrl: './registrar-livre.component.html',
  styleUrls: ['./registrar-livre.component.css']
})
export class RegistrarLivreComponent implements AfterViewInit, OnDestroy {
  private readonly historicoKey = 'registrar-livre:historico-v1';
  private readonly limiteSugestoes = 8;
  private readonly limiteSugestoesAgrupador = 20;

  private agrupadoresHistorico: string[] = [];
  private agrupadoresCatalogo: string[] = [];
  private editaisCatalogo: EditalCatalogoItem[] = [];
  private materiasCatalogo: string[] = [];
  private materiaIdPorNomeKey = new Map<string, number>();
  private topicosCatalogo: string[] = [];
  private subtopicosCatalogo: string[] = [];
  private topicosPorMateria = new Map<string, string[]>();
  private subtopicosPorMateria = new Map<string, string[]>();
  private subtopicosPorMateriaTopico = new Map<string, string[]>();
  private materiasPorEdital = new Map<string, string[]>();
  private topicosPorEdital = new Map<string, string[]>();
  private topicosPorEditalMateria = new Map<string, string[]>();
  private subtopicosPorEditalMateria = new Map<string, string[]>();
  private subtopicosPorEditalMateriaTopico = new Map<string, string[]>();
  private usandoFallbackLocal = false;
  private quillObservacao?: QuillEditorLike;
  private ajustandoLimiteCaracteres = false;
  private timerRef?: ReturnType<typeof setInterval>;
  private timerBaseMs: number | null = null;
  private pomodoroFaseInicioMs: number | null = null;
  private preencherResumoSub?: Subscription;
  private bloqueioCamposSub?: Subscription;
  private resumoLookupSeq = 0;
  private contextoResumoAutoPreenchido = '';
  private ultimaSelecaoAutocompleteMs = 0;
  private focoInicialAplicado = false;

  readonly maxCaracteres = 1200;
  readonly form = this.fb.group({
    agrupador: ['', [Validators.required]],
    materiaNome: ['', [Validators.required]],
    topicoNome: ['', [Validators.required]],
    subtopicoNome: [''],
    tempoMinutos: [30, [Validators.required, Validators.min(1), Validators.max(1440)]],
    observacao: [''],
    finalizado: [false]
  });

  enviando = false;
  finalizandoTopico = false;
  feedbackErro = '';
  feedbackSucesso = '';
  feedbackMateria = '';
  estruturaCriada: EstruturaCriada | null = null;
  observacaoHtml = '';
  caracteresUsados = 0;
  caracteresRestantes = this.maxCaracteres;
  timerModo: 'livre' | 'pomodoro' = 'livre';
  timerRodando = false;
  tempoLivreSegundos = 0;
  pomodoroDuracaoFoco = 1500;
  pomodoroDuracaoPausaCurta = 300;
  pomodoroDuracaoPausaLonga = 900;
  pomodoroCiclosParaLonga = 4;
  pomodoroFase: 'foco' | 'pausa-curta' | 'pausa-longa' = 'foco';
  pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
  pomodoroCiclosConcluidos = 0;
  tempoManual = '';
  flashcardFrente = '';
  flashcardVerso = '';
  flashcardTipo = 'PERGUNTA_RESPOSTA';
  flashcardDificuldade = 'MEDIA';
  flashcardTags = '';
  flashcardVerdadeiroFalso: 'VERDADEIRO' | 'FALSO' | null = null;
  maxFlashcardFrente = 120;
  maxFlashcardVerso = 200;
  salvandoFlashcard = false;
  mensagemFlashcardSucesso = '';
  mensagemFlashcardErro = '';
  mostrarModalFlashcard = false;
  private vocabulariosReqSeq = 0;
  mostrarModalVocabulario = false;
  vocabularioTermo = '';
  vocabularioDefinicao = '';
  vocabularioTags = '';
  vocabularioListaTexto = '';
  maxVocabularioChars = 80;
  vocabularios: VocabularioDTO[] = [];
  carregandoVocabularios = false;
  erroVocabularios = '';
  salvandoVocabulario = false;
  salvandoListaVocabulario = false;
  mensagemVocabularioSucesso = '';
  vocabularioModo: 'lista' | 'revisar' = 'lista';
  vocabularioIndexAtual = 0;
  vocabularioMostrarDefinicao = false;
  mostrarModalCaderno = false;
  salvandoCaderno = false;
  mensagemCadernoSucesso = '';
  mensagemCadernoErro = '';
  mostrarModalNovoAgrupador = false;
  novoAgrupadorDescricao = '';
  salvandoNovoAgrupador = false;
  erroNovoAgrupador = '';
  sucessoNovoAgrupador = '';
  mostrarModalNovaMateria = false;
  novaMateriaDescricao = '';
  salvandoNovaMateria = false;
  erroNovaMateria = '';
  sucessoNovaMateria = '';
  mostrarModalNovoTopico = false;
  novoTopicoDescricao = '';
  salvandoNovoTopico = false;
  erroNovoTopico = '';
  sucessoNovoTopico = '';
  mostrarModalNovoSubtopico = false;
  novoSubtopicoDescricao = '';
  salvandoNovoSubtopico = false;
  erroNovoSubtopico = '';
  sucessoNovoSubtopico = '';
  cadernoMaterias: MateriaTopicosDTO[] = [];
  cadernoTopicosFlat: TopicoFlatNode[] = [];
  cadernoTopicosPrincipais: TopicoFlatNode[] = [];
  cadernoSubtopicosOpcoes: TopicoFlatNode[] = [];
  cadernoForm: {
    id: number | null;
    materiaId: number | null;
    topicoId: number | null;
    subtopicoId: number | null;
    titulo: string;
    descricaoErro: string;
    causaRaiz: string;
    correcao: string;
    fonte: CadernoErroFonte;
    dataErro: string;
    tagsTexto: string;
    questaoId: number | null;
    simuladoId: number | null;
    tentativaId: number | null;
  } = this.novoFormCaderno();
  sugestoesVisiveis: Record<CampoAutocomplete, string[]> = {
    agrupador: [],
    materiaNome: [],
    topicoNome: [],
    subtopicoNome: []
  };

  constructor(
    private fb: FormBuilder,
    private estudoLivreService: EstudoLivreService,
    private salaEstudoService: SalaEstudoService,
    private editalService: EditalService,
    private materiaService: MateriaService,
    private flashcardService: FlashcardService,
    private cadernoErrosService: CadernoErrosService
  ) {}

  ngAfterViewInit(): void {
    this.carregarDadosAutocomplete();
    this.carregarEditaisAgrupador();
    this.iniciarBloqueioCamposDependentes();
    this.iniciarPreenchimentoResumoExistente();
  }

  ngOnDestroy(): void {
    this.bloqueioCamposSub?.unsubscribe();
    this.preencherResumoSub?.unsubscribe();
    this.pararIntervaloTimer();
  }

  get materiaInvalida(): boolean {
    if (this.materiaBloqueada) return false;
    const control = this.form.controls.materiaNome;
    return control.invalid && (control.touched || control.dirty);
  }

  get agrupadorInvalido(): boolean {
    const control = this.form.controls.agrupador;
    return control.invalid && (control.touched || control.dirty);
  }

  get topicoInvalido(): boolean {
    if (this.topicoBloqueado) return false;
    const control = this.form.controls.topicoNome;
    return control.invalid && (control.touched || control.dirty);
  }

  get materiaBloqueada(): boolean {
    return !String(this.form.controls.agrupador.value || '').trim();
  }

  get topicoBloqueado(): boolean {
    return !String(this.form.controls.materiaNome.value || '').trim();
  }

  get subtopicoBloqueado(): boolean {
    return !String(this.form.controls.topicoNome.value || '').trim();
  }

  get tempoInvalido(): boolean {
    const control = this.form.controls.tempoMinutos;
    return control.invalid && (control.touched || control.dirty);
  }

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

  get tempoEstudoFormatado(): string {
    const totalSegundos = this.timerModo === 'livre' ? this.tempoLivreSegundos : this.pomodoroSegundosRestantes;
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    return `${this.pad2(horas)}:${this.pad2(minutos)}:${this.pad2(segundos)}`;
  }

  get timerDisplayLabel(): string {
    if (this.timerModo === 'livre') return 'Tempo de estudo';
    return `Pomodoro (${this.labelFasePomodoro})`;
  }

  get podeZerarTimer(): boolean {
    if (this.timerModo === 'livre') return this.tempoLivreSegundos > 0;
    return this.pomodoroSegundosRestantes !== this.duracaoFaseAtual;
  }

  get podeAplicarTempoTimer(): boolean {
    return this.getSegundosEstudoTimer() > 0;
  }

  onTempoManualInput(valor: string): void {
    this.tempoManual = String(valor || '').replace(/[^\d:]/g, '').slice(0, 8);
  }

  onTempoManualBlur(): void {
    const segundos = this.parseTempoManualParaSegundos(this.tempoManual);
    if (segundos === null) {
      this.tempoManual = '';
      return;
    }
    this.tempoManual = this.formatarSegundos(segundos);
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

  limparFormularioFlashcard(): void {
    this.flashcardFrente = '';
    this.flashcardVerso = '';
    this.flashcardTipo = 'PERGUNTA_RESPOSTA';
    this.flashcardDificuldade = 'MEDIA';
    this.flashcardTags = '';
    this.flashcardVerdadeiroFalso = null;
    this.mensagemFlashcardErro = '';
    this.mensagemFlashcardSucesso = '';
  }

  abrirModalFlashcard(): void {
    this.mensagemFlashcardErro = '';
    this.mensagemFlashcardSucesso = '';
    this.mostrarModalFlashcard = true;
  }

  fecharModalFlashcard(): void {
    this.mostrarModalFlashcard = false;
  }

  abrirModalVocabulario(modo: 'lista' | 'revisar' = 'lista'): void {
    if (!this.podeUsarAcoesResumo) return;
    if (modo === 'revisar' && !this.podeAbrirRevisaoVocabulario) return;
    this.mostrarModalVocabulario = true;
    this.resetVocabularioForm();
    this.vocabularioModo = modo;
    this.carregarVocabularios();
  }

  fecharModalVocabulario(): void {
    this.mostrarModalVocabulario = false;
    this.erroVocabularios = '';
    this.mensagemVocabularioSucesso = '';
  }

  abrirModalCadernoErros(): void {
    if (!this.podeUsarAcoesResumo) return;
    this.mensagemCadernoErro = '';
    this.mensagemCadernoSucesso = '';
    this.mostrarModalCaderno = true;
    this.cadernoForm = this.novoFormCaderno();
    this.carregarMateriasCadernoComPreselecao();
  }

  fecharModalCadernoErros(): void {
    this.mostrarModalCaderno = false;
    this.mensagemCadernoErro = '';
    this.mensagemCadernoSucesso = '';
  }

  fecharModalFeedbackSucesso(): void {
    this.feedbackSucesso = '';
  }

  abrirModalNovoAgrupador(event?: MouseEvent): void {
    if (this.deveIgnorarCliqueAposSelecaoAutocomplete(event)) return;
    this.mostrarModalNovoAgrupador = true;
    this.novoAgrupadorDescricao = '';
    this.erroNovoAgrupador = '';
    this.sucessoNovoAgrupador = '';
  }

  fecharModalNovoAgrupador(): void {
    this.mostrarModalNovoAgrupador = false;
    this.novoAgrupadorDescricao = '';
    this.erroNovoAgrupador = '';
    this.sucessoNovoAgrupador = '';
  }

  salvarNovoAgrupador(): void {
    const descricao = this.normalizarTexto(this.novoAgrupadorDescricao);
    if (!descricao) {
      this.erroNovoAgrupador = 'Informe o nome do estudo.';
      return;
    }

    if (descricao.length > 120) {
      this.erroNovoAgrupador = 'Use no maximo 120 caracteres.';
      return;
    }

    const jaExiste = this.editaisCatalogo.some((item) => item.key === this.toKey(descricao));
    if (jaExiste) {
      this.erroNovoAgrupador = 'Esse estudo ja existe na lista.';
      return;
    }

    this.salvandoNovoAgrupador = true;
    this.erroNovoAgrupador = '';
    this.sucessoNovoAgrupador = '';

    this.editalService.criar({ nome: descricao, materiasIds: [] }).pipe(
      catchError(() => of(null)),
      finalize(() => (this.salvandoNovoAgrupador = false))
    ).subscribe((resultado) => {
      if (!resultado) {
        this.erroNovoAgrupador = 'Nao foi possivel cadastrar o estudo agora.';
        return;
      }

      // Ao criar um novo estudo, sempre reinicia o contexto de materia/topico
      // para evitar reaproveitar selecoes do estudo anterior.
      this.feedbackMateria = '';
      this.form.controls.materiaNome.setValue('', { emitEvent: false });
      this.form.controls.topicoNome.setValue('', { emitEvent: false });
      this.form.controls.subtopicoNome.setValue('', { emitEvent: false });
      this.sincronizarBloqueioCamposDependentes();

      this.adicionarAgrupadorAoCatalogoLocal(descricao);
      this.onCampoSelecionado('agrupador', descricao);
      this.atualizarSugestoes('agrupador');
      this.atualizarSugestoes('materiaNome');
      this.atualizarSugestoes('topicoNome');
      this.atualizarSugestoes('subtopicoNome');

      this.sucessoNovoAgrupador = 'Estudo cadastrado com sucesso.';
      setTimeout(() => {
        this.fecharModalNovoAgrupador();
        this.focarCampo('materiaNome');
      }, 500);
    });
  }

  abrirModalNovaMateria(event?: MouseEvent): void {
    if (this.deveIgnorarCliqueAposSelecaoAutocomplete(event)) return;
    if (!this.podeCadastrarMateria) return;
    this.mostrarModalNovaMateria = true;
    this.novaMateriaDescricao = '';
    this.erroNovaMateria = '';
    this.sucessoNovaMateria = '';
  }

  fecharModalNovaMateria(): void {
    this.mostrarModalNovaMateria = false;
    this.novaMateriaDescricao = '';
    this.erroNovaMateria = '';
    this.sucessoNovaMateria = '';
  }

  salvarNovaMateria(): void {
    const descricao = this.normalizarTexto(this.novaMateriaDescricao);
    if (!descricao) {
      this.erroNovaMateria = 'Informe o nome da materia.';
      return;
    }

    if (descricao.length > 120) {
      this.erroNovaMateria = 'Use no maximo 120 caracteres.';
      return;
    }

    const estudoSelecionado = this.getEditalSelecionadoExato();
    if (!estudoSelecionado) {
      this.erroNovaMateria = 'Selecione um estudo antes de cadastrar a materia.';
      return;
    }

    const jaExiste = (this.obterBaseSugestoes('materiaNome') || [])
      .some((item) => this.toKey(item) === this.toKey(descricao));
    if (jaExiste) {
      this.erroNovaMateria = 'Essa materia ja existe para o estudo selecionado.';
      return;
    }

    this.salvandoNovaMateria = true;
    this.erroNovaMateria = '';
    this.sucessoNovaMateria = '';

    this.materiaService.salvarMateria({ nome: descricao }).pipe(
      switchMap((materiaCriada) =>
        this.garantirEditalDoAgrupador(estudoSelecionado.nome, descricao).pipe(
          map(() => materiaCriada),
          catchError(() => of(materiaCriada))
        )
      ),
      catchError(() => of(null)),
      finalize(() => (this.salvandoNovaMateria = false))
    ).subscribe((resultado) => {
      if (!resultado) {
        this.erroNovaMateria = 'Nao foi possivel cadastrar a materia agora.';
        return;
      }

      this.adicionarMateriaAoCatalogoLocal(descricao, estudoSelecionado.nome, Number((resultado as any)?.id || 0));
      this.onCampoSelecionado('materiaNome', descricao);
      this.atualizarSugestoes('materiaNome');
      this.materiaService.notificarMateriasAlteradas();

      this.sucessoNovaMateria = 'Materia cadastrada com sucesso.';
      setTimeout(() => {
        this.fecharModalNovaMateria();
        this.focarCampo('topicoNome');
      }, 500);
    });
  }

  abrirModalNovoTopico(event?: MouseEvent): void {
    if (this.deveIgnorarCliqueAposSelecaoAutocomplete(event)) return;
    if (!this.podeCadastrarTopico) return;
    this.mostrarModalNovoTopico = true;
    this.novoTopicoDescricao = '';
    this.erroNovoTopico = '';
    this.sucessoNovoTopico = '';
  }

  fecharModalNovoTopico(): void {
    this.mostrarModalNovoTopico = false;
    this.novoTopicoDescricao = '';
    this.erroNovoTopico = '';
    this.sucessoNovoTopico = '';
  }

  salvarNovoTopico(): void {
    const descricao = this.normalizarTexto(this.novoTopicoDescricao);
    if (!descricao) {
      this.erroNovoTopico = 'Informe a descricao do topico.';
      return;
    }

    if (descricao.length > 160) {
      this.erroNovoTopico = 'Use no maximo 160 caracteres.';
      return;
    }

    const topicoExistente = (this.obterBaseSugestoes('topicoNome') || [])
      .some((item) => this.toKey(item) === this.toKey(descricao));
    if (topicoExistente) {
      this.erroNovoTopico = 'Esse topico ja existe para a materia selecionada.';
      return;
    }

    this.salvandoNovoTopico = true;
    this.erroNovoTopico = '';
    this.sucessoNovoTopico = '';

    this.resolverContextoMateriaSelecionada().pipe(
      switchMap((ctx) => {
        if (!ctx) {
          this.erroNovoTopico = 'Selecione uma materia valida antes de cadastrar o topico.';
          return of(null);
        }

        return this.materiaService.salvarTopico(ctx.materiaId, {
          descricao,
          ativo: true,
          topicoPaiId: null
        }).pipe(
          map((res) => ({ ok: true as const, res, ctx })),
          catchError(() => of({ ok: false as const, res: null, ctx }))
        );
      }),
      finalize(() => (this.salvandoNovoTopico = false))
    ).subscribe((resultado) => {
      if (!resultado || !('ok' in resultado) || !resultado.ok) {
        if (!this.erroNovoTopico) {
          this.erroNovoTopico = 'Nao foi possivel cadastrar o topico agora.';
        }
        return;
      }

      this.adicionarTopicoAoCatalogoLocal(descricao, resultado.ctx.materiaNome);
      this.onCampoSelecionado('topicoNome', descricao);
      this.atualizarSugestoes('topicoNome');
      this.materiaService.notificarMateriasAlteradas();

      this.sucessoNovoTopico = 'Topico cadastrado com sucesso.';
      setTimeout(() => {
        this.fecharModalNovoTopico();
        this.focarCampo('subtopicoNome');
      }, 500);
    });
  }

  abrirModalNovoSubtopico(event?: MouseEvent): void {
    if (this.deveIgnorarCliqueAposSelecaoAutocomplete(event)) return;
    if (!this.podeCadastrarSubtopico) return;
    this.mostrarModalNovoSubtopico = true;
    this.novoSubtopicoDescricao = '';
    this.erroNovoSubtopico = '';
    this.sucessoNovoSubtopico = '';
  }

  fecharModalNovoSubtopico(): void {
    this.mostrarModalNovoSubtopico = false;
    this.novoSubtopicoDescricao = '';
    this.erroNovoSubtopico = '';
    this.sucessoNovoSubtopico = '';
  }

  salvarNovoSubtopico(): void {
    const descricao = this.normalizarTexto(this.novoSubtopicoDescricao);
    if (!descricao) {
      this.erroNovoSubtopico = 'Informe a descricao do subtopico.';
      return;
    }

    if (descricao.length > 160) {
      this.erroNovoSubtopico = 'Use no maximo 160 caracteres.';
      return;
    }

    const materiaNome = this.getMateriaSelecionadaExata();
    const topicoNome = this.getTopicoSelecionadoExato();
    if (!materiaNome || !topicoNome) {
      this.erroNovoSubtopico = 'Selecione materia e topico antes de cadastrar o subtopico.';
      return;
    }

    const subExistente = (this.obterBaseSugestoes('subtopicoNome') || [])
      .some((item) => this.toKey(item) === this.toKey(descricao));
    if (subExistente) {
      this.erroNovoSubtopico = 'Esse subtopico ja existe para o topico selecionado.';
      return;
    }

    this.salvandoNovoSubtopico = true;
    this.erroNovoSubtopico = '';
    this.sucessoNovoSubtopico = '';

    this.resolverContextoMateriaTopicoSelecionado().pipe(
      switchMap((ctx) => {
        if (!ctx) {
          this.erroNovoSubtopico = 'Nao foi possivel identificar materia/topico selecionados.';
          return of(null);
        }
        return this.materiaService.salvarTopico(ctx.materiaId, {
          descricao,
          ativo: true,
          topicoPaiId: ctx.topicoId
        }).pipe(
          map((res) => ({ ok: true, res, ctx })),
          catchError(() => of({ ok: false as const, res: null, ctx }))
        );
      }),
      finalize(() => (this.salvandoNovoSubtopico = false))
    ).subscribe((resultado) => {
      if (!resultado || !('ok' in resultado) || !resultado.ok) {
        if (!this.erroNovoSubtopico) {
          this.erroNovoSubtopico = 'Nao foi possivel cadastrar o subtopico agora.';
        }
        return;
      }

      this.adicionarSubtopicoAoCatalogoLocal(descricao, resultado.ctx.materiaNome, resultado.ctx.topicoNome);
      this.onCampoSelecionado('subtopicoNome', descricao);
      this.atualizarSugestoes('subtopicoNome');
      this.materiaService.notificarMateriasAlteradas();

      this.sucessoNovoSubtopico = 'Subtopico cadastrado com sucesso.';
      setTimeout(() => {
        this.fecharModalNovoSubtopico();
        this.focarCampoObservacao();
      }, 500);
    });
  }

  novoCadernoErro(): void {
    const materiaAtual = this.cadernoForm.materiaId;
    this.cadernoForm = this.novoFormCaderno(materiaAtual || undefined);
    this.cadernoTopicosFlat = [];
    this.cadernoTopicosPrincipais = [];
    this.cadernoSubtopicosOpcoes = [];
    if (this.cadernoForm.materiaId) {
      this.onCadernoMateriaChange();
    }
  }

  onCadernoMateriaChange(topicoIdPreferido?: number, subtopicoIdPreferido?: number): void {
    const materiaId = Number(this.cadernoForm.materiaId || 0);
    this.cadernoForm.topicoId = null;
    this.cadernoForm.subtopicoId = null;
    this.cadernoTopicosFlat = [];
    this.cadernoTopicosPrincipais = [];
    this.cadernoSubtopicosOpcoes = [];

    if (!materiaId) return;

    const materia = this.cadernoMaterias.find((m) => Number(m.materiaId || 0) === materiaId);
    if (!materia) return;

    const flat = this.normalizarArvoreCaderno(materia.topicos || [], null, 0, []);
    this.cadernoTopicosFlat = flat;
    this.cadernoTopicosPrincipais = flat.filter((n) => !n.parentId && n.ativo !== false);

    if (topicoIdPreferido || subtopicoIdPreferido) {
      this.preselecionarTopicosCaderno(topicoIdPreferido, subtopicoIdPreferido);
    }
  }

  onCadernoTopicoChange(): void {
    const topicoId = Number(this.cadernoForm.topicoId || 0);
    this.cadernoForm.subtopicoId = null;
    this.cadernoSubtopicosOpcoes = this.cadernoTopicosFlat.filter((n) => n.parentId === topicoId && n.ativo !== false);
  }

  salvarCadernoErro(): void {
    this.mensagemCadernoErro = '';
    this.mensagemCadernoSucesso = '';

    if (
      !this.cadernoForm.materiaId ||
      !this.cadernoForm.topicoId ||
      !(this.cadernoForm.titulo || '').trim() ||
      !(this.cadernoForm.descricaoErro || '').trim()
    ) {
      this.mensagemCadernoErro = 'Preencha matéria, tópico, título e descrição do erro.';
      return;
    }

    const payload: CadernoErroPayload = {
      materiaId: Number(this.cadernoForm.materiaId),
      topicoId: Number(this.cadernoForm.topicoId),
      subtopicoId: this.cadernoForm.subtopicoId ? Number(this.cadernoForm.subtopicoId) : null,
      titulo: String(this.cadernoForm.titulo || '').trim(),
      descricaoErro: String(this.cadernoForm.descricaoErro || '').trim(),
      causaRaiz: String(this.cadernoForm.causaRaiz || '').trim() || null,
      correcao: String(this.cadernoForm.correcao || '').trim() || null,
      fonte: this.cadernoForm.fonte,
      dataErro: this.cadernoForm.dataErro || this.hojeISO(),
      tags: this.parseTagsCaderno(this.cadernoForm.tagsTexto),
      questaoId: this.cadernoForm.questaoId || null,
      simuladoId: this.cadernoForm.simuladoId || null,
      tentativaId: this.cadernoForm.tentativaId || null
    };

    this.salvandoCaderno = true;
    this.cadernoErrosService.criar(payload).pipe(
      finalize(() => (this.salvandoCaderno = false))
    ).subscribe({
      next: () => {
        this.mensagemCadernoSucesso = 'Registro salvo com sucesso.';
        this.novoCadernoErro();
        setTimeout(() => (this.mensagemCadernoSucesso = ''), 3000);
      },
      error: (err) => {
        this.mensagemCadernoErro = err?.error?.message || 'Não foi possível salvar o registro.';
      }
    });
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
    const reqSeq = ++this.vocabulariosReqSeq;
    this.carregandoVocabularios = true;
    this.erroVocabularios = '';

    this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((ids) => {
        if (!ids) {
          return of({ ok: false, lista: [] as VocabularioDTO[], semContexto: true });
        }
        return this.salaEstudoService.listarVocabularios(ids.topicoId).pipe(
          map((lista) => ({ ok: true, lista: lista || [] })),
          catchError(() => of({ ok: false, lista: [] as VocabularioDTO[], semContexto: false }))
        );
      }),
      finalize(() => {
        if (reqSeq === this.vocabulariosReqSeq) {
          this.carregandoVocabularios = false;
        }
      })
    ).subscribe((resp) => {
      if (reqSeq !== this.vocabulariosReqSeq) return;

      if (!resp.ok) {
        this.vocabularios = [];
        if (!('semContexto' in resp) || !resp.semContexto) {
          this.erroVocabularios = 'Erro ao carregar vocabulario.';
        }
        return;
      }

      this.vocabularios = resp.lista;
      if (this.vocabularioIndexAtual >= this.vocabularios.length) {
        this.vocabularioIndexAtual = 0;
        this.vocabularioMostrarDefinicao = false;
      }
    });
  }

  get podeAbrirRevisaoVocabulario(): boolean {
    return !!(this.podeUsarAcoesResumo && !this.carregandoVocabularios && this.vocabularios.length);
  }

  salvarVocabulario(): void {
    const termo = (this.vocabularioTermo || '').trim();
    const definicao = (this.vocabularioDefinicao || '').trim();

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

    this.salvandoVocabulario = true;
    this.erroVocabularios = '';
    this.mensagemVocabularioSucesso = '';

    this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((ids) => {
        if (!ids) {
          this.erroVocabularios = 'Informe materia e topico validos para salvar o vocabulario.';
          return of(null);
        }

        return this.salaEstudoService.criarVocabulario({
          materiaId: ids.materiaId,
          topicoId: ids.topicoId,
          termo,
          definicao,
          tags: this.vocabularioTags?.trim() || undefined
        }).pipe(
          map(() => true),
          catchError(() => of(false))
        );
      }),
      finalize(() => (this.salvandoVocabulario = false))
    ).subscribe((salvo) => {
      if (!salvo) {
        if (!this.erroVocabularios) {
          this.erroVocabularios = 'Erro ao salvar vocabulario.';
        }
        return;
      }

      this.vocabularioTermo = '';
      this.vocabularioDefinicao = '';
      this.vocabularioTags = '';
      this.carregarVocabularios();
      this.mensagemVocabularioSucesso = 'Vocabulario salvo!';
      setTimeout(() => (this.mensagemVocabularioSucesso = ''), 3000);
    });
  }

  salvarListaVocabulario(): void {
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
    this.erroVocabularios = '';
    this.mensagemVocabularioSucesso = '';

    this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((ids) => {
        if (!ids) {
          this.erroVocabularios = 'Informe materia e topico validos para importar vocabulario.';
          return of(null);
        }

        const requisicoes = itensValidos.map((item) =>
          this.salaEstudoService.criarVocabulario({
            materiaId: ids.materiaId,
            topicoId: ids.topicoId,
            termo: item.termo,
            definicao: item.definicao,
            tags: this.vocabularioTags?.trim() || undefined
          })
        );

        return forkJoin(requisicoes).pipe(
          map(() => true),
          catchError(() => of(false))
        );
      }),
      finalize(() => (this.salvandoListaVocabulario = false))
    ).subscribe((ok) => {
      if (!ok) {
        if (!this.erroVocabularios) {
          this.erroVocabularios = 'Erro ao importar lista de vocabulario.';
        }
        return;
      }

      this.vocabularioListaTexto = '';
      this.carregarVocabularios();

      const extras: string[] = [];
      if (ignoradosRepetidos > 0) extras.push(`${ignoradosRepetidos} repetidos`);
      if (ignoradosInvalidos > 0) extras.push(`${ignoradosInvalidos} invalidos`);

      const sufixo = extras.length ? ` (${extras.join(', ')} ignorados)` : '';
      this.mensagemVocabularioSucesso = `Lista importada!${sufixo}`;
      setTimeout(() => (this.mensagemVocabularioSucesso = ''), 3000);
    });
  }

  excluirVocabulario(item: VocabularioDTO): void {
    if (!item?.id) return;
    const confirmou = window.confirm('Deseja realmente excluir este vocabulario?');
    if (!confirmou) return;

    this.salaEstudoService.excluirVocabulario(item.id).subscribe({
      next: () => {
        this.vocabularios = this.vocabularios.filter((v) => v.id !== item.id);
        if (this.vocabularioIndexAtual >= this.vocabularios.length) {
          this.vocabularioIndexAtual = 0;
          this.vocabularioMostrarDefinicao = false;
        }
      },
      error: () => {
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

  trackByVocabularioId(index: number, item: VocabularioDTO): number {
    return Number(item?.id ?? index);
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
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const separadores = [' - ', ' : ', '-', ':'];
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

  private carregarMateriasCadernoComPreselecao(): void {
    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
      next: (materias) => {
        this.cadernoMaterias = materias || [];
        const materiaNome = this.normalizarTexto(String(this.form.value.materiaNome || ''));
        const topicoNome = this.normalizarTexto(String(this.form.value.topicoNome || ''));
        const subtopicoNome = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));

        const materia = (this.cadernoMaterias || []).find(
          (m) => this.toKey(String(m?.materiaNome || '')) === this.toKey(materiaNome)
        );

        if (!materia) return;
        this.cadernoForm.materiaId = Number(materia.materiaId || 0) || null;

        const topicosRaiz = Array.isArray(materia.topicos) ? materia.topicos : [];
        const topico = this.encontrarTopicoRaizPorNome(topicosRaiz, topicoNome);
        const subtopico = subtopicoNome ? this.encontrarTopicoPorNome(this.extrairFilhosBusca(topico || {} as TopicoNodeDTO), subtopicoNome) : null;

        const topicoIdPreferido = this.getTopicoId(topico);
        const subtopicoIdPreferido = this.getTopicoId(subtopico);
        this.onCadernoMateriaChange(topicoIdPreferido || undefined, subtopicoIdPreferido || undefined);
      },
      error: () => {
        this.mensagemCadernoErro = 'Não foi possível carregar matérias para o caderno de erros.';
      }
    });
  }

  private normalizarArvoreCaderno(
    lista: TopicoNodeDTO[],
    parentId: number | null,
    nivel: number,
    acc: TopicoFlatNode[]
  ): TopicoFlatNode[] {
    for (const item of lista || []) {
      const filhos = this.extrairFilhosBusca(item);
      const id = this.getTopicoId(item);
      if (!id) continue;

      acc.push({
        id,
        descricao: String(item?.descricao || ''),
        parentId,
        nivel,
        hasFilhos: filhos.length > 0,
        ativo: item?.ativo !== false
      });

      if (filhos.length) {
        this.normalizarArvoreCaderno(filhos, id, nivel + 1, acc);
      }
    }
    return acc;
  }

  private preselecionarTopicosCaderno(topicoIdPreferido?: number, subtopicoIdPreferido?: number): void {
    if (subtopicoIdPreferido) {
      const sub = this.cadernoTopicosFlat.find((n) => n.id === subtopicoIdPreferido);
      if (sub && sub.parentId) {
        this.cadernoForm.topicoId = sub.parentId;
        this.onCadernoTopicoChange();
        this.cadernoForm.subtopicoId = sub.id;
        return;
      }
    }

    if (topicoIdPreferido) {
      const achado = this.cadernoTopicosFlat.find((n) => n.id === topicoIdPreferido);
      if (!achado) return;
      if (achado.parentId) {
        this.cadernoForm.topicoId = achado.parentId;
        this.onCadernoTopicoChange();
        this.cadernoForm.subtopicoId = achado.id;
        return;
      }
      this.cadernoForm.topicoId = achado.id;
      this.onCadernoTopicoChange();
    }
  }

  private novoFormCaderno(materiaId?: number): {
    id: number | null;
    materiaId: number | null;
    topicoId: number | null;
    subtopicoId: number | null;
    titulo: string;
    descricaoErro: string;
    causaRaiz: string;
    correcao: string;
    fonte: CadernoErroFonte;
    dataErro: string;
    tagsTexto: string;
    questaoId: number | null;
    simuladoId: number | null;
    tentativaId: number | null;
  } {
    return {
      id: null,
      materiaId: materiaId || null,
      topicoId: null,
      subtopicoId: null,
      titulo: '',
      descricaoErro: '',
      causaRaiz: '',
      correcao: '',
      fonte: 'MANUAL',
      dataErro: this.hojeISO(),
      tagsTexto: '',
      questaoId: null,
      simuladoId: null,
      tentativaId: null
    };
  }

  private parseTagsCaderno(texto: string): string[] {
    return (texto || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => !!t)
      .slice(0, 15);
  }

  private hojeISO(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  salvarFlashcard(): void {
    this.mensagemFlashcardErro = '';
    this.mensagemFlashcardSucesso = '';

    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) {
        this.mensagemFlashcardErro = 'Selecione se a resposta e verdadeira ou falsa.';
        return;
      }
      this.flashcardVerso = this.flashcardVerdadeiroFalso;
    }

    const frente = (this.flashcardFrente || '').trim();
    const verso = (this.flashcardVerso || '').trim();

    if (!frente || !verso) {
      this.mensagemFlashcardErro = 'Preencha frente e verso do flashcard.';
      return;
    }

    if (frente.length > this.maxFlashcardFrente) {
      this.mensagemFlashcardErro = `A pergunta deve ter no maximo ${this.maxFlashcardFrente} caracteres.`;
      return;
    }

    if (verso.length > this.maxFlashcardVerso) {
      this.mensagemFlashcardErro = `A resposta deve ter no maximo ${this.maxFlashcardVerso} caracteres.`;
      return;
    }

    this.salvandoFlashcard = true;
    this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((ids) => {
        if (!ids) {
          this.mensagemFlashcardErro = 'Informe materia/topico validos para salvar o flashcard.';
          return of(null);
        }

        const payload: FlashcardDTO = {
          materiaId: ids.materiaId,
          topicoId: ids.topicoId,
          frente,
          verso,
          tipo: this.flashcardTipo as unknown as FlashcardDTO['tipo'],
          dificuldade: this.flashcardDificuldade as unknown as FlashcardDTO['dificuldade'],
          tags: this.formatarTagsFlashcard(this.flashcardTags)
        };

        return this.flashcardService.criarFlashcard(payload).pipe(
          map(() => payload),
          catchError(() => of(null))
        );
      }),
      finalize(() => (this.salvandoFlashcard = false))
    ).subscribe({
      next: (salvo) => {
        if (!salvo) {
          if (!this.mensagemFlashcardErro) {
            this.mensagemFlashcardErro = 'Erro ao salvar flashcard. Tente novamente.';
          }
          return;
        }

        this.mensagemFlashcardSucesso = 'Flashcard salvo com sucesso.';
        this.flashcardFrente = '';
        this.flashcardVerso = '';
        this.flashcardVerdadeiroFalso = null;
        setTimeout(() => (this.mensagemFlashcardSucesso = ''), 3000);
      },
      error: () => {
        this.mensagemFlashcardErro = 'Erro ao salvar flashcard. Tente novamente.';
      }
    });
  }

  selecionarModoTimer(modo: 'livre' | 'pomodoro'): void {
    if (this.timerModo === modo) return;
    this.pausarTimer();
    this.timerModo = modo;
    if (modo === 'livre') {
      this.tempoLivreSegundos = 0;
      return;
    }
    this.pomodoroFase = 'foco';
    this.pomodoroCiclosConcluidos = 0;
    this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
  }

  alternarTimer(): void {
    if (this.timerRodando) {
      this.pausarTimer();
      return;
    }
    this.iniciarTimer();
  }

  zerarTimer(): void {
    this.pausarTimer();
    if (this.timerModo === 'livre') {
      this.tempoLivreSegundos = 0;
      return;
    }
    this.pomodoroFase = 'foco';
    this.pomodoroCiclosConcluidos = 0;
    this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
  }

  aplicarTempoTimerNoCampo(): void {
    const minutos = Math.max(1, Math.ceil(this.getSegundosEstudoTimer() / 60));
    this.form.controls.tempoMinutos.setValue(minutos);
    this.form.controls.tempoMinutos.markAsDirty();
  }

  private iniciarTimer(): void {
    if (this.timerRodando) return;
    this.timerRodando = true;
    if (this.timerModo === 'livre') {
      this.iniciarTimerLivre();
      return;
    }
    this.iniciarPomodoro();
  }

  private pausarTimer(): void {
    this.timerRodando = false;
    this.pararIntervaloTimer();
  }

  private iniciarTimerLivre(): void {
    this.pararIntervaloTimer();
    this.timerBaseMs = Date.now() - this.tempoLivreSegundos * 1000;
    this.timerRef = setInterval(() => this.atualizarTempoLivre(), 500);
  }

  private iniciarPomodoro(): void {
    this.pararIntervaloTimer();
    this.pomodoroFaseInicioMs = Date.now() - (this.duracaoFaseAtual - this.pomodoroSegundosRestantes) * 1000;
    this.timerRef = setInterval(() => this.atualizarPomodoro(), 500);
  }

  private atualizarTempoLivre(): void {
    if (!this.timerBaseMs) {
      this.timerBaseMs = Date.now();
      return;
    }
    const agora = Date.now();
    this.tempoLivreSegundos = Math.floor((agora - this.timerBaseMs) / 1000);
  }

  private atualizarPomodoro(): void {
    if (!this.pomodoroFaseInicioMs) {
      this.pomodoroFaseInicioMs = Date.now();
      return;
    }
    const agora = Date.now();
    const elapsed = Math.floor((agora - this.pomodoroFaseInicioMs) / 1000);
    const restante = Math.max(0, this.duracaoFaseAtual - elapsed);

    if (restante !== this.pomodoroSegundosRestantes) {
      this.pomodoroSegundosRestantes = restante;
    }
    if (this.pomodoroSegundosRestantes === 0) {
      this.trocarFasePomodoro();
    }
  }

  private trocarFasePomodoro(): void {
    this.pararIntervaloTimer();
    this.timerRodando = false;
    if (this.pomodoroFase === 'foco') {
      this.pomodoroCiclosConcluidos++;
      if (this.pomodoroCiclosConcluidos % this.pomodoroCiclosParaLonga === 0) {
        this.pomodoroFase = 'pausa-longa';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaLonga;
      } else {
        this.pomodoroFase = 'pausa-curta';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaCurta;
      }
      return;
    }
    this.pomodoroFase = 'foco';
    this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
  }

  private getSegundosEstudoTimer(): number {
    if (this.timerModo === 'livre') return this.tempoLivreSegundos;
    const ciclosCompletos = this.pomodoroCiclosConcluidos * this.pomodoroDuracaoFoco;
    const focoAtual = this.pomodoroFase === 'foco' ? this.pomodoroDuracaoFoco - this.pomodoroSegundosRestantes : 0;
    return Math.max(0, ciclosCompletos + focoAtual);
  }

  private pararIntervaloTimer(): void {
    if (this.timerRef) {
      clearInterval(this.timerRef);
      this.timerRef = undefined;
    }
    this.timerBaseMs = null;
    this.pomodoroFaseInicioMs = null;
  }

  private pad2(valor: number): string {
    return String(valor).padStart(2, '0');
  }

  onCampoFocus(campo: CampoAutocomplete): void {
    if (!this.podeProsseguirNoCampo(campo)) {
      return;
    }
    this.atualizarSugestoes(campo, '');
  }

  onCampoBlur(campo?: CampoAutocomplete): void {
    setTimeout(() => {
      if (!campo || campo === 'materiaNome') {
        this.normalizarMateriaDigitada();
      }

      if (campo === 'agrupador' && this.materiaBloqueada) {
        this.limparDependenciasAoTrocarAgrupador();
      }

      if (campo === 'materiaNome' && this.topicoBloqueado) {
        this.limparDependenciasAoTrocarMateria();
      }

      if (campo === 'topicoNome' && this.subtopicoBloqueado) {
        this.limparDependenciasAoTrocarTopico();
      }
    }, 120);
  }

  get agrupadoresDisponiveis(): string[] {
    return this.obterBaseSugestoes('agrupador');
  }

  get materiasDisponiveis(): string[] {
    return this.obterBaseSugestoes('materiaNome');
  }

  get topicosDisponiveis(): string[] {
    return this.obterBaseSugestoes('topicoNome');
  }

  get subtopicosDisponiveis(): string[] {
    return this.obterBaseSugestoes('subtopicoNome');
  }

  onAgrupadorChange(valor: string): void {
    this.onCampoSelecionado('agrupador', String(valor || ''));
  }

  onMateriaChange(valor: string): void {
    this.onCampoSelecionado('materiaNome', String(valor || ''));
  }

  onTopicoChange(valor: string): void {
    this.onCampoSelecionado('topicoNome', String(valor || ''));
  }

  onSubtopicoChange(valor: string): void {
    this.onCampoSelecionado('subtopicoNome', String(valor || ''));
  }

  buscarSugestoes(campo: CampoAutocomplete, event: { query?: string } | null | undefined): void {
    if (!this.podeProsseguirNoCampo(campo)) {
      this.sugestoesVisiveis[campo] = [];
      return;
    }

    if (campo === 'materiaNome') {
      this.feedbackMateria = '';
    }
    if (campo === 'topicoNome') {
      this.limparDependenciasAoTrocarTopico();
    }

    this.atualizarSugestoes(campo, String(event?.query || ''));
  }

  onCampoSelecionado(campo: CampoAutocomplete, valor: string): void {
    this.ultimaSelecaoAutocompleteMs = Date.now();
    this.form.controls[campo].setValue(valor);
    this.form.controls[campo].markAsDirty();

    if (campo === 'materiaNome') {
      this.limparDependenciasAoTrocarMateria();
    } else if (campo === 'agrupador') {
      this.limparDependenciasAoTrocarAgrupador();
    } else if (campo === 'topicoNome') {
      this.limparDependenciasAoTrocarTopico();
    }
  }

  private podeProsseguirNoCampo(campo: CampoAutocomplete): boolean {
    if (campo === 'agrupador') return true;

    if (campo === 'materiaNome') {
      return this.garantirCampoPreenchido('agrupador');
    }

    if (campo === 'topicoNome') {
      return this.garantirCampoPreenchido('materiaNome');
    }

    return this.garantirCampoPreenchido('topicoNome');
  }

  private garantirCampoPreenchido(campo: 'agrupador' | 'materiaNome' | 'topicoNome'): boolean {
    const control = this.form.controls[campo];
    const valor = String(control.value || '').trim();
    if (valor) return true;

    control.markAsTouched();
    setTimeout(() => this.focarCampo(campo), 0);
    return false;
  }

  private focarCampoAgrupador(): void {
    this.focarCampo('agrupador');
  }

  private focarCampo(campo: 'agrupador' | 'materiaNome' | 'topicoNome' | 'subtopicoNome'): void {
    const input = document.getElementById(`registrar-livre-${campo === 'agrupador' ? 'agrupador' : campo.replace('Nome', '')}`) as HTMLInputElement | null;
    input?.focus();
  }

  private focarCampoObservacao(): void {
    const editor = document.querySelector('#observacao .ql-editor') as HTMLElement | null;
    if (editor) {
      editor.focus();
      return;
    }

    const fallback = document.getElementById('observacao') as HTMLElement | null;
    fallback?.focus();
  }

  private limparDependenciasAoTrocarAgrupador(): void {
    this.form.controls.materiaNome.setValue('');
    this.limparDependenciasAoTrocarMateria();
    this.atualizarSugestoes('materiaNome');
  }

  private limparDependenciasAoTrocarMateria(): void {
    this.feedbackMateria = '';
    this.form.controls.topicoNome.setValue('');
    this.limparDependenciasAoTrocarTopico();
    this.atualizarSugestoes('topicoNome');
  }

  private limparDependenciasAoTrocarTopico(): void {
    const topicoAtual = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    const topicoSelecionadoExato = this.getTopicoSelecionadoExato();

    // Quando o topico digitado nao corresponde exatamente a um topico existente,
    // limpa dados herdados do contexto anterior para evitar contaminacao.
    if (!!topicoAtual && !!topicoSelecionadoExato && this.toKey(topicoAtual) === this.toKey(topicoSelecionadoExato)) {
      return;
    }

    if (this.normalizarTexto(String(this.form.value.subtopicoNome || ''))) {
      this.form.controls.subtopicoNome.setValue('');
    }
    this.atualizarSugestoes('subtopicoNome');

    if (this.observacaoHtml || this.contextoResumoAutoPreenchido) {
      this.observacaoHtml = '';
      this.contextoResumoAutoPreenchido = '';
      this.atualizarContadorCaracteres(0);
    }

    if (this.form.value.finalizado) {
      this.form.controls.finalizado.setValue(false);
    }
  }

  registrarEstudo(): void {
    this.feedbackErro = '';
    this.feedbackSucesso = '';
    this.feedbackMateria = '';
    this.estruturaCriada = null;

    if (!this.podeProsseguirNoCampo('materiaNome')) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.agrupador.invalid) {
        setTimeout(() => this.focarCampoAgrupador(), 0);
      }
      return;
    }

    const agrupadorSelecionado = this.getEditalSelecionadoExato();
    if (!agrupadorSelecionado) {
      this.feedbackErro = 'Selecione um edital existente na lista.';
      this.form.controls.agrupador.markAsTouched();
      setTimeout(() => this.focarCampoAgrupador(), 0);
      return;
    }

    const materiaSelecionada = this.getMateriaSelecionadaExata();
    if (!materiaSelecionada) {
      this.feedbackErro = 'Selecione uma materia existente na lista.';
      this.form.controls.materiaNome.markAsTouched();
      setTimeout(() => this.focarCampo('materiaNome'), 0);
      return;
    }

    const topicoSelecionado = this.getTopicoSelecionadoExato();
    if (!topicoSelecionado) {
      this.feedbackErro = 'Selecione um topico existente na lista.';
      this.form.controls.topicoNome.markAsTouched();
      setTimeout(() => this.focarCampo('topicoNome'), 0);
      return;
    }

    const subtopicoDigitado = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));
    const subtopicoSelecionado = this.getSubtopicoSelecionadoExato();
    if (subtopicoDigitado && !subtopicoSelecionado) {
      this.feedbackErro = 'Selecione um subtopico existente na lista.';
      this.form.controls.subtopicoNome.markAsTouched();
      return;
    }

    const agrupador = agrupadorSelecionado.nome;
    const materiaNome = materiaSelecionada;
    const topicoNome = topicoSelecionado;
    const subtopicoNome = subtopicoSelecionado || '';
    const observacaoHtml = this.normalizarHtmlAnotacoes(this.observacaoHtml || '');
    const observacao = this.extrairTextoDoHtml(observacaoHtml).trim();
    const tempoMinutos = this.resolverTempoMinutosParaRegistro();
    const marcarComoFinalizado = !!this.form.value.finalizado;
    this.form.controls.tempoMinutos.setValue(tempoMinutos);

    if (!materiaNome || !topicoNome || tempoMinutos <= 0) {
      this.form.markAllAsTouched();
      if (this.form.controls.agrupador.invalid) {
        setTimeout(() => this.focarCampoAgrupador(), 0);
      }
      return;
    }

    this.enviando = true;
    this.estudoLivreService.registrar({
      materiaNome,
      topicoNome,
      subtopicoNome: subtopicoNome || undefined,
      tempoMinutos,
      observacao: observacao || undefined,
      observacaoHtml: observacao || undefined ? observacaoHtml : undefined
    }).pipe(
      switchMap(() => this.garantirEditalDoAgrupador(agrupador, materiaNome)),
      switchMap(() => this.finalizarTopicoSeMarcado(marcarComoFinalizado)),
      finalize(() => (this.enviando = false))
    )
      .subscribe({
        next: (finalizacao) => {
          this.materiaService.notificarMateriasAlteradas();
          this.salvarHistorico({
            agrupador,
            materiaNome,
            topicoNome,
            subtopicoNome
          });
          this.feedbackSucesso = finalizacao.finalizado
            ? 'Estudo registrado, entrou no ciclo de revisao e foi marcado como finalizado.'
            : 'Estudo registrado e ja entrou no seu ciclo de revisao';
          if (finalizacao.solicitado && !finalizacao.finalizado) {
            this.feedbackErro = 'O estudo foi registrado, mas nao foi possivel marcar como finalizado.';
          }
          this.estruturaCriada = {
            materiaNome,
            topicoNome,
            subtopicoNome: subtopicoNome || undefined
          };
          this.limparMantendoMateria();
        },
        error: (error: HttpErrorResponse) => {
          this.feedbackErro = this.getErrorMessage(error);
        }
      });
  }

  private finalizarTopicoSeMarcado(solicitado: boolean): Observable<{ solicitado: boolean; finalizado: boolean }> {
    if (!solicitado) {
      return of({ solicitado: false, finalizado: false });
    }

    this.finalizandoTopico = true;
    return this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((contexto) => {
        if (!contexto?.topicoId) {
          return of({ solicitado: true, finalizado: false });
        }
        return this.salaEstudoService.finalizarTopico(contexto.topicoId).pipe(
          map(() => ({ solicitado: true, finalizado: true })),
          catchError(() => of({ solicitado: true, finalizado: false }))
        );
      }),
      catchError(() => of({ solicitado: true, finalizado: false })),
      finalize(() => (this.finalizandoTopico = false))
    );
  }

  private garantirEditalDoAgrupador(agrupador: string, materiaNome: string): Observable<unknown> {
    const nome = this.normalizarTexto(agrupador);
    if (!nome) {
      return of(null);
    }

    const nomeKey = this.toKey(nome);
    const materiaIdAtual = this.getMateriaIdPorNome(materiaNome);
    const materiaId$ = materiaIdAtual
      ? of(materiaIdAtual)
      : this.salaEstudoService.listarMateriasParaEstudo('todas').pipe(
          tap((materias) => this.aplicarCatalogoDaApi(materias || [])),
          map(() => this.getMateriaIdPorNome(materiaNome)),
          catchError(() => of(undefined))
        );

    return materiaId$.pipe(
      switchMap((materiaId) =>
        this.editalService.listarComInclude(['materias']).pipe(
          switchMap((editais) => {
            const existente = (editais || []).find((edital: any) => this.toKey(String(edital?.nome || '')) === nomeKey);
            if (existente?.id) {
              return this.atualizarEditalComMateria(existente, materiaId).pipe(
                tap(() => this.carregarEditaisAgrupador())
              );
            }

            return this.editalService.criar({
              nome,
              materiasIds: materiaId ? [materiaId] : []
            }).pipe(
              tap(() => this.carregarEditaisAgrupador()),
              catchError(() => of(null))
            );
          }),
          catchError(() => of(null))
        )
      ),
      catchError(() => of(null))
    );
  }

  private atualizarEditalComMateria(edital: any, materiaId?: number): Observable<unknown> {
    if (!edital?.id) {
      return of(null);
    }

    const materiasAtuais = (edital?.materias || [])
      .map((m: any) => Number(m?.materiaId || 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    const materiasIds = [...materiasAtuais];
    if (materiaId && !materiasIds.includes(materiaId)) {
      materiasIds.push(materiaId);
    }

    return this.editalService.atualizar(Number(edital.id), {
      nome: String(edital?.nome || '').trim() || 'Edital',
      cargo: edital?.cargo ?? null,
      descricao: edital?.descricao ?? null,
      dataProva: edital?.dataProva ?? null,
      materiasIds
    }).pipe(
      catchError(() => of(null))
    );
  }

  private limparMantendoMateria(): void {
    this.form.reset({
      agrupador: '',
      materiaNome: '',
      topicoNome: '',
      subtopicoNome: '',
      tempoMinutos: 30,
      observacao: '',
      finalizado: false
    });
    this.observacaoHtml = '';
    this.contextoResumoAutoPreenchido = '';
    this.tempoManual = '';
    this.mensagemFlashcardErro = '';
    this.mensagemFlashcardSucesso = '';
    this.atualizarContadorCaracteres(0);
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.sincronizarBloqueioCamposDependentes();
    this.aplicarAgrupadorPadraoSeUnico();
    this.atualizarSugestoes('agrupador');
    this.atualizarSugestoes('materiaNome');
    this.atualizarSugestoes('topicoNome');
    this.atualizarSugestoes('subtopicoNome');
  }

  private iniciarBloqueioCamposDependentes(): void {
    this.bloqueioCamposSub?.unsubscribe();
    this.bloqueioCamposSub = this.form.valueChanges.pipe(
      map(() => {
        const agrupador = this.normalizarTexto(String(this.form.controls.agrupador.value || ''));
        const materia = this.normalizarTexto(String(this.form.controls.materiaNome.value || ''));
        const topico = this.normalizarTexto(String(this.form.controls.topicoNome.value || ''));
        return `${agrupador}|${materia}|${topico}`;
      }),
      distinctUntilChanged()
    ).subscribe(() => this.sincronizarBloqueioCamposDependentes());

    this.sincronizarBloqueioCamposDependentes();
  }

  private sincronizarBloqueioCamposDependentes(): void {
    const agrupador = this.normalizarTexto(String(this.form.controls.agrupador.value || ''));
    const materia = this.normalizarTexto(String(this.form.controls.materiaNome.value || ''));
    const topico = this.normalizarTexto(String(this.form.controls.topicoNome.value || ''));

    if (!agrupador) {
      this.form.controls.materiaNome.setValue('', { emitEvent: false });
      this.form.controls.topicoNome.setValue('', { emitEvent: false });
      this.form.controls.subtopicoNome.setValue('', { emitEvent: false });
    } else if (!materia) {
      this.form.controls.topicoNome.setValue('', { emitEvent: false });
      this.form.controls.subtopicoNome.setValue('', { emitEvent: false });
    } else if (!topico) {
      this.form.controls.subtopicoNome.setValue('', { emitEvent: false });
    }

    this.alternarEstadoControle(this.form.controls.materiaNome, !!agrupador);
    this.alternarEstadoControle(this.form.controls.topicoNome, !!agrupador && !!materia);
    this.alternarEstadoControle(this.form.controls.subtopicoNome, !!agrupador && !!materia && !!topico);
  }

  private alternarEstadoControle(
    control: { enabled: boolean; disabled: boolean; enable: (opts?: { emitEvent?: boolean }) => void; disable: (opts?: { emitEvent?: boolean }) => void },
    habilitado: boolean
  ): void {
    if (habilitado && control.disabled) {
      control.enable({ emitEvent: false });
      return;
    }

    if (!habilitado && control.enabled) {
      control.disable({ emitEvent: false });
    }
  }

  private iniciarPreenchimentoResumoExistente(): void {
    this.preencherResumoSub?.unsubscribe();
    this.preencherResumoSub = this.form.valueChanges.pipe(
      debounceTime(250),
      map(() => this.montarChaveContextoResumo()),
      distinctUntilChanged()
    ).subscribe((contextoKey) => {
      if (!contextoKey) {
        this.contextoResumoAutoPreenchido = '';
        return;
      }
      this.preencherResumoExistente(contextoKey);
    });
  }

  private montarChaveContextoResumo(): string {
    const materiaNome = this.normalizarTexto(String(this.form.value.materiaNome || ''));
    const topicoNome = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    const subtopicoNome = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));
    if (!materiaNome || !topicoNome) return '';
    return `${this.toKey(materiaNome)}|${this.toKey(topicoNome)}|${this.toKey(subtopicoNome)}`;
  }

  private preencherResumoExistente(contextoKey: string): void {
    if (!contextoKey) return;
    const reqSeq = ++this.resumoLookupSeq;

    this.resolverMateriaTopicoIdsParaFlashcard().pipe(
      switchMap((ids) => {
        if (!ids?.topicoId) return of('');
        return this.salaEstudoService.buscarAnotacoes(ids.topicoId).pipe(
          map((resp) => this.normalizarHtmlAnotacoes(String(resp?.anotacoes || ''))),
          catchError(() => of(''))
        );
      })
    ).subscribe((anotacoesHtml) => {
      if (reqSeq !== this.resumoLookupSeq) return;

      const contextoAtual = this.montarChaveContextoResumo();
      if (!contextoAtual || contextoAtual !== contextoKey) return;

      if (!anotacoesHtml) {
        if (this.contextoResumoAutoPreenchido && this.contextoResumoAutoPreenchido !== contextoKey) {
          this.observacaoHtml = '';
          this.atualizarContadorCaracteres(0);
        }
        this.contextoResumoAutoPreenchido = '';
        return;
      }

      this.observacaoHtml = anotacoesHtml;
      const texto = this.extrairTextoDoHtml(anotacoesHtml);
      this.atualizarContadorCaracteres(Math.min(this.maxCaracteres, texto.length));
      this.contextoResumoAutoPreenchido = contextoKey;
    });
  }

  private carregarDadosAutocomplete(): void {
    this.limparHistoricoAutocompleteLocal();
    this.agrupadoresHistorico = [];

    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
      next: (materias) => {
        this.usandoFallbackLocal = false;
        this.aplicarCatalogoDaApi(materias || []);
        this.atualizarSugestoesIniciais();
      },
      error: () => {
        this.usandoFallbackLocal = false;
        this.aplicarFallbackLocal({ agrupadores: [], materias: [], topicos: [], subtopicos: [] });
        this.atualizarSugestoesIniciais();
      }
    });
  }

  private carregarEditaisAgrupador(): void {
    this.editalService.listarComInclude(['materias', 'topicos']).subscribe({
      next: (editais) => {
        const lista = (editais || []).filter((edital: any) => this.isEditalAtivo(edital));
        this.hidratarCatalogoEditais(lista);
        this.garantirAgrupadorSelecionadoValido();
        this.aplicarAgrupadorPadraoSeUnico();
        this.atualizarSugestoes('agrupador');
        this.atualizarSugestoes('materiaNome');
        this.atualizarSugestoes('topicoNome');
        this.atualizarSugestoes('subtopicoNome');
        this.aplicarFocoInicial();
      },
      error: () => {
        this.editalService.listar().subscribe({
          next: (editais) => {
            const lista = (editais || []).filter((edital: any) => this.isEditalAtivo(edital));
            const nomes = lista
              .map((edital: any) => this.normalizarTexto(String(edital?.nome || '')))
              .filter((nome) => !!nome);
            this.agrupadoresCatalogo = this.unicosOrdenados(nomes);
            this.editaisCatalogo = this.agrupadoresCatalogo.map((nome) => ({ nome, key: this.toKey(nome) }));
            this.materiasPorEdital.clear();
            this.topicosPorEdital.clear();
            this.topicosPorEditalMateria.clear();
            this.subtopicosPorEditalMateria.clear();
            this.subtopicosPorEditalMateriaTopico.clear();
            this.garantirAgrupadorSelecionadoValido();
            this.aplicarAgrupadorPadraoSeUnico();
            this.atualizarSugestoes('agrupador');
            this.atualizarSugestoes('materiaNome');
            this.atualizarSugestoes('topicoNome');
            this.atualizarSugestoes('subtopicoNome');
            this.aplicarFocoInicial();
          },
          error: () => {
            this.agrupadoresCatalogo = [];
            this.editaisCatalogo = [];
            this.atualizarSugestoes('agrupador');
            this.aplicarFocoInicial();
          }
        });
      }
    });
  }

  private hidratarCatalogoEditais(editais: any[]): void {
    this.materiasPorEdital.clear();
    this.topicosPorEdital.clear();
    this.topicosPorEditalMateria.clear();
    this.subtopicosPorEditalMateria.clear();
    this.subtopicosPorEditalMateriaTopico.clear();

    const nomes: string[] = [];
    const catalogo: EditalCatalogoItem[] = [];

    (editais || []).forEach((edital: any) => {
      const nomeEdital = this.normalizarTexto(String(edital?.nome || ''));
      if (!nomeEdital) return;
      const editalKey = this.toKey(nomeEdital);
      nomes.push(nomeEdital);
      catalogo.push({ nome: nomeEdital, key: editalKey });

      const materias = Array.isArray(edital?.materias) ? edital.materias : [];
      materias.forEach((materia: any) => {
        const materiaNome = this.normalizarTexto(String(materia?.materiaNome || ''));
        if (!materiaNome) return;
        const materiaKey = this.toKey(materiaNome);

        this.pushUnicoNoMapa(this.materiasPorEdital, editalKey, materiaNome);

        const topicos = Array.isArray(materia?.topicos) ? materia.topicos : [];
        this.walkTopicos(topicos, (nomeTopico, nivel) => {
          if (nivel <= 0) {
            this.pushUnicoNoMapa(this.topicosPorEdital, editalKey, nomeTopico);
            this.pushUnicoNoMapa(this.topicosPorEditalMateria, `${editalKey}|${materiaKey}`, nomeTopico);
            return;
          }
          this.pushUnicoNoMapa(this.subtopicosPorEditalMateria, `${editalKey}|${materiaKey}`, nomeTopico);
        }, (nomePai, nomeFilho) => {
          const chave = `${editalKey}|${materiaKey}|${this.toKey(nomePai)}`;
          this.pushUnicoNoMapa(this.subtopicosPorEditalMateriaTopico, chave, nomeFilho);
        });
      });
    });

    this.agrupadoresCatalogo = this.unicosOrdenados(nomes);
    this.editaisCatalogo = catalogo;
  }

  private isEditalAtivo(edital: any): boolean {
    const ativo = edital?.ativo;
    if (typeof ativo === 'boolean') return ativo;
    if (typeof ativo === 'number') return ativo === 1;
    if (typeof ativo === 'string') {
      const normalizado = ativo.trim().toLowerCase();
      return normalizado === 'true' || normalizado === '1' || normalizado === 'ativo';
    }
    return false;
  }

  private garantirAgrupadorSelecionadoValido(): void {
    const selecionado = this.normalizarTexto(String(this.form.controls.agrupador.value || ''));
    if (!selecionado) return;
    const chave = this.toKey(selecionado);
    const existe = this.editaisCatalogo.some((item) => item.key === chave);
    if (existe) return;

    this.form.controls.agrupador.setValue('', { emitEvent: false });
    this.form.controls.materiaNome.setValue('', { emitEvent: false });
    this.form.controls.topicoNome.setValue('', { emitEvent: false });
    this.form.controls.subtopicoNome.setValue('', { emitEvent: false });
    this.sincronizarBloqueioCamposDependentes();
  }

  private aplicarAgrupadorPadraoSeUnico(): void {
    const atual = this.normalizarTexto(String(this.form.controls.agrupador.value || ''));
    if (atual) return;
    if (this.agrupadoresCatalogo.length !== 1) return;

    const unico = this.agrupadoresCatalogo[0];
    this.onCampoSelecionado('agrupador', unico);
    this.form.controls.agrupador.markAsPristine();
    this.form.controls.agrupador.markAsUntouched();
  }

  private aplicarFocoInicial(): void {
    if (this.focoInicialAplicado) return;
    this.focoInicialAplicado = true;

    const agrupador = this.normalizarTexto(String(this.form.controls.agrupador.value || ''));
    const campoDestino: 'agrupador' | 'materiaNome' = agrupador ? 'materiaNome' : 'agrupador';
    setTimeout(() => this.focarCampo(campoDestino), 0);
  }

  private aplicarCatalogoDaApi(materias: MateriaTopicosDTO[]): void {
    this.materiaIdPorNomeKey.clear();
    this.materiasCatalogo = [];
    this.topicosCatalogo = [];
    this.subtopicosCatalogo = [];
    this.topicosPorMateria.clear();
    this.subtopicosPorMateria.clear();
    this.subtopicosPorMateriaTopico.clear();

    const materiasSet = new Map<string, string>();
    const topicosSet = new Map<string, string>();
    const subtopicosSet = new Map<string, string>();

    (materias || []).forEach((materia) => {
      const materiaNome = this.normalizarTexto(String(materia?.materiaNome || ''));
      if (!materiaNome) return;

      const materiaKey = this.toKey(materiaNome);
      materiasSet.set(materiaKey, materiaNome);
      this.materiaIdPorNomeKey.set(materiaKey, Number(materia?.materiaId || 0));

      this.walkTopicos(materia.topicos || [], (nomeTopico, nivel) => {
        const topicoKey = this.toKey(nomeTopico);
        if (nivel <= 0) {
          topicosSet.set(topicoKey, nomeTopico);
          this.pushUnicoNoMapa(this.topicosPorMateria, materiaKey, nomeTopico);
          return;
        }

        subtopicosSet.set(topicoKey, nomeTopico);
        this.pushUnicoNoMapa(this.subtopicosPorMateria, materiaKey, nomeTopico);
      }, (nomePai, nomeFilho) => {
        const chave = `${materiaKey}|${this.toKey(nomePai)}`;
        this.pushUnicoNoMapa(this.subtopicosPorMateriaTopico, chave, nomeFilho);
      });
    });

    this.materiasCatalogo = Array.from(materiasSet.values());
    this.topicosCatalogo = Array.from(topicosSet.values());
    this.subtopicosCatalogo = Array.from(subtopicosSet.values());
  }

  private walkTopicos(
    topicos: TopicoNodeDTO[],
    onNode: (nomeTopico: string, nivel: number) => void,
    onEdge: (nomePai: string, nomeFilho: string) => void,
    nivel = 0,
    paiNome = ''
  ): void {
    const lista = Array.isArray(topicos) ? topicos : [];
    lista.forEach((node) => {
      const nome = this.normalizarTexto(String(node?.descricao || ''));
      if (!nome) return;

      onNode(nome, nivel);
      if (paiNome) {
        onEdge(paiNome, nome);
      }

      const filhos = this.extrairFilhos(node);
      if (filhos.length) {
        this.walkTopicos(filhos, onNode, onEdge, nivel + 1, nome);
      }
    });
  }

  private extrairFilhos(node: TopicoNodeDTO): TopicoNodeDTO[] {
    const filhos = node?.subtopicos ?? node?.filhos ?? [];
    return Array.isArray(filhos) ? filhos : [];
  }

  private aplicarFallbackLocal(historico: HistoricoRegistroLivre): void {
    this.materiasCatalogo = historico.materias;
    this.topicosCatalogo = historico.topicos;
    this.subtopicosCatalogo = historico.subtopicos;
    this.topicosPorMateria.clear();
    this.subtopicosPorMateria.clear();
    this.subtopicosPorMateriaTopico.clear();
  }

  private atualizarSugestoesIniciais(): void {
    this.atualizarSugestoes('agrupador');
    this.atualizarSugestoes('materiaNome');
    this.atualizarSugestoes('topicoNome');
    this.atualizarSugestoes('subtopicoNome');
  }

  private atualizarSugestoes(campo: CampoAutocomplete, query?: string): void {
    const valorDigitado = this.normalizarTexto(
      query != null ? String(query) : String(this.form.controls[campo].value || '')
    );
    const base = this.obterBaseSugestoes(campo);
    const filtrados = !valorDigitado
      ? [...base]
      : base.filter((item) => String(item || '').toLowerCase().includes(valorDigitado.toLowerCase()));
    const limite = campo === 'agrupador'
      ? this.limiteSugestoesAgrupador
      : (campo === 'topicoNome' || campo === 'materiaNome')
        ? undefined
        : this.limiteSugestoes;
    const lista = typeof limite === 'number'
      ? filtrados.slice(0, limite)
      : filtrados;

    this.sugestoesVisiveis[campo] = lista;
  }

  private normalizarMateriaDigitada(): string {
    const atual = this.normalizarTexto(String(this.form.value.materiaNome || ''));
    if (!atual) {
      this.feedbackMateria = '';
      return '';
    }

    const equivalente = this.encontrarMateriaEquivalente(atual);
    if (!equivalente) {
      return atual;
    }

    if (equivalente !== atual) {
      this.form.controls.materiaNome.setValue(equivalente, { emitEvent: false });
      this.feedbackMateria = `Materia existente detectada. Usando a cadastrada: ${equivalente}.`;
      this.atualizarSugestoes('materiaNome');
      this.atualizarSugestoes('topicoNome');
      this.atualizarSugestoes('subtopicoNome');
    }

    return equivalente;
  }

  private obterBaseSugestoes(campo: CampoAutocomplete): string[] {
    const editalSelecionado = this.getEditalSelecionadoExato();
    const editalKey = editalSelecionado?.key || null;
    const agrupadorNovoDigitado = this.isAgrupadorNovoDigitado();

    if (campo === 'agrupador') {
      return this.agrupadoresCatalogo;
    }

    if (campo === 'materiaNome') {
      if (editalKey) {
        return this.materiasPorEdital.get(editalKey) || [];
      }
      if (agrupadorNovoDigitado) {
        return [];
      }
      return this.materiasCatalogo;
    }

    if (campo === 'topicoNome') {
      if (agrupadorNovoDigitado) {
        return [];
      }

      const materiaSelecionada = this.getMateriaSelecionadaExata();
      if (!materiaSelecionada) {
        if (editalKey) {
          return this.topicosPorEdital.get(editalKey) || [];
        }
        return this.topicosCatalogo;
      }

      if (editalKey) {
        const porEditalMateria = this.topicosPorEditalMateria.get(`${editalKey}|${this.toKey(materiaSelecionada)}`) || [];
        return porEditalMateria;
      }

      const lista = this.topicosPorMateria.get(this.toKey(materiaSelecionada)) || [];
      return lista;
    }

    if (agrupadorNovoDigitado) {
      return [];
    }

    const materiaSelecionada = this.getMateriaSelecionadaExata();
    if (!materiaSelecionada) {
      return editalKey ? [] : this.subtopicosCatalogo;
    }

    const topicoSelecionado = this.getTopicoSelecionadoExato();
    if (editalKey) {
      if (topicoSelecionado) {
        const porEditalMateriaTopico = this.subtopicosPorEditalMateriaTopico.get(
          `${editalKey}|${this.toKey(materiaSelecionada)}|${this.toKey(topicoSelecionado)}`
        ) || [];
        return porEditalMateriaTopico;
      }
      return this.subtopicosPorEditalMateria.get(`${editalKey}|${this.toKey(materiaSelecionada)}`) || [];
    }

    if (topicoSelecionado) {
      return this.subtopicosPorMateriaTopico.get(
        `${this.toKey(materiaSelecionada)}|${this.toKey(topicoSelecionado)}`
      ) || [];
    }

    return this.subtopicosPorMateria.get(this.toKey(materiaSelecionada)) || [];
  }

  private isAgrupadorNovoDigitado(): boolean {
    const atual = this.normalizarTexto(String(this.form.value.agrupador || ''));
    return !!atual && !this.getEditalSelecionadoExato();
  }

  private getEditalSelecionadoExato(): EditalCatalogoItem | null {
    const atual = this.normalizarTexto(String(this.form.value.agrupador || ''));
    if (!atual) return null;
    const key = this.toKey(atual);
    return this.editaisCatalogo.find((e) => e.key === key) || null;
  }

  private getMateriaSelecionadaExata(): string | null {
    const atual = this.normalizarTexto(String(this.form.value.materiaNome || ''));
    if (!atual) return null;
    const editalSelecionado = this.getEditalSelecionadoExato();
    const base = editalSelecionado
      ? (this.materiasPorEdital.get(editalSelecionado.key) || [])
      : this.materiasCatalogo;
    const encontrada = this.encontrarMateriaEquivalente(atual, base);
    return encontrada || null;
  }

  private getTopicoSelecionadoExato(): string | null {
    const atual = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    if (!atual) return null;
    const editalSelecionado = this.getEditalSelecionadoExato();
    const materiaSelecionada = this.getMateriaSelecionadaExata();
    let base = this.topicosCatalogo;

    if (editalSelecionado && materiaSelecionada) {
      base = this.topicosPorEditalMateria.get(`${editalSelecionado.key}|${this.toKey(materiaSelecionada)}`) || [];
    } else if (editalSelecionado) {
      base = this.topicosPorEdital.get(editalSelecionado.key) || [];
    } else if (materiaSelecionada) {
      base = this.topicosPorMateria.get(this.toKey(materiaSelecionada)) || [];
    }

    const encontrada = base.find((t) => this.toKey(t) === this.toKey(atual));
    return encontrada || null;
  }

  private getSubtopicoSelecionadoExato(): string | null {
    const atual = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));
    if (!atual) return null;
    const base = this.obterBaseSugestoes('subtopicoNome');
    const encontrado = base.find((item) => this.toKey(item) === this.toKey(atual));
    return encontrado || null;
  }

  private resolverContextoMateriaTopicoSelecionado(): Observable<{
    materiaId: number;
    topicoId: number;
    materiaNome: string;
    topicoNome: string;
  } | null> {
    const materiaNome = this.getMateriaSelecionadaExata();
    const topicoNome = this.getTopicoSelecionadoExato();
    if (!materiaNome || !topicoNome) {
      return of(null);
    }

    return this.salaEstudoService.listarMateriasParaEstudo('todas').pipe(
      map((materias) => {
        const materia = (materias || []).find((m) => this.toKey(String(m?.materiaNome || '')) === this.toKey(materiaNome));
        const materiaId = Number(materia?.materiaId || 0);
        if (!materia || materiaId <= 0) return null;

        const topicosRaiz = Array.isArray(materia.topicos) ? materia.topicos : [];
        const topico = this.encontrarTopicoRaizPorNome(topicosRaiz, topicoNome);
        const topicoId = this.getTopicoId(topico);
        if (topicoId <= 0) return null;

        return { materiaId, topicoId, materiaNome, topicoNome };
      }),
      catchError(() => of(null))
    );
  }

  private resolverContextoMateriaSelecionada(): Observable<{ materiaId: number; materiaNome: string } | null> {
    const materiaNome = this.getMateriaSelecionadaExata();
    if (!materiaNome) {
      return of(null);
    }

    const materiaIdConhecido = this.getMateriaIdPorNome(materiaNome);
    if (materiaIdConhecido) {
      return of({ materiaId: materiaIdConhecido, materiaNome });
    }

    return this.salaEstudoService.listarMateriasParaEstudo('todas').pipe(
      tap((materias) => this.aplicarCatalogoDaApi(materias || [])),
      map(() => {
        const materiaId = this.getMateriaIdPorNome(materiaNome);
        if (!materiaId) return null;
        return { materiaId, materiaNome };
      }),
      catchError(() => of(null))
    );
  }

  private adicionarSubtopicoAoCatalogoLocal(subtopicoNome: string, materiaNome: string, topicoNome: string): void {
    const sub = this.normalizarTexto(subtopicoNome);
    const materia = this.normalizarTexto(materiaNome);
    const topico = this.normalizarTexto(topicoNome);
    if (!sub || !materia || !topico) return;

    this.subtopicosCatalogo = this.upsertHistorico(this.subtopicosCatalogo, sub);

    const materiaKey = this.toKey(materia);
    this.pushUnicoNoMapa(this.subtopicosPorMateria, materiaKey, sub);
    this.pushUnicoNoMapa(this.subtopicosPorMateriaTopico, `${materiaKey}|${this.toKey(topico)}`, sub);

    const editalSelecionado = this.getEditalSelecionadoExato();
    if (editalSelecionado?.key) {
      const baseKey = `${editalSelecionado.key}|${materiaKey}`;
      this.pushUnicoNoMapa(this.subtopicosPorEditalMateria, baseKey, sub);
      this.pushUnicoNoMapa(this.subtopicosPorEditalMateriaTopico, `${baseKey}|${this.toKey(topico)}`, sub);
    }
  }

  private adicionarTopicoAoCatalogoLocal(topicoNome: string, materiaNome: string): void {
    const topico = this.normalizarTexto(topicoNome);
    const materia = this.normalizarTexto(materiaNome);
    if (!topico || !materia) return;

    this.topicosCatalogo = this.upsertHistorico(this.topicosCatalogo, topico);
    const materiaKey = this.toKey(materia);
    this.pushUnicoNoMapa(this.topicosPorMateria, materiaKey, topico);

    const editalSelecionado = this.getEditalSelecionadoExato();
    if (editalSelecionado?.key) {
      this.pushUnicoNoMapa(this.topicosPorEdital, editalSelecionado.key, topico);
      this.pushUnicoNoMapa(this.topicosPorEditalMateria, `${editalSelecionado.key}|${materiaKey}`, topico);
    }
  }

  private adicionarAgrupadorAoCatalogoLocal(agrupadorNome: string): void {
    const nome = this.normalizarTexto(agrupadorNome);
    if (!nome) return;

    this.agrupadoresCatalogo = this.unicosOrdenados([nome, ...this.agrupadoresCatalogo]);
    this.editaisCatalogo = this.agrupadoresCatalogo.map((item) => ({ nome: item, key: this.toKey(item) }));

    const editalKey = this.toKey(nome);
    if (!this.materiasPorEdital.has(editalKey)) {
      this.materiasPorEdital.set(editalKey, []);
    }
    if (!this.topicosPorEdital.has(editalKey)) {
      this.topicosPorEdital.set(editalKey, []);
    }
  }

  private adicionarMateriaAoCatalogoLocal(materiaNome: string, agrupadorNome: string, materiaId?: number): void {
    const materia = this.normalizarTexto(materiaNome);
    const agrupador = this.normalizarTexto(agrupadorNome);
    if (!materia) return;

    this.materiasCatalogo = this.upsertHistorico(this.materiasCatalogo, materia);
    if ((materiaId || 0) > 0) {
      this.materiaIdPorNomeKey.set(this.toKey(materia), Number(materiaId));
    }

    if (agrupador) {
      this.pushUnicoNoMapa(this.materiasPorEdital, this.toKey(agrupador), materia);
    }
  }

  private deveIgnorarCliqueAposSelecaoAutocomplete(event?: MouseEvent): boolean {
    if (!event) return false;
    const tempoDesdeSelecao = Date.now() - this.ultimaSelecaoAutocompleteMs;
    if (tempoDesdeSelecao >= 0 && tempoDesdeSelecao < 250) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  private salvarHistorico(payload: {
    agrupador?: string;
    materiaNome: string;
    topicoNome: string;
    subtopicoNome?: string;
  }): void {
    this.agrupadoresHistorico = this.upsertHistorico(this.agrupadoresHistorico, payload.agrupador);

    this.materiasCatalogo = this.upsertHistorico(this.materiasCatalogo, payload.materiaNome);
    this.topicosCatalogo = this.upsertHistorico(this.topicosCatalogo, payload.topicoNome);
    this.subtopicosCatalogo = this.upsertHistorico(this.subtopicosCatalogo, payload.subtopicoNome);

    const materiaKey = this.toKey(payload.materiaNome);
    const topicoNome = this.normalizarTexto(payload.topicoNome);
    const subtopicoNome = this.normalizarTexto(payload.subtopicoNome || '');
    if (materiaKey && topicoNome) {
      this.pushUnicoNoMapa(this.topicosPorMateria, materiaKey, topicoNome);
    }
    if (materiaKey && subtopicoNome) {
      this.pushUnicoNoMapa(this.subtopicosPorMateria, materiaKey, subtopicoNome);
      this.pushUnicoNoMapa(this.subtopicosPorMateriaTopico, `${materiaKey}|${this.toKey(topicoNome)}`, subtopicoNome);
    }

    this.atualizarSugestoes('materiaNome');
    this.atualizarSugestoes('topicoNome');
    this.atualizarSugestoes('subtopicoNome');
  }

  private upsertHistorico(lista: string[], valor?: string): string[] {
    const normalizado = this.normalizarTexto(String(valor || ''));
    if (!normalizado) {
      return (lista || []).slice(0, 30);
    }

    const semDuplicado = (lista || []).filter((item) => item.toLowerCase() !== normalizado.toLowerCase());
    return [normalizado, ...semDuplicado].slice(0, 30);
  }

  private lerHistorico(): HistoricoRegistroLivre {
    return { agrupadores: [], materias: [], topicos: [], subtopicos: [] };
  }

  private limparHistoricoAutocompleteLocal(): void {
    try {
      localStorage.removeItem(this.historicoKey);
    } catch {
      // Ignora indisponibilidade do storage.
    }
  }

  private sanitizarLista(lista: unknown): string[] {
    if (!Array.isArray(lista)) return [];
    return lista
      .map((item) => this.normalizarTexto(String(item || '')))
      .filter((item) => !!item)
      .slice(0, 30);
  }

  private unicosOrdenados(lista: string[]): string[] {
    const map = new Map<string, string>();
    (lista || []).forEach((item) => {
      const normalizado = this.normalizarTexto(item);
      if (!normalizado) return;
      const chave = this.toKey(normalizado);
      if (!map.has(chave)) {
        map.set(chave, normalizado);
      }
    });
    return Array.from(map.values());
  }

  private pushUnicoNoMapa(mapa: Map<string, string[]>, chave: string, valor: string): void {
    const atual = mapa.get(chave) || [];
    if (!atual.some((item) => this.toKey(item) === this.toKey(valor))) {
      mapa.set(chave, [...atual, valor]);
    }
  }

  private toKey(valor: string): string {
    return this.normalizarTexto(valor).toLocaleLowerCase('pt-BR');
  }

  private toMateriaKey(valor: string): string {
    const tokens = this.normalizarTexto(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => !!token)
      .map((token) => this.expandirTokenMateria(token));

    return tokens.join(' ').trim();
  }

  private expandirTokenMateria(token: string): string {
    const mapa: Record<string, string> = {
      dir: 'direito',
      adm: 'administrativo',
      trib: 'tributario',
      const: 'constitucional'
    };
    return mapa[token] || token;
  }

  private encontrarMateriaEquivalente(valor: string, base?: string[]): string | null {
    const nome = this.normalizarTexto(valor);
    if (!nome) return null;

    const lista = Array.isArray(base) ? base : this.materiasCatalogo;
    const chaveMateria = this.toMateriaKey(nome);
    if (!chaveMateria) return null;

    return lista.find((item) => this.toMateriaKey(item) === chaveMateria) || null;
  }

  private getMateriaIdPorNome(nome: string): number | undefined {
    const id = Number(this.materiaIdPorNomeKey.get(this.toKey(nome)) || 0);
    return id > 0 ? id : undefined;
  }

  private normalizarTexto(valor: string): string {
    return valor.replace(/\s+/g, ' ').trim();
  }

  private resolverTempoMinutosParaRegistro(): number {
    const segundosManuais = this.parseTempoManualParaSegundos(this.tempoManual);
    if (segundosManuais && segundosManuais > 0) {
      return Math.max(1, Math.ceil(segundosManuais / 60));
    }

    const segundosTimer = this.getSegundosEstudoTimer();
    if (segundosTimer > 0) {
      return Math.max(1, Math.ceil(segundosTimer / 60));
    }

    const valorAtual = Number(this.form.value.tempoMinutos || 0);
    return Number.isFinite(valorAtual) && valorAtual > 0 ? valorAtual : 30;
  }

  private parseTempoManualParaSegundos(valor: string): number | null {
    const texto = String(valor || '').trim();
    if (!texto) return null;

    const partes = texto.split(':').map((p) => p.trim());
    if (!partes.length || partes.length > 3 || partes.some((p) => p === '')) {
      return null;
    }

    const nums = partes.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return null;
    }

    if (nums.length === 3) {
      const [h, m, s] = nums;
      if (m > 59 || s > 59) return null;
      return (h * 3600) + (m * 60) + s;
    }

    if (nums.length === 2) {
      const [m, s] = nums;
      if (s > 59) return null;
      return (m * 60) + s;
    }

    return nums[0] * 60;
  }

  private formatarSegundos(totalSegundos: number): string {
    const safe = Math.max(0, Math.floor(totalSegundos));
    const horas = Math.floor(safe / 3600);
    const minutos = Math.floor((safe % 3600) / 60);
    const segundos = safe % 60;
    return `${this.pad2(horas)}:${this.pad2(minutos)}:${this.pad2(segundos)}`;
  }

  get flashcardMateriaContexto(): string {
    return this.normalizarTexto(String(this.form.value.materiaNome || '')) || '-';
  }

  get flashcardTopicoContexto(): string {
    const topico = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    const subtopico = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));
    return subtopico || topico || '-';
  }

  get vocabularioMateriaContexto(): string {
    return this.flashcardMateriaContexto;
  }

  get vocabularioTopicoContexto(): string {
    return this.flashcardTopicoContexto;
  }

  get podeUsarAcoesResumo(): boolean {
    const materia = this.normalizarTexto(String(this.form.value.materiaNome || ''));
    const topico = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    return !!materia && !!topico;
  }

  get podeCadastrarMateria(): boolean {
    return !!this.getEditalSelecionadoExato();
  }

  get podeCadastrarTopico(): boolean {
    return !!this.getMateriaSelecionadaExata();
  }

  get podeCadastrarSubtopico(): boolean {
    return !!this.getMateriaSelecionadaExata() && !!this.getTopicoSelecionadoExato();
  }

  private formatarTagsFlashcard(tags: string | undefined | null): string {
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

  private resolverMateriaTopicoIdsParaFlashcard(): Observable<{ materiaId: number; topicoId: number } | null> {
    const materiaNome = this.normalizarTexto(String(this.form.value.materiaNome || ''));
    const topicoNome = this.normalizarTexto(String(this.form.value.topicoNome || ''));
    const subtopicoNome = this.normalizarTexto(String(this.form.value.subtopicoNome || ''));
    if (!materiaNome || !topicoNome) {
      return of(null);
    }

    return this.salaEstudoService.listarMateriasParaEstudo('todas').pipe(
      map((materias) => {
        const materia = (materias || []).find((m) => this.toKey(String(m?.materiaNome || '')) === this.toKey(materiaNome));
        const materiaId = Number(materia?.materiaId || 0);
        if (!materia || materiaId <= 0) return null;

        const topicosRaiz = Array.isArray(materia.topicos) ? materia.topicos : [];
        const topico = this.encontrarTopicoRaizPorNome(topicosRaiz, topicoNome);
        if (!topico) return null;

        if (subtopicoNome) {
          const sub = this.encontrarTopicoPorNome(this.extrairFilhosBusca(topico), subtopicoNome);
          const subId = this.getTopicoId(sub);
          if (subId > 0) {
            return { materiaId, topicoId: subId };
          }
        }

        const topicoId = this.getTopicoId(topico);
        return topicoId > 0 ? { materiaId, topicoId } : null;
      }),
      catchError(() => of(null))
    );
  }

  private encontrarTopicoPorNome(topicos: TopicoNodeDTO[], nome: string): TopicoNodeDTO | null {
    const alvo = this.toKey(nome);
    if (!alvo) return null;

    const fila = Array.isArray(topicos) ? [...topicos] : [];
    while (fila.length) {
      const atual = fila.shift() as TopicoNodeDTO;
      if (this.toKey(String(atual?.descricao || '')) === alvo) {
        return atual;
      }
      const filhos = this.extrairFilhosBusca(atual);
      if (filhos.length) fila.push(...filhos);
    }
    return null;
  }

  private encontrarTopicoRaizPorNome(topicos: TopicoNodeDTO[], nome: string): TopicoNodeDTO | null {
    const alvo = this.toKey(nome);
    if (!alvo) return null;

    const lista = Array.isArray(topicos) ? topicos : [];
    return lista.find((topico) => this.toKey(String(topico?.descricao || '')) === alvo) || null;
  }

  private extrairFilhosBusca(topico: TopicoNodeDTO): TopicoNodeDTO[] {
    const filhos = topico?.subtopicos ?? topico?.filhos ?? [];
    return Array.isArray(filhos) ? filhos : [];
  }

  private getTopicoId(topico: TopicoNodeDTO | null | undefined): number {
    return Number(
      topico?.id ??
      (topico as any)?.topicoId ??
      (topico as any)?.subtopicoId ??
      (topico as any)?.idTopico ??
      (topico as any)?.idSubtopico ??
      0
    );
  }

  onObservacaoEditorInit(event: unknown): void {
    const eventObj = (event as { editor?: unknown }) || {};
    const quill = (eventObj.editor || event) as QuillEditorLike;
    this.quillObservacao = quill;

    quill.clipboard?.addMatcher('IMG', () => ({ ops: [] }));

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
      const hasImage = Array.from(files).some((f) => f.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    quill.root?.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const hasImage = Array.from(items).some((i) => i.type.startsWith('image/'));
      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  onObservacaoChange(): void {
    const quill = this.quillObservacao;
    if (!quill) return;
    const length = Math.max(0, (quill.getLength?.() ?? 0) - 1);
    this.atualizarContadorCaracteres(Math.min(length, this.maxCaracteres));
  }

  private atualizarContadorCaracteres(quantidade: number): void {
    const usado = Math.max(0, Math.min(this.maxCaracteres, quantidade));
    this.caracteresUsados = usado;
    this.caracteresRestantes = Math.max(0, this.maxCaracteres - usado);
  }

  private normalizarHtmlAnotacoes(html: string): string {
    const normalizado = String(html || '').replace(/(?:<p><br><\/p>|\s*<p>\s*<\/p>)+/gi, '<p><br></p>').trim();
    return normalizado;
  }

  private extrairTextoDoHtml(html: string): string {
    const base = String(html || '').trim();
    if (!base) return '';
    if (typeof document === 'undefined') {
      return base.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const container = document.createElement('div');
    container.innerHTML = base;
    return (container.textContent || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (!error) return 'Nao foi possivel registrar agora. Tente novamente.';
    if (error.status === 400) return 'Dados invalidos. Revise os campos obrigatorios.';
    if (error.status === 401) return 'Sessao expirada. Faca login novamente.';
    if (error.status === 404) return 'Endpoint de registro nao encontrado.';
    return 'Nao foi possivel registrar agora. Tente novamente.';
  }
}
