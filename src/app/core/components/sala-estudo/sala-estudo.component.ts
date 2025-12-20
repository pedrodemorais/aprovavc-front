import { FlashcardDTO } from 'src/app/core/models/FlashcardDTO';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Materia } from 'src/app/core/models/materia.model';
import {
  SalaEstudoService,
  EstudoTopicoRequest,
  FlashcardRevisaoRespostaRequest,
  TopicoRevisaoRespostaRequest
} from '../../services/sala-estudo.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit {
  mensagemRevisao?: string;
  materiaId!: number;
  materia?: Materia;

  mensagemFlashcardSucesso?: string;
  anotacoesHtmlSeguras: SafeHtml | null = null;

  anotacoes: string = '';
  mensagemEstudoSalvo?: string;

  topicos: any[] = [];
  topicoSelecionado?: any | null;
  private topicoIdPreferido: number | null = null;

  arvoreTopicos: any[] = [];

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // modo de revisao (anotacoes x flashcards)
  modoRevisao: 'anotacoes' | 'flashcards' = 'anotacoes';

  // ======================= TIMER / POMODORO =======================

  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // total decorrido no cronometro (modo livre)
  tempoTotalSegundos: number = 0;

  // quanto tempo ja foi efetivamente salvo no backend para o topico atual (em segundos)
  private segundosEstudoJaSalvosTopicoAtual: number = 0;

  timerAtivo: boolean = false;
  private timerRef: any;

  pomodoroDuracaoFoco: number = 30;        // testes
  pomodoroDuracaoPausaCurta: number = 5;   // testes
  pomodoroDuracaoPausaLonga: number = 15;  // testes
  pomodoroCiclosParaLonga: number = 4;

  pomodoroFase: 'foco' | 'pausa-curta' | 'pausa-longa' = 'foco';
  pomodoroSegundosRestantes: number = this.pomodoroDuracaoFoco;
  pomodoroCiclosConcluidos: number = 0;

  // modo foco na revisao (tela cheia)
  modoRevisaoFocoAtivo: boolean = false;

  ativarModoFocoRevisao(): void {
    this.modoRevisaoFocoAtivo = true;
  }

  sairModoFocoRevisao(): void {
    this.modoRevisaoFocoAtivo = false;
  }

  private audioAlarme?: HTMLAudioElement;
  alarmeAtivo: boolean = false;

  // =============== FLASHCARD (ESTADO) ===============
  mostrarModalFlashcard: boolean = false;

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

  constructor(
    private route: ActivatedRoute,
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private sanitizer: DomSanitizer
  ) {}

  // ================================================================
  // CICLO DE VIDA
  // ================================================================

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const idParam = params.get('materiaId') ?? params.get('id');
      this.materiaId = idParam ? Number(idParam) : 0;
      this.topicoIdPreferido = this.getTopicoIdFromQuery();

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

    // Remove qualquer IMG que venha do clipboard (inclui base64)
    quill.clipboard.addMatcher('IMG', () => {
      return { ops: [] };
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

        // Ao abrir a sala: se vier topicoId pela query, usa ele.
        if (!this.topicoSelecionado && this.topicos.length) {
          let alvo: any | undefined;
          if (this.topicoIdPreferido) {
            const candidato = this.topicos.find(t => t.id === this.topicoIdPreferido);
            if (candidato && !candidato.hasFilhos) {
              alvo = candidato;
            }
          }

          if (!alvo) {
            // primeiro leaf ativo
            alvo = this.topicos.find(t => !t.hasFilhos && t.ativo !== false);
          }

          // se por acaso nao tiver leaf, cai no primeiro mesmo
          if (!alvo) {
            alvo = this.topicos[0];
          }

          if (alvo) {
            this.selecionarTopico(alvo);
          }
        }
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

  ativarRevisaoAnotacoes(): void {
  this.modoRevisao = 'anotacoes';

  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    // se quiser, pode for├ºar recarregar anota├º├Áes aqui tamb├®m
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

  // se j├í tiver um t├│pico selecionado, garante que os flashcards dele sejam carregados
  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    this.carregarFlashcards();
  }
}


  // ================================================================
  // INTERA├ç├âO COM T├ôPICOS
  // ================================================================

  /**
   * Tempo TOTAL que o cron├┤metro j├í contou nesta sess├úo (em segundos).
   * - Livre: tempoTotalSegundos
   * - Pomodoro: dura├º├úo da fase - segundosRestantes
   */
  private calcularTempoEstudoAtual(): number {
    if (this.modoTemporizador === 'livre') {
      return this.tempoTotalSegundos;
    }
    return this.duracaoFaseAtual - this.pomodoroSegundosRestantes;
  }

  private resetarTimerAoTrocarTopico(): void {
    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    // ao trocar de t├│pico, zera o acumulado j├í salvo para o novo t├│pico
    this.segundosEstudoJaSalvosTopicoAtual = 0;

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
    const trocandoDeTopico =
      this.topicoSelecionado && this.topicoSelecionado.id !== t.id;

    if (trocandoDeTopico) {
      const tempoAtual = this.calcularTempoEstudoAtual();

      const temAlgoParaSalvar =
        tempoAtual > 0 &&
        this.topicoPermiteEstudo;

      if (temAlgoParaSalvar) {
        const desejaSalvar = window.confirm(
          'Voc├¬ j├í possui tempo de estudo neste t├│pico. Deseja salvar antes de mudar para outro t├│pico?'
        );

        if (desejaSalvar) {
          this.salvarEstudo();
        }
      }

      this.resetarTimerAoTrocarTopico();
    }

    this.topicoSelecionado = t;

    // ao selecionar t├│pico, carrega flashcards (modo estudar)
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

    // se j├í estiver no modo revisar, ao trocar de t├│pico recarrega os flashcards para revis├úo
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

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    // quando muda de modo, reinicia o acumulado do t├│pico no contexto do timer
    this.segundosEstudoJaSalvosTopicoAtual = 0;

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
      return;
    }

    this.timerAtivo = true;

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
      'Se voc├¬ zerar o cron├┤metro agora, o tempo estudado at├® este momento N├âO ser├í contabilizado para este t├│pico/mat├®ria. Deseja realmente zerar?'
    );

    if (!confirmou) {
      return;
    }

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    // o que j├í foi salvo no backend continua valendo

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

    this.timerRef = setInterval(() => {
      this.tempoTotalSegundos++;
    }, 1000);
  }

  private iniciarPomodoro(): void {
    this.pararTimerInterno();

    this.timerRef = setInterval(() => {
      if (this.pomodoroSegundosRestantes > 0) {
        this.pomodoroSegundosRestantes--;
        return;
      }

      this.trocarFasePomodoro();
    }, 1000);
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
          console.warn('[POMODORO] N├úo foi poss├¡vel tocar o som de alarme:', err);
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
    // quando entrar no modo revisar, se tiver t├│pico v├ílido, carrega flashcards de revis├úo
    if (novoModo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }
  }

  // ================================================================
  // SALVAR ESTUDO
  // ================================================================

  salvarEstudo(): void {
    if (!this.topicoSelecionado) {
      this.erro = 'Selecione um t├│pico antes de salvar o estudo.';
      return;
    }

    const modoBack = this.modoTemporizador;

    // tempo TOTAL decorrido no cron├┤metro para este t├│pico / sess├úo
    const tempoAtualTotal = this.calcularTempoEstudoAtual();

    // apenas o DELTA desde o ├║ltimo salvamento
    let tempoParaSalvar = tempoAtualTotal - this.segundosEstudoJaSalvosTopicoAtual;
    if (tempoParaSalvar < 0) {
      tempoParaSalvar = 0;
    }

    const payload: EstudoTopicoRequest = {
      materiaId: this.materiaId,
      topicoId: this.topicoSelecionado.id,
      modoTemporizador: modoBack,
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

        // ap├│s salvar com sucesso, acumula o que foi enviado
        this.segundosEstudoJaSalvosTopicoAtual += tempoParaSalvar;

        this.mensagemEstudoSalvo = 'Estudo salvo com sucesso.';
        setTimeout(() => (this.mensagemEstudoSalvo = undefined), 4000);
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao salvar estudo:', err);
        this.erro = 'Erro ao salvar o estudo. Tente novamente.';
      }
    });
  }

  // ================================================================
  // FLASHCARD ÔÇô MODAL (CRIAR)
  // ================================================================

  abrirModalFlashcard(): void {
    if (!this.topicoPermiteEstudo) {
      return;
    }

    this.mostrarModalFlashcard = true;
    this.onFlashcardTipoChange(this.flashcardTipo);

    if (!this.flashcardTags && this.materia && this.topicoSelecionado) {
      this.flashcardTags =
        `${this.materia.nome.toLowerCase()}, ${this.topicoSelecionado.descricao.toLowerCase()}`;
    }
  }

  fecharModalFlashcard(): void {
    this.mostrarModalFlashcard = false;
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
      alert('Selecione um t├│pico antes de criar o flashcard.');
      return;
    }

    if (this.flashcardTipo === 'VERDADEIRO_FALSO') {
      if (!this.flashcardVerdadeiroFalso) {
        alert('Selecione se a resposta é verdadeira ou falsa.');
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

        // confirma├º├úo visual
        this.mensagemFlashcardSucesso = 'Flashcard salvo com sucesso.';

        // limpa frente e verso pra j├í digitar o pr├│ximo, mant├®m tags e tipo/dificuldade
        this.flashcardFrente = '';
        this.flashcardVerso = '';
        this.flashcardVerdadeiroFalso = null;

        // recarrega a lista de flashcards do t├│pico
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
  // FLASHCARDS ÔÇô NAVEGA├ç├âO E EXCLUS├âO
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
    this.flashcardIndexAtual = (this.flashcardIndexAtual + 1) % this.flashcards.length;
    this.mostrarVersoAtual = false;
    this.avaliacaoFlashcardSelecionada = null;
    this.resetFlashcardFeedback();
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
  // REVIS├âO ESPA├çADA (FLASHCARDS + ANOTA├ç├òES)
  // ================================================================

  /**
   * Carrega apenas os flashcards vencidos / para hoje para o t├│pico atual.
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
        },
        error: (err) => {
          console.error('[REVIS├âO] Erro ao carregar flashcards de revis├úo:', err);
          this.erroFlashcardsRevisao = 'Erro ao carregar flashcards para revis├úo.';
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
   * e deixa o back recalcular a próxima revisão.
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
      },
      error: (err) => {
        console.error('[REVISAO] Erro ao registrar resposta do flashcard:', err);
        alert('Erro ao registrar resposta da revisao. Tente novamente.');
        this.enviandoAvaliacaoFlashcard = false;
      }
    });
  }
  /**
   * Marca a revis├úo das anota├º├Áes (n├¡vel t├│pico) como ERREI / DIFICIL / BOM / FACIL.
   * O servidor cuida da l├│gica das "caixinhas" do t├│pico.
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

  this.salaEstudoService.responderRevisaoTopico(req).subscribe({
    next: () => {
      console.log('[REVIS├âO] Revis├úo de anota├º├Áes registrada com sucesso');
      this.recarregarTopicosAposRevisao();

      // ­ƒæç feedback visual
      this.mostrarMensagemRevisao('Revis├úo das anota├º├Áes registrada!');
    },
    error: (err) => {
      console.error('[REVIS├âO] Erro ao registrar revis├úo de anota├º├Áes:', err);
      alert('Erro ao registrar revis├úo das anota├º├Áes. Tente novamente.');
    }
  });
}



// --- IN├ìCIO BLOCO: SONS DE FOCO POR ├ìCONE ---




// --- FIM BLOCO: SONS DE FOCO POR ├ìCONE ---

  /** Mapa: topicoId -> info de revis├úo (status + pr├│xima data) */
  private revisoesPorTopico = new Map<number, {
    status: StatusRevisao;
    proximaRevisao?: string | null;
  }>();

    /**
   * Constr├│i uma data local (sem problema de UTC) a partir de 'YYYY-MM-DD'.
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
   * Carrega o dashboard geral de revis├Áes e monta o mapa por t├│pico.
   * Reutiliza a mesma l├│gica da tela de mat├®rias.
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
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar revis├Áes dashboard:', err);
      }
    });
  }

    /** Define a "for├ºa" de cada status para comparar pai x filhos */
  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3; // mais cr├¡tico
      case 'HOJE':     return 2;
      case 'FUTURA':   return 1;
      case 'SEM':
      default:         return 0;
    }
  }

  /** Busca um DTO de t├│pico na ├írvore original pelo id */
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
   * Status "simples" de um t├│pico, olhando s├│ o pr├│prio id no mapa de revis├Áes.
   * (Dashboard j├í calculou o status com base na data).
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
   * Status consolidado do t├│pico na ├üRVORE:
   * considera o pr├│prio id + todos os subtopicos.
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
   * Dado o n├│ achatado (t da lista da esquerda),
   * devolve o status consolidado (ele + filhos), usando a ├írvore original.
   */
  private getStatusRevisaoTopicoView(t: any): StatusRevisao {
    if (!t || !t.id) {
      return 'SEM';
    }

    const dto = this.encontrarDtoPorId(this.arvoreTopicos, t.id);
    if (!dto) {
      // fallback: s├│ o pr├│prio
      return this.getStatusSimplesTopico(t.id);
    }

    return this.getStatusRevisaoTopicoNaArvore(dto);
  }

  /** Classes CSS para a bolinha da Sala de Estudo */
  classeSemaforoRevisaoSala(t: any) {
    const status = this.getStatusRevisaoTopicoView(t);

    return {
      'badge-sem-revisao': status === 'SEM',
      'badge-revisao-futura': status === 'FUTURA',
      'badge-revisao-hoje': status === 'HOJE',
      'badge-revisao-atrasada': status === 'ATRASADA'
    };
  }

  /** Recarrega a ├írvore de t├│picos para atualizar o sem├íforo
 *  preservando o t├│pico selecionado.
 */
