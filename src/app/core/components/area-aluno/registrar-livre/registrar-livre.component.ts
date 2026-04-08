import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';
import { EstudoLivreService } from '../services/estudo-livre.service';
import { MateriaTopicosDTO, SalaEstudoService, TopicoNodeDTO, VocabularioDTO } from '../services/sala-estudo.service';
import { EditalService } from '../services/edital.service';
import { FlashcardService } from '../services/flashcard.service';
import { FlashcardDTO } from '../models/FlashcardDTO';

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
  @ViewChild('materiaInput') materiaInput?: ElementRef<HTMLInputElement>;

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

  readonly maxCaracteres = 1200;
  readonly form = this.fb.group({
    agrupador: [''],
    materiaNome: ['', [Validators.required]],
    topicoNome: ['', [Validators.required]],
    subtopicoNome: [''],
    tempoMinutos: [30, [Validators.required, Validators.min(1), Validators.max(1440)]],
    observacao: ['']
  });

  enviando = false;
  feedbackErro = '';
  feedbackSucesso = '';
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
  campoAutocompleteAberto: CampoAutocomplete | null = null;
  mostrarTodosNoCampo: CampoAutocomplete | null = null;

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
    private flashcardService: FlashcardService
  ) {}

  ngAfterViewInit(): void {
    this.carregarDadosAutocomplete();
    this.carregarEditaisAgrupador();
    setTimeout(() => this.materiaInput?.nativeElement.focus(), 0);
  }

  ngOnDestroy(): void {
    this.pararIntervaloTimer();
  }

  get materiaInvalida(): boolean {
    const control = this.form.controls.materiaNome;
    return control.invalid && (control.touched || control.dirty);
  }

  get topicoInvalido(): boolean {
    const control = this.form.controls.topicoNome;
    return control.invalid && (control.touched || control.dirty);
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
    this.campoAutocompleteAberto = campo;
    this.mostrarTodosNoCampo = null;
    this.atualizarSugestoes(campo);
  }

  onCampoInput(campo: CampoAutocomplete): void {
    this.campoAutocompleteAberto = campo;
    this.mostrarTodosNoCampo = null;
    this.atualizarSugestoes(campo);
  }

  onCampoBlur(): void {
    setTimeout(() => {
      this.campoAutocompleteAberto = null;
      this.mostrarTodosNoCampo = null;
    }, 120);
  }

  selecionarSugestao(campo: CampoAutocomplete, valor: string): void {
    this.form.controls[campo].setValue(valor);
    this.form.controls[campo].markAsDirty();

    if (campo === 'materiaNome') {
      this.form.controls.topicoNome.setValue('');
      this.form.controls.subtopicoNome.setValue('');
      this.atualizarSugestoes('topicoNome');
      this.atualizarSugestoes('subtopicoNome');
    } else if (campo === 'agrupador') {
      this.form.controls.materiaNome.setValue('');
      this.form.controls.topicoNome.setValue('');
      this.form.controls.subtopicoNome.setValue('');
      this.atualizarSugestoes('materiaNome');
      this.atualizarSugestoes('topicoNome');
      this.atualizarSugestoes('subtopicoNome');
    } else if (campo === 'topicoNome') {
      this.form.controls.subtopicoNome.setValue('');
      this.atualizarSugestoes('subtopicoNome');
    }

    this.campoAutocompleteAberto = null;
    this.mostrarTodosNoCampo = null;
  }

  exibirDropdown(campo: CampoAutocomplete): boolean {
    return this.campoAutocompleteAberto === campo && this.sugestoesVisiveis[campo].length > 0;
  }

  toggleTodosAgrupadores(event: Event): void {
    this.toggleMostrarTodos('agrupador', event);
  }

  toggleTodosCampo(campo: CampoAutocomplete, event: Event): void {
    this.toggleMostrarTodos(campo, event);
  }

  private toggleMostrarTodos(campo: CampoAutocomplete, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.campoAutocompleteAberto = campo;
    this.mostrarTodosNoCampo = campo;
    this.atualizarSugestoes(campo);
  }

  registrarEstudo(): void {
    this.feedbackErro = '';
    this.feedbackSucesso = '';
    this.estruturaCriada = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const materiaNome = String(this.form.value.materiaNome || '').trim();
    const topicoNome = String(this.form.value.topicoNome || '').trim();
    const subtopicoNome = String(this.form.value.subtopicoNome || '').trim();
    const agrupador = String(this.form.value.agrupador || '').trim();
    const observacaoHtml = this.normalizarHtmlAnotacoes(this.observacaoHtml || '');
    const observacao = this.extrairTextoDoHtml(observacaoHtml).trim();
    const tempoMinutos = this.resolverTempoMinutosParaRegistro();
    this.form.controls.tempoMinutos.setValue(tempoMinutos);

    if (!materiaNome || !topicoNome || tempoMinutos <= 0) {
      this.form.markAllAsTouched();
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
      finalize(() => (this.enviando = false))
    )
      .subscribe({
        next: () => {
          this.salvarHistorico({
            agrupador,
            materiaNome,
            topicoNome,
            subtopicoNome
          });
          this.feedbackSucesso = 'Estudo registrado e já entrou no seu ciclo de revisão';
          this.estruturaCriada = {
            materiaNome,
            topicoNome,
            subtopicoNome: subtopicoNome || undefined
          };
          this.limparMantendoMateria(materiaNome);
        },
        error: (error: HttpErrorResponse) => {
          this.feedbackErro = this.getErrorMessage(error);
        }
      });
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

  private limparMantendoMateria(materiaNome: string): void {
    this.form.reset({
      agrupador: '',
      materiaNome,
      topicoNome: '',
      subtopicoNome: '',
      tempoMinutos: 30,
      observacao: ''
    });
    this.observacaoHtml = '';
    this.tempoManual = '';
    this.mensagemFlashcardErro = '';
    this.mensagemFlashcardSucesso = '';
    this.atualizarContadorCaracteres(0);
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.atualizarSugestoes('materiaNome');
    this.atualizarSugestoes('topicoNome');
    this.atualizarSugestoes('subtopicoNome');
  }

  private carregarDadosAutocomplete(): void {
    const historico = this.lerHistorico();
    this.agrupadoresHistorico = historico.agrupadores;

    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
      next: (materias) => {
        this.usandoFallbackLocal = false;
        this.aplicarCatalogoDaApi(materias || []);
        this.atualizarSugestoesIniciais();
      },
      error: () => {
        this.usandoFallbackLocal = true;
        this.aplicarFallbackLocal(historico);
        this.atualizarSugestoesIniciais();
      }
    });
  }

  private carregarEditaisAgrupador(): void {
    this.editalService.listarComInclude(['materias', 'topicos']).subscribe({
      next: (editais) => {
        const lista = editais || [];
        this.hidratarCatalogoEditais(lista);
        this.aplicarEditalPadraoMaisRecente(lista);
        this.atualizarSugestoes('agrupador');
      },
      error: () => {
        this.editalService.listar().subscribe({
          next: (editais) => {
            const lista = editais || [];
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
            this.aplicarEditalPadraoMaisRecente(lista);
            this.atualizarSugestoes('agrupador');
          },
          error: () => {
            this.agrupadoresCatalogo = [];
            this.editaisCatalogo = [];
            this.atualizarSugestoes('agrupador');
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

  private aplicarEditalPadraoMaisRecente(editais: any[]): void {
    const ultimo = this.obterUltimoEditalCadastrado(editais);
    if (!ultimo) {
      this.form.controls.agrupador.setValue('');
      return;
    }

    const nome = this.normalizarTexto(String(ultimo?.nome || ''));
    if (!nome) {
      this.form.controls.agrupador.setValue('');
      return;
    }

    this.form.controls.agrupador.setValue(nome);
    this.atualizarSugestoes('materiaNome');
    this.atualizarSugestoes('topicoNome');
    this.atualizarSugestoes('subtopicoNome');
  }

  private obterUltimoEditalCadastrado(editais: any[]): any | null {
    const lista = Array.isArray(editais) ? editais.filter((e) => !!this.normalizarTexto(String(e?.nome || ''))) : [];
    if (!lista.length) {
      return null;
    }

    const scoreData = (edital: any): number => {
      const raw =
        edital?.dataCriacao ??
        edital?.createdAt ??
        edital?.criadoEm ??
        edital?.created_at ??
        null;
      if (!raw) return Number.NEGATIVE_INFINITY;
      const ts = Date.parse(String(raw));
      return Number.isFinite(ts) ? ts : Number.NEGATIVE_INFINITY;
    };

    const scoreId = (edital: any): number => {
      const id = Number(edital?.id || 0);
      return Number.isFinite(id) ? id : 0;
    };

    return lista.reduce((maisRecente, atual) => {
      if (!maisRecente) return atual;
      const dataAtual = scoreData(atual);
      const dataMaisRecente = scoreData(maisRecente);

      if (dataAtual > dataMaisRecente) return atual;
      if (dataAtual < dataMaisRecente) return maisRecente;
      return scoreId(atual) > scoreId(maisRecente) ? atual : maisRecente;
    }, null as any | null);
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

  private atualizarSugestoes(campo: CampoAutocomplete): void {
    const valorDigitado = this.normalizarTexto(String(this.form.controls[campo].value || ''));
    const base = this.obterBaseSugestoes(campo);
    const limite = campo === 'agrupador' ? this.limiteSugestoesAgrupador : this.limiteSugestoes;

    const lista = this.mostrarTodosNoCampo === campo
      ? base.slice(0, limite)
      : (!valorDigitado
          ? base.slice(0, limite)
          : base
          .filter((item) => item.toLowerCase().includes(valorDigitado.toLowerCase()))
          .slice(0, limite));

    this.sugestoesVisiveis[campo] = lista;
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
    const encontrada = base.find((m) => this.toKey(m) === this.toKey(atual));
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

  private salvarHistorico(payload: {
    agrupador?: string;
    materiaNome: string;
    topicoNome: string;
    subtopicoNome?: string;
  }): void {
    const atual = this.lerHistorico();
    const proximo: HistoricoRegistroLivre = {
      agrupadores: this.upsertHistorico(atual.agrupadores, payload.agrupador),
      materias: this.upsertHistorico(atual.materias, payload.materiaNome),
      topicos: this.upsertHistorico(atual.topicos, payload.topicoNome),
      subtopicos: this.upsertHistorico(atual.subtopicos, payload.subtopicoNome)
    };
    localStorage.setItem(this.historicoKey, JSON.stringify(proximo));
    this.agrupadoresHistorico = proximo.agrupadores;

    if (this.usandoFallbackLocal) {
      this.materiasCatalogo = proximo.materias;
      this.topicosCatalogo = proximo.topicos;
      this.subtopicosCatalogo = proximo.subtopicos;
    }
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
    try {
      const raw = localStorage.getItem(this.historicoKey);
      if (!raw) {
        return { agrupadores: [], materias: [], topicos: [], subtopicos: [] };
      }
      const parsed = JSON.parse(raw) as Partial<HistoricoRegistroLivre>;
      return {
        agrupadores: this.sanitizarLista(parsed?.agrupadores),
        materias: this.sanitizarLista(parsed?.materias),
        topicos: this.sanitizarLista(parsed?.topicos),
        subtopicos: this.sanitizarLista(parsed?.subtopicos)
      };
    } catch {
      return { agrupadores: [], materias: [], topicos: [], subtopicos: [] };
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
        const topico = this.encontrarTopicoPorNome(topicosRaiz, topicoNome);
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
