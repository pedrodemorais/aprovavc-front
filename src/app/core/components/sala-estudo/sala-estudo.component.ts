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

  arvoreTopicos: any[] = [];

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // modo de revisão (anotações x flashcards)
  modoRevisao: 'anotacoes' | 'flashcards' = 'anotacoes';

  // ======================= TIMER / POMODORO =======================

  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // total decorrido no cronômetro (modo livre)
  tempoTotalSegundos: number = 0;

  // quanto tempo já foi efetivamente salvo no backend para o tópico atual (em segundos)
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

  // modo foco na revisão (tela cheia)
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

  mensagemFlashcardRevisao?: string;

// “status da sessão” (opcional)
revisouAnotacoesSessao: boolean = false;
revisouFlashcardsSessao: boolean = false;


  // lista de flashcards (usada tanto em estudar quanto revisar)
  flashcards: FlashcardDTO[] = [];
  flashcardIndexAtual: number = 0;
  mostrarVersoAtual: boolean = false;

  // ESTADO DA REVISÃO (carregando flashcards de revisão)
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

      console.log('[SALA-ESTUDO] materiaId =', this.materiaId);

      if (!this.materiaId) {
        this.erro = 'Matéria não informada na rota.';
        return;
      }

      this.carregarMateria();
      this.carregarTopicos();
      this.carregarRevisoesDashboard(); // 👈 trás o semáforo
    });
  }

onEditorInit(event: any) {
  const quill = event?.editor || event; // PrimeNG pode mandar direto ou dentro de .editor

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

  // Bloqueia paste de imagem (binário)
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
          this.erro = 'Matéria não encontrada para este aluno.';
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar matéria:', err);
        this.carregando = false;
        this.erro = 'Erro ao carregar dados da matéria.';
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
  console.log('[SALA-ESTUDO] Carregando tópicos da matériaId =', this.materiaId);

  this.materiaService.listarTopicos(this.materiaId).subscribe({
    next: (lista) => {
      const listaSegura = lista || [];
      console.log('[SALA-ESTUDO] DTO bruto de tópicos (árvore):', listaSegura);

      this.arvoreTopicos = listaSegura;
      this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

      console.log('[SALA-ESTUDO] Lista achatada (topicos):', this.topicos);

      // 👉 ao abrir a sala (ou dar F5), se ainda não tiver tópico selecionado,
      // escolhe o PRIMEIRO tópico "estudável":
      // - não tem filhos (leaf)
      // - está ativo (se você quiser considerar isso)
      if (!this.topicoSelecionado && this.topicos.length) {

        // primeiro leaf ativo
        let primeiroEstudavel = this.topicos.find(t => !t.hasFilhos && t.ativo !== false);

        // se por acaso não tiver leaf, cai no primeiro mesmo
        if (!primeiroEstudavel) {
          primeiroEstudavel = this.topicos[0];
        }

        if (primeiroEstudavel) {
          this.selecionarTopico(primeiroEstudavel);
        }
      }
    },
    error: (err) => {
      console.error('[SALA-ESTUDO] Erro ao carregar tópicos:', err);
      this.erro = 'Erro ao carregar tópicos da matéria.';
    }
  });
}

ativarRevisaoAnotacoes(): void {
  this.modoRevisao = 'anotacoes';

  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    // se quiser, pode forçar recarregar anotações aqui também
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

  // se já tiver um tópico selecionado, garante que os flashcards dele sejam carregados
  if (this.topicoSelecionado && this.topicoPermiteEstudo) {
    this.carregarFlashcards();
  }
}


  // ================================================================
  // INTERAÇÃO COM TÓPICOS
  // ================================================================

  /**
   * Tempo TOTAL que o cronômetro já contou nesta sessão (em segundos).
   * - Livre: tempoTotalSegundos
   * - Pomodoro: duração da fase - segundosRestantes
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

    // ao trocar de tópico, zera o acumulado já salvo para o novo tópico
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
          'Você já possui tempo de estudo neste tópico. Deseja salvar antes de mudar para outro tópico?'
        );

        if (desejaSalvar) {
          this.salvarEstudo();
        }
      }

      this.resetarTimerAoTrocarTopico();
    }

    this.topicoSelecionado = t;

    // ao selecionar tópico, carrega flashcards (modo estudar)
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

    // quando muda de modo, reinicia o acumulado do tópico no contexto do timer
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
      'Se você zerar o cronômetro agora, o tempo estudado até este momento NÃO será contabilizado para este tópico/matéria. Deseja realmente zerar?'
    );

    if (!confirmou) {
      return;
    }

    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    // o que já foi salvo no backend continua valendo

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
          console.warn('[POMODORO] Não foi possível tocar o som de alarme:', err);
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
    // quando entrar no modo revisar, se tiver tópico válido, carrega flashcards de revisão
    if (novoModo === 'revisar' && this.topicoPermiteEstudo) {
      this.carregarFlashcardsParaRevisao();
    }
  }

  // ================================================================
  // SALVAR ESTUDO
  // ================================================================

  salvarEstudo(): void {
    if (!this.topicoSelecionado) {
      this.erro = 'Selecione um tópico antes de salvar o estudo.';
      return;
    }

    const modoBack = this.modoTemporizador;

    // tempo TOTAL decorrido no cronômetro para este tópico / sessão
    const tempoAtualTotal = this.calcularTempoEstudoAtual();

    // apenas o DELTA desde o último salvamento
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

        // após salvar com sucesso, acumula o que foi enviado
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
  // FLASHCARD – MODAL (CRIAR)
  // ================================================================

  abrirModalFlashcard(): void {
    if (!this.topicoPermiteEstudo) {
      return;
    }

    this.mostrarModalFlashcard = true;

    if (!this.flashcardTags && this.materia && this.topicoSelecionado) {
      this.flashcardTags =
        `${this.materia.nome.toLowerCase()}, ${this.topicoSelecionado.descricao.toLowerCase()}`;
    }
  }

  fecharModalFlashcard(): void {
    this.mostrarModalFlashcard = false;
  }

  salvarFlashcard(): void {
    if (!this.topicoSelecionado) {
      alert('Selecione um tópico antes de criar o flashcard.');
      return;
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

        // confirmação visual
        this.mensagemFlashcardSucesso = 'Flashcard salvo com sucesso.';

        // limpa frente e verso pra já digitar o próximo, mantém tags e tipo/dificuldade
        this.flashcardFrente = '';
        this.flashcardVerso = '';

        // recarrega a lista de flashcards do tópico
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
  // FLASHCARDS – NAVEGAÇÃO E EXCLUSÃO
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

  virarFlashcard(): void {
    this.mostrarVersoAtual = !this.mostrarVersoAtual;
  }

  proximoFlashcard(): void {
    if (!this.flashcards.length) {
      return;
    }
    this.flashcardIndexAtual = (this.flashcardIndexAtual + 1) % this.flashcards.length;
    this.mostrarVersoAtual = false;
  }

  anteriorFlashcard(): void {
    if (!this.flashcards.length) {
      return;
    }
    this.flashcardIndexAtual =
      (this.flashcardIndexAtual - 1 + this.flashcards.length) % this.flashcards.length;
    this.mostrarVersoAtual = false;
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
          this.carregandoFlashcardsRevisao = false;
        },
        error: (err) => {
          console.error('[REVISÃO] Erro ao carregar flashcards de revisão:', err);
          this.erroFlashcardsRevisao = 'Erro ao carregar flashcards para revisão.';
          this.carregandoFlashcardsRevisao = false;
          this.flashcards = [];
        }
      });
  }

  /**
   * Marca o flashcard atual como ERREI / DIFICIL / BOM / FACIL
   * e deixa o back recalcular a próxima revisão.
   */
