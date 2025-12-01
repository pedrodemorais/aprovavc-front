import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Materia } from 'src/app/core/models/materia.model';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {

  materiaId!: number;
  materia?: Materia;

  // 🔹 lista usada na tela (já com tópicos + subtópicos achatados)
  topicos: any[] = [];
  topicoSelecionado?: any | null;

  // (se quiser no futuro guardar a árvore original)
  arvoreTopicos: any[] = [];

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // ======================= TIMER / POMODORO =======================

  // modo do temporizador: livre ou pomodoro
  modoTemporizador: 'livre' | 'pomodoro' = 'livre';

  // ---- modo LIVRE (igual ao que você já tinha) ----
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
      case 'foco':         return this.pomodoroDuracaoFoco;
      case 'pausa-curta':  return this.pomodoroDuracaoPausaCurta;
      case 'pausa-longa':  return this.pomodoroDuracaoPausaLonga;
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

  // anotações (depois você integra com backend)
  anotacoes: string = '';

  constructor(
    private route: ActivatedRoute,
    private materiaService: MateriaService
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
      const node = {
        id: dto.id,
        descricao: dto.descricao,
        ativo: dto.ativo ?? true,
        nivel,
        materiaId: dto.materiaId,
        // guarda o dto original se precisar no futuro
        _raw: dto
      };

      acumulador.push(node);

      if (dto.subtopicos && Array.isArray(dto.subtopicos) && dto.subtopicos.length) {
        this.achatarArvoreTopicos(dto.subtopicos, nivel + 1, acumulador);
      }
    }
    return acumulador;
  }

  private carregarTopicos(): void {
    console.log('[SALA-ESTUDO] Carregando tópicos da matériaId =', this.materiaId);

    this.materiaService.listarTopicos(this.materiaId).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        console.log('[SALA-ESTUDO] DTO bruto de tópicos (árvore):', listaSegura);

        // guarda árvore original (caso use depois na UI)
        this.arvoreTopicos = listaSegura;

        // 🔹 achatamos TUDO: tópicos + subtópicos numa lista só
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
    this.topicoSelecionado = t;
    console.log('[SALA-ESTUDO] Tópico selecionado:', t);
  }

  // ================================================================
  // CONTROLE DO TIMER / POMODORO
  // ================================================================

  private pad(v: number): string {
    return v.toString().padStart(2, '0');
  }

  /**
   * Troca entre modo livre e pomodoro.
   * Usado pelos botões "⏱ Livre" e "🍅 Pomodoro" no cabeçalho.
   */
  setModoTemporizador(modo: 'livre' | 'pomodoro'): void {
    if (this.modoTemporizador === modo) {
      return;
    }

    // para o timer atual e silencia qualquer alarme tocando
    this.pararTimerInterno();
    this.silenciarAlarme();
    this.timerAtivo = false;

    this.modoTemporizador = modo;

    if (modo === 'livre') {
      // volta para o contador livre; mantém o valor acumulado (se quiser zerar, o aluno usa o botão Zerar)
      if (!this.tempoTotalSegundos) {
        this.tempoTotalSegundos = 0;
      }
    } else {
      // reset do pomodoro para fase de foco
      this.pomodoroFase = 'foco';
      this.pomodoroCiclosConcluidos = 0;
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }
  }

  /**
   * Botão principal: Iniciar / Pausar.
   */
  toggleTimer(): void {
    // sempre que o aluno mexer no timer, garantimos que o alarme pare
    this.silenciarAlarme();

    if (this.timerAtivo) {
      // pausa
      this.timerAtivo = false;
      this.pararTimerInterno();
      return;
    }

    // iniciar
    this.timerAtivo = true;

    if (this.modoTemporizador === 'livre') {
      this.iniciarTimerLivre();
    } else {
      this.iniciarPomodoro();
    }
  }

  /**
   * Botão "Zerar".
   */
  zerarTimer(): void {
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

  // ---------- implementação dos modos ----------

  private iniciarTimerLivre(): void {
    this.pararTimerInterno();

    this.timerRef = setInterval(() => {
      this.tempoTotalSegundos++;
      // tempoFormatado é recalculado via getter
    }, 1000);
  }

  private iniciarPomodoro(): void {
    this.pararTimerInterno();

    this.timerRef = setInterval(() => {
      if (this.pomodoroSegundosRestantes > 0) {
        this.pomodoroSegundosRestantes--;
        return;
      }

      // terminou a fase atual → troca de fase (e para o timer)
      this.trocarFasePomodoro();
    }, 1000);
  }

  private trocarFasePomodoro(): void {
    // terminou a fase: para o timer e toca o alarme
    this.pararTimerInterno();
    this.timerAtivo = false;
    this.tocarAlarme();

    // prepara a PRÓXIMA fase, mas NÃO inicia automaticamente.
    if (this.pomodoroFase === 'foco') {
      this.pomodoroCiclosConcluidos++;

      if (this.pomodoroCiclosConcluidos % this.pomodoroCiclosParaLonga === 0) {
        // pausa longa
        this.pomodoroFase = 'pausa-longa';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaLonga;
      } else {
        // pausa curta
        this.pomodoroFase = 'pausa-curta';
        this.pomodoroSegundosRestantes = this.pomodoroDuracaoPausaCurta;
      }
    } else {
      // volta para foco
      this.pomodoroFase = 'foco';
      this.pomodoroSegundosRestantes = this.pomodoroDuracaoFoco;
    }

    // A partir daqui, o aluno decide quando clicar em "Iniciar" de novo
    // para começar a contagem da nova fase.
  }

  private pararTimerInterno(): void {
    if (this.timerRef) {
      clearInterval(this.timerRef);
      this.timerRef = null;
    }
  }

  // ------------ DESPERTADOR (ALARM CLOCK) ------------

  private tocarAlarme(): void {
    try {
      if (!this.audioAlarme) {
        this.audioAlarme = new Audio('assets/alarm-clock.mp3');
      }

      this.audioAlarme.currentTime = 0;
      this.audioAlarme.loop = true; // toca em loop até silenciar

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
}