/** Recarrega revis├Áes + ├írvore de t├│picos para atualizar o sem├íforo,
 *  preservando o t├│pico selecionado.
 */
private recarregarTopicosAposRevisao(): void {
  if (!this.materiaId) {
    return;
  }

  const idSelecionado = this.topicoSelecionado?.id;

  // 1) Atualiza o mapa de revis├Áes (├® daqui que vem o sem├íforo)
  this.carregarRevisoesDashboard();

  // 2) Recarrega a ├írvore de t├│picos (efeito "F5" na coluna esquerda)
  this.materiaService.listarTopicos(this.materiaId).subscribe({
    next: (lista) => {
      const listaSegura = lista || [];
      console.log('[SALA-ESTUDO] Recarregando t├│picos ap├│s revis├úo:', listaSegura);

      this.arvoreTopicos = listaSegura;
      this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

      // tenta manter o mesmo t├│pico selecionado
      if (idSelecionado) {
        const encontrado = this.topicos.find(t => t.id === idSelecionado);
        if (encontrado) {
          this.topicoSelecionado = encontrado;
        }
      }
    },
    error: (err) => {
      console.error('[SALA-ESTUDO] Erro ao recarregar t├│picos ap├│s revis├úo:', err);
    }
  });
}
private mostrarMensagemRevisao(texto: string): void {
  this.mensagemRevisao = texto;
  setTimeout(() => {
    this.mensagemRevisao = undefined;
  }, 3000); // some depois de 3s
}


}