avaliarFlashcard(avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL'): void {
  const atual = this.flashcardAtual;
  if (!atual || !atual.id) {
    return;
  }

  const req: FlashcardRevisaoRespostaRequest = {
    flashcardId: atual.id,
    avaliacao
  };

  this.salaEstudoService.responderRevisaoFlashcard(req).subscribe({
    next: () => {
      this.proximoFlashcard();
      this.recarregarTopicosAposRevisao();

      // 👇 feedback visual
      this.mostrarMensagemRevisao('Revisão do flashcard registrada!');
    },
    error: (err) => {
      console.error('[REVISÃO] Erro ao registrar resposta do flashcard:', err);
      alert('Erro ao registrar resposta da revisão. Tente novamente.');
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

  this.salaEstudoService.responderRevisaoTopico(req).subscribe({
    next: () => {
      console.log('[REVISÃO] Revisão de anotações registrada com sucesso');
      this.recarregarTopicosAposRevisao();

      // 👇 feedback visual
      this.mostrarMensagemRevisao('Revisão das anotações registrada!');
    },
    error: (err) => {
      console.error('[REVISÃO] Erro ao registrar revisão de anotações:', err);
      alert('Erro ao registrar revisão das anotações. Tente novamente.');
    }
  });
}



// --- INÍCIO BLOCO: SONS DE FOCO POR ÍCONE ---




// --- FIM BLOCO: SONS DE FOCO POR ÍCONE ---

  /** Mapa: topicoId -> info de revisão (status + próxima data) */
  private revisoesPorTopico = new Map<number, {
    status: StatusRevisao;
    proximaRevisao?: string | null;
  }>();

    /**
   * Constrói uma data local (sem problema de UTC) a partir de 'YYYY-MM-DD'.
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
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar revisões dashboard:', err);
      }
    });
  }

    /** Define a "força" de cada status para comparar pai x filhos */
  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3; // mais crítico
      case 'HOJE':     return 2;
      case 'FUTURA':   return 1;
      case 'SEM':
      default:         return 0;
    }
  }

  /** Busca um DTO de tópico na árvore original pelo id */
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
   * Status consolidado do tópico na ÁRVORE:
   * considera o próprio id + todos os subtopicos.
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
   * Dado o nó achatado (t da lista da esquerda),
   * devolve o status consolidado (ele + filhos), usando a árvore original.
   */
  private getStatusRevisaoTopicoView(t: any): StatusRevisao {
    if (!t || !t.id) {
      return 'SEM';
    }

    const dto = this.encontrarDtoPorId(this.arvoreTopicos, t.id);
    if (!dto) {
      // fallback: só o próprio
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

  // 1) Atualiza o mapa de revisões (é daqui que vem o semáforo)
  this.carregarRevisoesDashboard();

  // 2) Recarrega a árvore de tópicos (efeito "F5" na coluna esquerda)
  this.materiaService.listarTopicos(this.materiaId).subscribe({
    next: (lista) => {
      const listaSegura = lista || [];
      console.log('[SALA-ESTUDO] Recarregando tópicos após revisão:', listaSegura);

      this.arvoreTopicos = listaSegura;
      this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

      // tenta manter o mesmo tópico selecionado
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
  }, 3000); // some depois de 3s
}


}
