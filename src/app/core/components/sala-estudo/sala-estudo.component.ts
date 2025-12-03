import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Materia } from 'src/app/core/models/materia.model';
import { SalaEstudoService, EstudoTopicoRequest } from '../../services/sala-estudo.service';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {

  materiaId!: number;
  materia?: Materia;

  anotacoes: string = '';
  mensagemEstudoSalvo?: string;

  // lista usada na tela (já com tópicos + subtópicos achatados)
  topicos: any[] = [];
  topicoSelecionado?: any | null;

  // árvore original (se quiser usar depois)
  arvoreTopicos: any[] = [];
  

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // ======================= TIMER / POMODORO =======================

  // modo do temporizador: livre ou pomodoro
  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // ---- modo LIVRE ----
  tempoTotalSegundos: number = 0;

  // ---- estado geral do timer ----
  timerAtivo: boolean = false;
  private timerRef: any;

  // ---- POMODORO ----
  // tempos (ajustáveis depois)
  // pomodoroDuracaoFoco: number = 25 * 60;        // 25 min
  pomodoroDuracaoFoco: number = 30;        // para testes
  // pomodoroDuracaoPausaCurta: number = 5 * 60;   // 5 min
  pomodoroDuracaoPausaCurta: number = 5;   // para testes
  pomodoroDuracaoPausaLonga: number = 15;  // para testes
  // pomodoroDuracaoPausaLonga: number = 15 * 60;  // 15 min
  pomodoroCiclosParaLonga: number = 4;

  pomodoroFase: 'foco' | 'pausa-curta' | 'pausa-longa' = 'foco';
  pomodoroSegundosRestantes: number = this.pomodoroDuracaoFoco;
  pomodoroCiclosConcluidos: number = 0;

  // 🔔 controle do alarme
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

  // texto mostrado na tela (usa livre OU pomodoro dependendo do modo)
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

  constructor(
    private route: ActivatedRoute,
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService
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

  /**
   * Achata a árvore de tópicos vinda do backend (com subtopicos)
   * em uma lista linear, preservando o nível para usar na tela.
   */
 private achatarArvoreTopicos(lista: any[], nivel: number = 0, acumulador: any[] = []): any[] {
  for (const dto of lista) {
    const temFilhos = !!(dto.subtopicos && Array.isArray(dto.subtopicos) && dto.subtopicos.length);

    const node = {
      id: dto.id,
      descricao: dto.descricao,
      ativo: dto.ativo ?? true,
      nivel,
      materiaId: dto.materiaId,
      hasFilhos: temFilhos,   // 👈 flag pra saber se é pai
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

selecionarTopico(t: any): void {
  const trocandoDeTopico =
    this.topicoSelecionado && this.topicoSelecionado.id !== t.id;

  if (trocandoDeTopico) {
    // tempo estudado no tópico atual
    const tempoAtual = this.calcularTempoEstudoAtual();

    // Só considera que há algo a salvar se:
    // - o tópico atual permite estudo (não é pai)
    // - e há tempo contado > 0
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

    // Sempre zera/para timer ao trocar de tópico
    this.resetarTimerAoTrocarTopico();
  }

  // agora sim troca o tópico selecionado
  this.topicoSelecionado = t;

  // se for tópico com subtópicos, não carrega anotações (não pode ter estudo)
  if (!this.topicoPermiteEstudo) {
    this.anotacoes = '';
    return;
  }

  this.salaEstudoService.buscarAnotacoes(t.id).subscribe({
    next: (resp) => {
      this.anotacoes = resp.anotacoes || '';
    },
    error: () => {
      this.anotacoes = '';
    }
  });
}



/**
 * Zera o cronômetro ao trocar de tópico, sem confirmação
 * e sem salvar tempo acumulado.
 */
private resetarTimerAoTrocarTopico(): void {
  // para qualquer timer rodando
  this.pararTimerInterno();
  this.silenciarAlarme();
  this.timerAtivo = false;

  if (this.modoTemporizador === 'livre') {
    // modo livre: zera a contagem total
    this.tempoTotalSegundos = 0;
  } else {
    // pomodoro: volta para foco inicial
    this.pomodoroFase = 'foco';
    this.pomodoroCiclosConcluidos = 0;
    this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
  }
}


private calcularTempoEstudoAtual(): number {
  if (this.modoTemporizador === 'livre') {
    return this.tempoTotalSegundos;
  } else {
    // tempo já gasto na fase atual do pomodoro
    return this.duracaoFaseAtual - this.pomodoroSegundosRestantes;
  }
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

    this.modoTemporizador = modo;

    if (modo === 'livre') {
      if (!this.tempoTotalSegundos) {
        this.tempoTotalSegundos = 0;
      }
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
  salvarEstudo(): void {
  if (!this.topicoSelecionado || !this.topicoPermiteEstudo) {
    this.erro = 'Selecione um tópico válido antes de salvar o estudo.';
    return;
  }

  const modoBack = this.modoTemporizador; // 'livre' ou 'pomodoro'

  // 👇 agora usa o helper
  const tempoEstudo = this.calcularTempoEstudoAtual();

  const payload: EstudoTopicoRequest = {
    materiaId: this.materiaId,
    topicoId: this.topicoSelecionado.id,
    modoTemporizador: modoBack,
    tempoLivreSegundos: tempoEstudo,
    anotacoes: this.anotacoes,
    pomodoroFase: this.modoTemporizador === 'pomodoro' ? this.pomodoroFase : undefined,
    pomodoroCiclosConcluidos: this.modoTemporizador === 'pomodoro'
      ? this.pomodoroCiclosConcluidos
      : undefined
  };

  this.salaEstudoService.salvarEstudo(payload).subscribe({
    next: (resp) => {
      console.log('[SALA-ESTUDO] Estudo salvo:', resp);
      this.mensagemEstudoSalvo = 'Estudo salvo com sucesso.';
      setTimeout(() => (this.mensagemEstudoSalvo = undefined), 4000);
    },
    error: (err) => {
      console.error('[SALA-ESTUDO] Erro ao salvar estudo:', err);
      this.erro = 'Erro ao salvar o estudo. Tente novamente.';
    }
  });
}


zerarTimer(): void {
  // se não tem nada pra zerar, nem pergunta
  if (this.modoTemporizador === 'livre') {
    if (!this.tempoTotalSegundos) {
      return;
    }
  } else {
    // pomodoro: se está no início da fase, não faz sentido zerar
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

  // segue o fluxo normal de zerar
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




}
