import { FlashcardDTO } from 'src/app/core/models/FlashcardDTO';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Materia } from 'src/app/core/models/materia.model';
import { SalaEstudoService, EstudoTopicoRequest } from '../../services/sala-estudo.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';


@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {

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
  // 👇 adiciona isso:
modoRevisao: 'anotacoes' | 'flashcards' = 'anotacoes';

  // ======================= TIMER / POMODORO =======================

  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // total decorrido no cronômetro (modo livre)
  tempoTotalSegundos: number = 0;

  // *** NOVO: quanto tempo já foi efetivamente salvo no backend
  // para o tópico atual (em segundos)
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

// 👇 adiciona isso:
modoRevisaoFocoAtivo: boolean = false;

ativarModoFocoRevisao(): void {
  this.modoRevisaoFocoAtivo = true;
}

sairModoFocoRevisao(): void {
  this.modoRevisaoFocoAtivo = false;
}



  private audioAlarme?: HTMLAudioElement;
  alarmeAtivo: boolean = false;

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

    // =============== FLASHCARD (ESTADO) ===============
  mostrarModalFlashcard: boolean = false;

  flashcardFrente: string = '';
  flashcardVerso: string = '';
  flashcardTipo: string = 'PERGUNTA_RESPOSTA';
  flashcardDificuldade: string = 'MEDIA';
  flashcardTags: string = '';

  // lista de flashcards para revisão do tópico atual
  flashcards: FlashcardDTO[] = [];
  flashcardIndexAtual: number = 0;
  mostrarVersoAtual: boolean = false;




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
    });
  }

  ngOnDestroy(): void {
    this.pararTimerInterno();
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

        if (this.topicos.length && !this.topicoSelecionado) {
          this.topicoSelecionado = this.topicos[0];
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar tópicos:', err);
        this.erro = 'Erro ao carregar tópicos da matéria.';
      }
    });
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

        // ao selecionar tópico, carrega flashcards
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

    // aqui NÃO mexemos em segundosEstudoJaSalvosTopicoAtual,
    // porque o que já foi salvo no backend continua valendo

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

    // tempo TOTAL decorrido no cronômetro para este tópico/ sessão
    const tempoAtualTotal = this.calcularTempoEstudoAtual();

    // *** NOVO: apenas o DELTA desde o último salvamento ***
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
  // FLASHCARD – MODAL
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

      // limpa frente e verso pra já digitar o próximo,
      // mantém tags e tipo/dificuldade
      this.flashcardFrente = '';
      this.flashcardVerso = '';

      // recarrega a lista de flashcards do tópico
      if (this.topicoSelecionado) {
        this.carregarFlashcards();
      }

      // some com a mensagem depois de alguns segundos (opcional)
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


  get existeFlashcardAtual(): boolean {
    return this.flashcards && this.flashcards.length > 0 && this.flashcardIndexAtual >= 0
      && this.flashcardIndexAtual < this.flashcards.length;
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

}
