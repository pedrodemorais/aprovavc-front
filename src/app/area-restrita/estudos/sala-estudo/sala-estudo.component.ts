// src/app/area-restrita/estudos/sala-estudo/sala-estudo.component.ts
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { QuillModules } from 'ngx-quill';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';
import { TopicoEditalService } from 'src/app/core/services/topico-edital.service';
import { EstudoEstadoDTO, EstudoEstadoService } from 'src/app/core/services/estudo-estado.service';

type ModoEstudo = 'livre' | 'pomodoro' | 'flashcards' | 'anotacoes';
type StatusEstudo = 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';
type OrigemMudancaStatus = 'auto' | 'manual';
type PomodoroEtapa = 'foco' | 'pausa_curta' | 'pausa_longa';
// ✅ Tipos do seu form (iguais ao que seu TS já espera)
type FlashcardTipo = 'qa' | 'vf' | 'cloze';
type FlashcardDificuldade = 'facil' | 'media' | 'dificil';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {
  @ViewChild('campoNotas') campoNotas!: ElementRef<HTMLTextAreaElement>;

  provaId!: number;
  topicoId!: number;

  // Se você não usa mais form, pode remover no futuro com calma
  form!: FormGroup;

  prova: any;
  topico: any;

  nivelClicado: string = '';
  nomeNivelClicado: string = '';

  carregando = true;
  observacao: string = 'Texto padrão aqui que o usuário já pode ir editando.';
  topicosProva: any[] = [];
  subtopicos: any[] = [];
  breadcrumb: any[] = [];

  modo: ModoEstudo = 'livre';

  estado: {
    notas: string;
    status: StatusEstudo;
    tempoMs: number;
    ultimaAtualizacao: Date | string;
    // opcional: se futuramente quiser distinguir "manual vs auto" no status
    statusOrigem?: OrigemMudancaStatus;
  } = {
    notas: '',
    status: 'nao_iniciado',
    tempoMs: 0,
    ultimaAtualizacao: new Date()
  };

  tempoFormatado = '00:00';

  // ===== Timer / Autosave =====
  private timer: any = null;
  private ultimoTick = 0;
  private contadorAutoSave = 0;
  private syncBackTimer: any = null;
  private syncBackDebounceMs = 800;
  

  // ✅ identifica o motor atual do timer
  private timerTipo: 'livre' | 'pomodoro' | null = null;

  // ===== Cache de status por tópico (pra lista da direita) =====
  statusPorTopico: Record<number, StatusEstudo> = {};
alarmAudio: HTMLAudioElement | null = null;
alarmeTocando = false;
  // =========================
  // ✅ POMODORO (FRONT)
  // =========================
  pomodoroConfig = {
    focoMin: 1,
    pausaCurtaMin: 1,
    pausaLongaMin: 1,
    ciclosAtePausaLonga: 4
  };
modalFlashcardAberto: boolean = false;



  pomodoroEstado: {
    etapa: PomodoroEtapa;
    restanteMs: number;
    ciclosFocoConcluidos: number;
  } = {
    etapa: 'foco',
    restanteMs: 25 * 60 * 1000,
    ciclosFocoConcluidos: 0
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private provaService: ProvaEstudoService,
    private topicoService: TopicoEditalService,
    private estudoEstadoService: EstudoEstadoService, // ✅ ADD
    private fb: FormBuilder
  ) {}

  // ================== CICLO DE VIDA ==================
  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const novaProvaId = Number(params.get('provaId'));
      const novoTopicoId = Number(params.get('topicoId'));

      // ✅ Se já havia um tópico carregado e vai trocar, pausa/salva o anterior
      if (
        this.provaId &&
        this.topicoId &&
        (novaProvaId !== this.provaId || novoTopicoId !== this.topicoId)
      ) {
        this.persistirAntesDeTrocarDeTopico();
      }

      this.provaId = novaProvaId;
      this.topicoId = novoTopicoId;

      // 1) Carrega estado (localStorage ou default)
      this.carregarEstado();

      // 2) Carrega prova + tópicos
      this.carregarDados();
    });
  }

  ngOnDestroy(): void {
    if (this.pomodoroAvisoTimer) {
  clearTimeout(this.pomodoroAvisoTimer);
  this.pomodoroAvisoTimer = null;
}

    // ✅ para e salva sem marcar concluído automaticamente
    this.persistirAntesDeTrocarDeTopico();
  }

  // ✅ editor habilitado: Livre (em_estudo) / Pomodoro (em_estudo e etapa foco)
  get editorHabilitado(): boolean {
    if (this.estado.status !== 'em_estudo') return false;
    if (this.modo === 'pomodoro') return this.pomodoroEstado.etapa === 'foco';
    return true;
  }

  // helpers pro HTML do pomodoro (se você colocou)
  get pomodoroEtapa(): PomodoroEtapa {
    return this.pomodoroEstado.etapa;
  }

  get pomodoroEtapaLabel(): string {
    switch (this.pomodoroEstado.etapa) {
      case 'foco': return 'Foco';
      case 'pausa_curta': return 'Pausa curta';
      case 'pausa_longa': return 'Pausa longa';
      default: return 'Foco';
    }
  }

  get pomodoroRestanteFormatado(): string {
    return this.formatarMMSS(this.pomodoroEstado.restanteMs);
  }
  

private montarPayloadBack(): EstudoEstadoDTO {
  return {
    provaId: this.provaId,
    topicoId: this.topicoId,
    status: this.estado.status,
    modo: this.modo, // ✅ ADICIONA ISSO
    tempoMs: this.estado.tempoMs,
    notas: this.estado.notas || '',
    ultimaAtualizacao: new Date(this.estado.ultimaAtualizacao as any).toISOString(),
    pomodoro: {
      etapa: this.pomodoroEstado.etapa,
      restanteMs: this.pomodoroEstado.restanteMs,
      ciclosFocoConcluidos: this.pomodoroEstado.ciclosFocoConcluidos
    }
  };
}


private sincronizarBackDebounced(): void {
  if (!this.provaId || !this.topicoId) {
    console.warn('[SalaEstudo][syncBackDebounced] ABORTADO: provaId/topicoId inválidos', {
      provaId: this.provaId,
      topicoId: this.topicoId
    });
    return;
  }

  if (this.syncBackTimer) {
    clearTimeout(this.syncBackTimer);
    console.log('[SalaEstudo][syncBackDebounced] Limpou debounce anterior');
  }

  console.log(`[SalaEstudo][syncBackDebounced] Agendando sync em ${this.syncBackDebounceMs}ms...`);

  this.syncBackTimer = setTimeout(() => {
    const dto = this.montarPayloadBack();
    console.log('[SalaEstudo][syncBackDebounced] DISPAROU! Enviando DTO pro back:', dto);

    this.estudoEstadoService.salvar(dto).subscribe({
      next: (resp) => console.log('[SalaEstudo][syncBackDebounced] ✅ BACK OK', resp),
      error: (err) => console.error('[SalaEstudo][syncBackDebounced] ❌ BACK ERRO', err)
    });
  }, this.syncBackDebounceMs);
}


private sincronizarBackAgora(): void {
  if (!this.provaId || !this.topicoId) return;
  if (this.syncBackTimer) clearTimeout(this.syncBackTimer);

  const payload = this.montarPayloadBack();
 this.estudoEstadoService.salvar(payload).subscribe({
  next: () => {},
  error: (e) => console.warn('Falha ao salvar no back:', e)
});

}


  // ================== EDITOR (QUILL) ==================
onChange(event: any): void {
  const html =
    typeof event === 'string'
      ? event
      : (event?.html ?? event?.htmlValue ?? '');

  this.estado.notas = html || '';
  this.salvarEstado();
}


  // manter compatibilidade caso use isso em algum lugar
  onEditorChange(event: any): void {
    const html = event?.htmlValue || '';
    this.estado.notas = html;
    this.salvarEstado();
  }

  // manter compatibilidade caso use isso em algum lugar
  onSyncfusionChange(conteudo: string): void {
    this.estado.notas = conteudo || '';
    this.salvarEstado();
  }

  // ================== STATUS + TIMER (LÓGICA CENTRAL) ==================
  iniciarOuRetomar(): void {
    this.prepararAlarme(); // garante que o alarme vai poder tocar depois
    if (this.estado.status === 'concluido') return;
    this.setStatus('em_estudo', 'auto');
  }

  // manter compatibilidade (se algum botão antigo chama iniciarEstudo)
  iniciarEstudo(): void {
    this.iniciarOuRetomar();
  }

  pausarEstudo(): void {
    if (this.estado.status === 'concluido') {
      this.stopTimer();
      this.salvarEstado();
      return;
    }
    this.setStatus('pausado', 'auto');
  }

  concluirEstudo(): void {
    if (!confirm('Deseja encerrar o estudo deste tópico?')) return;
    this.setStatus('concluido', 'auto');
  }

salvarAgora(event?: Event): void {
  try {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    console.log('[SalaEstudo][SALVAR AGORA] clique detectado!', {
      provaId: this.provaId,
      topicoId: this.topicoId,
      statusAntes: this.estado?.status,
      tempoMsAntes: this.estado?.tempoMs
    });

    // ✅ Salvar NÃO conclui. Se estiver rodando, pausa e mantém como "pra retomar".
    if (this.estado.status === 'em_estudo') {
      console.log('[SalaEstudo][SALVAR AGORA] estava em estudo, pausando timer...');
      this.stopTimer();
      this.estado.status = 'pausado';
    }

    this.estado.ultimaAtualizacao = new Date();

    console.log('[SalaEstudo][SALVAR AGORA] chamando salvarEstado()...');
    this.salvarEstado();

    console.log('[SalaEstudo][SALVAR AGORA] pós salvarEstado()', {
      statusDepois: this.estado?.status,
      tempoMsDepois: this.estado?.tempoMs,
      ultimaAtualizacao: this.estado?.ultimaAtualizacao
    });

    this.atualizarStatusAtualNoCache();
    this.atualizarStatusCacheVisiveis();

  } catch (e) {
    console.error('[SalaEstudo][SALVAR AGORA] erro inesperado', e);
  }
}


  marcarStatus(s: StatusEstudo): void {
    if (s === 'em_estudo') {
      this.setStatus('em_estudo', 'manual');
      return;
    }

    if (s === 'concluido') {
      this.setStatus('concluido', 'manual');
      return;
    }

    if (s === 'nao_iniciado') {
      // Mantive seu comportamento antigo (zera tempo do atual)
      this.stopTimer();
      this.estado.status = 'nao_iniciado';
      this.estado.tempoMs = 0;
      this.atualizarTempoFormatado();

      // ✅ se for pai, deixa consistente: descendentes também ficam nao_iniciado
      this.aplicarCascataNoTopicoAtual('nao_iniciado');

      this.salvarEstado();
      this.atualizarStatusAtualNoCache();
      this.atualizarStatusCacheVisiveis();
      return;
    }

    // pausado
    this.setStatus('pausado', 'manual');
  }

  private setStatus(novo: StatusEstudo, origem: OrigemMudancaStatus): void {
    if (novo === 'concluido' && origem === 'manual') {
      const ok = confirm('Marcar como concluído? Isso vai pausar o cronômetro.');
      if (!ok) return;
    }

    // ✅ iniciar/retomar: respeita o modo (livre/pomodoro)
    if (novo === 'em_estudo') {
      this.estado.status = 'em_estudo';
      this.estado.statusOrigem = origem;

      if (this.modo === 'pomodoro') {
        this.startTimerPomodoro();
      } else {
        this.startTimerLivre();
      }

      this.estado.ultimaAtualizacao = new Date();
      this.salvarEstado();
      this.atualizarStatusAtualNoCache();
      this.atualizarStatusCacheVisiveis();
      return;
    }

    // Para qualquer outro status, para timer antes
    this.stopTimer();
    this.estado.status = novo;
    this.estado.statusOrigem = origem;

    // ✅ Se concluiu (ou nao_iniciado/pausado) num PAI, aplica cascata nos filhos
    if (novo === 'concluido') {
      this.aplicarCascataNoTopicoAtual('concluido');
    } else if (novo === 'nao_iniciado') {
      this.aplicarCascataNoTopicoAtual('nao_iniciado');
    } else if (novo === 'pausado') {
      this.aplicarCascataNoTopicoAtual('pausado');
    }

    this.estado.ultimaAtualizacao = new Date();
    this.salvarEstado();
    this.atualizarStatusAtualNoCache();
    this.atualizarStatusCacheVisiveis();
  }

  // =========================
  // ✅ TIMER LIVRE
  // =========================
  private startTimerLivre(): void {
    if (this.timer) return;

    this.timerTipo = 'livre';
    this.ultimoTick = Date.now();
    this.contadorAutoSave = 0;

    this.timer = setInterval(() => {
      const agora = Date.now();
      const delta = agora - this.ultimoTick;
      this.ultimoTick = agora;

      this.estado.tempoMs += delta;
      this.atualizarTempoFormatado();

      // autosave a cada 10s (leve)
      this.contadorAutoSave += delta;
      if (this.contadorAutoSave >= 10000) {
        this.contadorAutoSave = 0;
        this.salvarEstado();
        this.atualizarStatusAtualNoCache();
      }
    }, 1000);
  }

  // =========================
  // ✅ TIMER POMODORO
  // - Conta regressivo por etapa
  // - Soma tempoMs do tópico apenas durante FOCO
  // =========================
  private startTimerPomodoro(): void {
    if (this.timer) return;

    this.timerTipo = 'pomodoro';
    this.ultimoTick = Date.now();
    this.contadorAutoSave = 0;

    // se ficou em 0 (ex.: pausou exatamente no fim), normaliza
    if (this.pomodoroEstado.restanteMs <= 0) {
      this.avancarEtapaPomodoro();
    }

    // tick mais "responsivo"
    this.timer = setInterval(() => {
      const agora = Date.now();
      const delta = agora - this.ultimoTick;
      this.ultimoTick = agora;

      this.aplicarDeltaPomodoro(delta, true);
      this.atualizarTempoFormatado();

      this.contadorAutoSave += delta;
      if (this.contadorAutoSave >= 10000) {
        this.contadorAutoSave = 0;
        this.salvarEstado();
        this.atualizarStatusAtualNoCache();
      }
    }, 250);
  }

  // aplica delta no pomodoro (com opção de avançar etapa)
  private aplicarDeltaPomodoro(delta: number, permitirAvanco: boolean): void {
    if (!delta || delta <= 0) return;

    // soma tempo total do tópico apenas na etapa FOCO
    if (this.pomodoroEstado.etapa === 'foco') {
      this.estado.tempoMs += delta;
    }

    this.pomodoroEstado.restanteMs = Math.max(this.pomodoroEstado.restanteMs - delta, 0);

    if (permitirAvanco && this.pomodoroEstado.restanteMs === 0) {
      this.avancarEtapaPomodoro();
      this.salvarEstado(); // persiste transição
    }
  }

private avancarEtapaPomodoro(): void {
  const etapaAtual = this.pomodoroEstado.etapa;

  if (etapaAtual === 'foco') {
    this.pomodoroEstado.ciclosFocoConcluidos++;

    const devePausaLonga =
      this.pomodoroEstado.ciclosFocoConcluidos % this.pomodoroConfig.ciclosAtePausaLonga === 0;

    this.pomodoroEstado.etapa = devePausaLonga ? 'pausa_longa' : 'pausa_curta';
    this.pomodoroEstado.restanteMs = this.duracaoEtapaMs(this.pomodoroEstado.etapa);

    // ✅ ALERTA + já inicia a pausa automaticamente (o timer continua rodando)
    this.avisarTrocaEtapaPomodoro(this.pomodoroEstado.etapa);
    return;
  }

  // se era pausa, volta pro foco
  this.pomodoroEstado.etapa = 'foco';
  this.pomodoroEstado.restanteMs = this.duracaoEtapaMs('foco');

  // ✅ alerta de volta ao foco
  this.avisarTrocaEtapaPomodoro('foco');
}



  private duracaoEtapaMs(etapa: PomodoroEtapa): number {
    switch (etapa) {
      case 'foco': return this.pomodoroConfig.focoMin * 60 * 1000;
      case 'pausa_curta': return this.pomodoroConfig.pausaCurtaMin * 60 * 1000;
      case 'pausa_longa': return this.pomodoroConfig.pausaLongaMin * 60 * 1000;
      default: return this.pomodoroConfig.focoMin * 60 * 1000;
    }
  }

  // botão opcional no HTML (pular pausa)
  pularEtapaPomodoro(): void {
    if (this.modo !== 'pomodoro') return;
    if (this.estado.status !== 'em_estudo') return;

    // pula pausa e volta para foco
    if (this.pomodoroEstado.etapa !== 'foco') {
      this.pomodoroEstado.etapa = 'foco';
      this.pomodoroEstado.restanteMs = this.duracaoEtapaMs('foco');
      this.salvarEstado();
    }
  }

  // =========================
  // ✅ STOP TIMER (respeita livre/pomodoro e não perde delta)
  // =========================
  private stopTimer(): void {
    if (this.timer && this.ultimoTick) {
      const agora = Date.now();
      const delta = agora - this.ultimoTick;

      if (delta > 0 && this.estado.status === 'em_estudo') {
        if (this.timerTipo === 'livre') {
          this.estado.tempoMs += delta;
        } else if (this.timerTipo === 'pomodoro') {
          // não avança etapa ao pausar
          this.aplicarDeltaPomodoro(delta, false);
        }
        this.atualizarTempoFormatado();
      }
      this.ultimoTick = 0;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.timerTipo = null;
  }

  private persistirAntesDeTrocarDeTopico(): void {
    // se estava estudando, vira pausado automaticamente ao sair/trocar
    if (this.estado?.status === 'em_estudo') {
      this.stopTimer();
      this.estado.status = 'pausado';
      this.estado.ultimaAtualizacao = new Date();
      this.salvarEstado();
      this.atualizarStatusAtualNoCache();
      return;
    }

    // se não estava rodando, só salva
    this.stopTimer();
    this.estado.ultimaAtualizacao = new Date();
    this.salvarEstado();
    this.atualizarStatusAtualNoCache();
    // ✅ garante persistência imediata
  this.sincronizarBackAgora();
  }

  // ================== CARREGAMENTO DE DADOS ==================
  private carregarDados(): void {
    this.carregando = true;

    this.provaService.obter(this.provaId).subscribe({
      next: (p) => (this.prova = p),
      error: () => {}
    });

    this.topicoService.listarPorProva(this.provaId).subscribe({
      next: (lista) => {
        this.topicosProva = (lista || []).filter((t: any) => !!t);

        this.topico = this.topicosProva.find((t: any) => t.id === this.topicoId);

        if (!this.topico) {
          this.topicoService.buscarPorId(this.topicoId).subscribe({
            next: (t) => {
              this.topico = t;
              this.posCarregamentoTopico();
            },
            error: () => {
              this.carregando = false;
            }
          });
        } else {
          this.posCarregamentoTopico();
        }
      },
      error: () => {
        this.topicosProva = [];
        this.carregando = false;
      }
    });
  }

  private posCarregamentoTopico(): void {
    const nivelAtual = (this.getNivelTopico(this.topico) || '').toString();
    this.carregarSubtopicos(nivelAtual);
    this.montarBreadcrumb(nivelAtual);

    // ✅ sincroniza status do tópico atual baseado nos filhos (inclui o caso 1.2 -> 1.2.1 concluído)
    this.recalcularStatusTopicoAtualPorFilhos();

    // atualiza cache para lista/badges
    this.atualizarStatusAtualNoCache();
    this.atualizarStatusCacheVisiveis();

    this.carregando = false;
  }

  private carregarSubtopicos(nivelPai: string): void {
    if (!nivelPai) {
      this.subtopicos = [];
      return;
    }

    const nivelPaiStr = nivelPai.toString();
    const prefixo = nivelPaiStr + '.';
    const profundidadePai = nivelPaiStr.split('.').length;

    this.subtopicos = this.topicosProva
      .filter((t: any) => {
        const nivel = (this.getNivelTopico(t) || '').toString();
        if (!nivel.startsWith(prefixo)) return false;
        const profundidade = nivel.split('.').length;
        return profundidade >= profundidadePai + 1 && profundidade <= profundidadePai + 2;
      })
      .sort((a: any, b: any) => {
        const na = (this.getNivelTopico(a) || '').toString();
        const nb = (this.getNivelTopico(b) || '').toString();
        return na.localeCompare(nb, undefined, { numeric: true });
      });
  }

  // ================== BREADCRUMB ==================
  private montarBreadcrumb(nivelAtual: string): void {
    this.breadcrumb = [];
    if (!nivelAtual) {
      if (this.topico) this.breadcrumb = [this.topico];
      return;
    }

    const partes: string[] = nivelAtual.split('.');
    let acumulado = '';
    const trilha: any[] = [];

    partes.forEach((parte: string, index: number) => {
      acumulado = index === 0 ? parte : `${acumulado}.${parte}`;
      const encontrado = this.topicosProva.find(
        (t: any) => (this.getNivelTopico(t) || '').toString() === acumulado
      );
      if (encontrado && !trilha.some((x: any) => x.id === encontrado.id)) {
        trilha.push(encontrado);
      }
    });

    if (this.topico && !trilha.some((x: any) => x.id === this.topico.id)) {
      trilha.push(this.topico);
    }

    this.breadcrumb = trilha;
  }

  abrirTopicoBreadcrumb(item: any): void {
    if (!item || !item.id) return;

    this.nivelClicado = (this.getNivelTopico(item) || '').toString();
    this.nomeNivelClicado = (item.descricao || '').toString();

    this.persistirAntesDeTrocarDeTopico();

    this.router.navigate(['/area-restrita/estudos/sala', this.provaId, item.id], {
      queryParams: {
        nivel: this.getNivelTopico(item),
        descricao: item.descricao
      }
    });
  }

  abrirSubtopico(s: any): void {
    if (!s || !s.id) return;

    // ✅ pega "nivel" e "nome" do item clicado
    this.nivelClicado = (this.getNivelTopico(s) || '').toString();
    this.nomeNivelClicado = (s.descricao || '').toString();

    this.persistirAntesDeTrocarDeTopico();

    this.router.navigate(['/area-restrita/estudos/sala', this.provaId, s.id], {
      queryParams: {
        nivel: this.getNivelTopico(s),
        descricao: s.descricao
      }
    });
  }

  // ================== MODOS ==================
 selecionarModo(modo: ModoEstudo): void {
  if (this.modo === modo) return;

  // se estava rodando, pausa antes de trocar (evita misturar contagem)
  if (this.estado.status === 'em_estudo') {
    this.pausarEstudo();
  }

  this.modo = modo;

  if (modo === 'pomodoro') {
    this.prepararNotificacoesPomodoro();
  }
}


  // ================== LOCAL STORAGE ==================
  private estudoKey(provaId: number, topicoId: number): string {
    return `estudo_${provaId}_${topicoId}`;
  }

  // private carregarEstado(): void {
  //   const key = this.estudoKey(this.provaId, this.topicoId);
  //   const saved = localStorage.getItem(key);

  //   if (saved) {
  //     try {
  //       const obj = JSON.parse(saved);

  //       this.estado = {
  //         notas: obj?.notas ?? 'Anote aqui regras, macetes e pontos importantes deste tópico...',
  //         status: (obj?.status as StatusEstudo) ?? 'nao_iniciado',
  //         tempoMs: Number(obj?.tempoMs ?? 0),
  //         ultimaAtualizacao: obj?.ultimaAtualizacao ?? new Date(),
  //         statusOrigem: (obj?.statusOrigem as OrigemMudancaStatus) ?? undefined
  //       };

  //       // ✅ pomodoro (se não existir no storage antigo, cria default)
  //       this.pomodoroEstado = this.normalizarPomodoro(obj?.pomodoro);

  //     } catch {
  //       this.estado = {
  //         notas: 'Anote aqui regras, macetes e pontos importantes deste tópico...',
  //         status: 'nao_iniciado',
  //         tempoMs: 0,
  //         ultimaAtualizacao: new Date()
  //       };
  //       this.pomodoroEstado = this.normalizarPomodoro(null);
  //     }
  //   } else {
  //     this.estado = {
  //       notas: 'Anote aqui regras, macetes e pontos importantes deste tópico...',
  //       status: 'nao_iniciado',
  //       tempoMs: 0,
  //       ultimaAtualizacao: new Date()
  //     };
  //     this.pomodoroEstado = this.normalizarPomodoro(null);
  //   }

  //   this.atualizarTempoFormatado();

  //   // Se estava em estudo no storage, por segurança volta como pausado (evita timer rodando “fantasma”)
  //   if (this.estado.status === 'em_estudo') {
  //     this.estado.status = 'pausado';
  //     this.salvarEstado();
  //   }

  //   // mantém cache do tópico atual
  //   this.atualizarStatusAtualNoCache();
  // }

  private carregarEstado(): void {
  // default imediato (pra não quebrar tela enquanto carrega)
  this.estado = {
    notas: 'Anote aqui regras, macetes e pontos importantes deste tópico...',
    status: 'nao_iniciado',
    tempoMs: 0,
    ultimaAtualizacao: new Date()
  };
  this.pomodoroEstado = this.normalizarPomodoro(null);

  // tenta back
 this.estudoEstadoService.obter(this.provaId, this.topicoId).subscribe({
  next: (dto) => {
    this.estado = {
      notas: dto.notas ?? '',
      status: dto.status ?? 'nao_iniciado',
      tempoMs: Number(dto.tempoMs ?? 0),
      ultimaAtualizacao: dto.ultimaAtualizacao ?? new Date().toISOString(),
    };
    this.pomodoroEstado = this.normalizarPomodoro(dto.pomodoro);

    this.atualizarTempoFormatado();
    this.atualizarStatusAtualNoCache();
  },
  error: () => {
    // seu fallback localStorage pode continuar igual
  }
});

}


salvarEstado(): void {
  console.log('[SalaEstudo][salvarEstado] CHAMADA', {
    provaId: this.provaId,
    topicoId: this.topicoId,
    status: this.estado?.status,
    tempoMs: this.estado?.tempoMs
  });

  if (!this.provaId || !this.topicoId) {
    console.warn('[SalaEstudo][salvarEstado] ABORTADO: provaId/topicoId inválidos', {
      provaId: this.provaId,
      topicoId: this.topicoId
    });
    return;
  }

  this.estado.ultimaAtualizacao = new Date();
  const key = `estudo_${this.provaId}_${this.topicoId}`;

  const payloadLocal = { ...this.estado, pomodoro: this.pomodoroEstado };

  try {
    console.log('[SalaEstudo][salvarEstado] Salvando no localStorage...', { key });
    localStorage.setItem(key, JSON.stringify(payloadLocal));
    console.log('[SalaEstudo][salvarEstado] OK localStorage');
  } catch (e) {
    console.error('[SalaEstudo][salvarEstado] ERRO localStorage', e);
  }

  try {
    this.recalcularStatusDosPaisAutomaticamente();
    this.atualizarStatusCacheVisiveis();
  } catch (e) {
    console.error('[SalaEstudo][salvarEstado] ERRO recalculo/cache', e);
  }

  console.log('[SalaEstudo][salvarEstado] Chamando sincronizarBackDebounced()...');
  this.sincronizarBackDebounced();
}




  // ================== CACHE STATUS POR TÓPICO ==================
  private carregarStatusTopico(topicoId: number): StatusEstudo {
    const key = this.estudoKey(this.provaId, topicoId);
    const saved = localStorage.getItem(key);
    if (!saved) return 'nao_iniciado';

    try {
      const obj = JSON.parse(saved);
      return (obj?.status as StatusEstudo) || 'nao_iniciado';
    } catch {
      return 'nao_iniciado';
    }
  }

  private atualizarStatusCacheVisiveis(): void {
    if (!this.provaId) return;

    const ids = new Set<number>();
    (this.subtopicos || []).forEach(s => s?.id && ids.add(s.id));
    (this.breadcrumb || []).forEach(b => b?.id && ids.add(b.id));
    if (this.topicoId) ids.add(this.topicoId);

    ids.forEach(id => {
      this.statusPorTopico[id] = this.carregarStatusTopico(id);
    });
  }

  private atualizarStatusAtualNoCache(): void {
    if (!this.topicoId) return;
    this.statusPorTopico[this.topicoId] = this.estado.status;
  }

  getStatusLabelPorStatus(status: StatusEstudo): string {
    switch (status) {
      case 'nao_iniciado': return 'Não iniciado';
      case 'em_estudo': return 'Em estudo';
      case 'pausado': return 'Pausado';
      case 'concluido': return 'Concluído';
      default: return 'Não iniciado';
    }
  }

  getStatusClassPorStatus(status: StatusEstudo): any {
    return {
      'badge-verde': status === 'concluido',
      'badge-amarelo': status === 'em_estudo',
      'badge-cinza': status === 'nao_iniciado' || status === 'pausado'
    };
  }

  // ✅ Use isso na lista: getStatusLabelById(s.id) / getStatusClassById(s.id)
  getStatusLabelById(id: number): string {
    const st = this.statusPorTopico[id] ?? 'nao_iniciado';
    return this.getStatusLabelPorStatus(st);
  }

  getStatusClassById(id: number): any {
    const st = this.statusPorTopico[id] ?? 'nao_iniciado';
    return this.getStatusClassPorStatus(st);
  }

  // Mantém compatibilidade caso seu HTML ainda use esses dois:
  getSubtopicoStatusLabel(s: any): string {
    if (s?.id) return this.getStatusLabelById(s.id);
    return 'Não iniciado';
  }

  getSubtopicoStatusClass(s: any): any {
    if (s?.id) return this.getStatusClassById(s.id);
    return this.getStatusClassPorStatus('nao_iniciado');
  }

  // ================== AUXILIARES / UI ==================
  getNivelTopico(t: any): any {
    return t?.nivelTopico || t?.nivel || t?.codigo;
  }

  getIndentPx(t: any): number {
    if (!this.topico) return 0;

    const nivelPai = (this.getNivelTopico(this.topico) || '').toString();
    const nivel = (this.getNivelTopico(t) || '').toString();

    if (!nivelPai || !nivel.startsWith(nivelPai)) return 0;

    const depthPai = nivelPai.split('.').length;
    const depth = nivel.split('.').length;
    const diff = Math.max(depth - depthPai - 1, 0);

    return diff * 18;
  }

  getStatusClass(): any {
    return this.getStatusClassPorStatus(this.estado.status);
  }

  getStatusLabel(): string {
    return this.getStatusLabelPorStatus(this.estado.status);
  }

  private atualizarTempoFormatado(): void {
    const totalSeg = Math.floor(this.estado.tempoMs / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    this.tempoFormatado = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }

  // Mantém compatibilidade com seu getter/setter antigo (se em algum lugar você usa)
  get statusEstudo(): string {
    switch (this.estado.status) {
      case 'nao_iniciado': return 'NAO_INICIADO';
      case 'em_estudo': return 'EM_ANDAMENTO';
      case 'pausado': return 'PAUSADO';
      case 'concluido': return 'CONCLUIDO';
      default: return 'NAO_INICIADO';
    }
  }

  set statusEstudo(valor: string) {
    switch (valor) {
      case 'NAO_INICIADO':
        this.marcarStatus('nao_iniciado');
        break;
      case 'EM_ANDAMENTO':
        this.marcarStatus('em_estudo');
        break;
      case 'PAUSADO':
        this.marcarStatus('pausado');
        break;
      case 'CONCLUIDO':
        this.marcarStatus('concluido');
        break;
      default:
        this.marcarStatus('nao_iniciado');
    }
  }

  // ================== QUILL TOOLBAR ==================
  quillModules: QuillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ header: 1 }, { header: 2 }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ color: [] }, { background: [] }]
    ],
    clipboard: {
      matchVisual: false
    }
  };

  quillFormats: string[] = [
    'bold',
    'italic',
    'underline',
    'strike',
    'header',
    'indent',
    'list',
    'color',
    'background'
  ];

  voltarParaEdital(): void {
    if (!this.provaId) return;
    this.router.navigate(['/area-restrita/provas', this.provaId, 'edital']);
  }

  // ======= Mantém seu “teste” caso tenha algo usando =======
  textoTeste: string = '<p>Texto padrão do editor de <b>teste</b>. Pode editar à vontade.</p>';

  onEditorTesteChange(event: any): void {
    this.textoTeste = event?.htmlValue || '';
  }

  // ===========================
  // ✅ REGRAS DE CASCATA / AGREGAÇÃO (CORRIGIDO)
  // ===========================

  private getStorageKeyById(topicoId: number): string {
    return `estudo_${this.provaId}_${topicoId}`;
  }

  private getEstadoById(topicoId: number): {
    notas: string;
    status: StatusEstudo;
    tempoMs: number;
    ultimaAtualizacao: Date | string;
    statusOrigem?: OrigemMudancaStatus;
    pomodoro?: any;
  } {
    const key = this.getStorageKeyById(topicoId);
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        const obj = JSON.parse(saved);
        return {
          notas: obj?.notas ?? '',
          status: (obj?.status as StatusEstudo) ?? 'nao_iniciado',
          tempoMs: Number(obj?.tempoMs ?? 0),
          ultimaAtualizacao: obj?.ultimaAtualizacao ?? new Date(),
          statusOrigem: (obj?.statusOrigem as OrigemMudancaStatus) ?? undefined,
          pomodoro: obj?.pomodoro
        };
      } catch {
        // cai no default
      }
    }

    return {
      notas: '',
      status: 'nao_iniciado',
      tempoMs: 0,
      ultimaAtualizacao: new Date()
    };
  }

  private setEstadoById(topicoId: number, novoEstado: any): void {
    const key = this.getStorageKeyById(topicoId);
    localStorage.setItem(key, JSON.stringify(novoEstado));
  }

  // Normaliza "1.2 - Ortografia" => "1.2"
  private normalizarNivel(valor: any): string {
    const s = String(valor ?? '').trim();
    if (!s) return '';
    const m = s.match(/^\d+(?:\.\d+)*/);
    return m ? m[0] : s;
  }

  private nivelKeyDoTopico(t: any): string {
    return this.normalizarNivel(this.getNivelTopico(t));
  }

  private descendentesDoNivelKey(nivelKey: string): any[] {
    if (!nivelKey || !this.topicosProva?.length) return [];
    const prefixo = `${nivelKey}.`;
    return this.topicosProva.filter(t => this.nivelKeyDoTopico(t).startsWith(prefixo));
  }

  /**
   * ✅ Agregação correta (inclui o "parcial" = em_estudo quando há algum concluído)
   */
  private calcularStatusAgregado(statuses: StatusEstudo[]): StatusEstudo {
    if (!statuses.length) return 'nao_iniciado';

    const todosConcluidos = statuses.every(s => s === 'concluido');
    if (todosConcluidos) return 'concluido';

    const existePausado = statuses.some(s => s === 'pausado');
    if (existePausado) return 'pausado';

    const existeEmEstudo = statuses.some(s => s === 'em_estudo');
    if (existeEmEstudo) return 'em_estudo';

    // ✅ Se tem algum concluído e não está tudo concluído, é "Em estudo" (parcial)
    const existeConcluido = statuses.some(s => s === 'concluido');
    if (existeConcluido) return 'em_estudo';

    return 'nao_iniciado';
  }

  /**
   * Se o tópico atual for um pai, aplica status em cascata nos descendentes.
   * - concluido: todos descendentes viram concluido
   * - nao_iniciado: todos descendentes viram nao_iniciado (sem apagar notas)
   * - pausado: só pausa os descendentes que estavam em_estudo
   */
  private aplicarCascataNoTopicoAtual(status: StatusEstudo): void {
    if (!this.topico || !this.topicosProva?.length) return;

    const nivelAtualKey = this.nivelKeyDoTopico(this.topico);
    if (!nivelAtualKey) return;

    const descendentes = this.descendentesDoNivelKey(nivelAtualKey);
    if (!descendentes.length) return;

    descendentes.forEach(d => {
      if (!d?.id) return;

      const est = this.getEstadoById(d.id);

      if (status === 'concluido') {
        est.status = 'concluido';
        est.ultimaAtualizacao = new Date();
        this.setEstadoById(d.id, est);
        this.statusPorTopico[d.id] = 'concluido';
        return;
      }

      if (status === 'nao_iniciado') {
        est.status = 'nao_iniciado';
        est.ultimaAtualizacao = new Date();
        this.setEstadoById(d.id, est);
        this.statusPorTopico[d.id] = 'nao_iniciado';
        return;
      }

      if (status === 'pausado') {
        // pausa apenas quem estava em_estudo
        if (est.status === 'em_estudo') {
          est.status = 'pausado';
          est.ultimaAtualizacao = new Date();
          this.setEstadoById(d.id, est);
          this.statusPorTopico[d.id] = 'pausado';
        }
      }
    });

    // após cascata, recalcula pais acima (inclusive nível 1)
    this.recalcularStatusDosPaisAutomaticamente();
    this.atualizarStatusCacheVisiveis();
  }

  /**
   * ✅ Ao abrir um pai (ex.: 1.2), ele deve refletir seus filhos (ex.: 1.2.1 concluído => 1.2 concluído)
   */
  private recalcularStatusTopicoAtualPorFilhos(): void {
    if (!this.topico || !this.topicosProva?.length) return;

    const nivelAtualKey = this.nivelKeyDoTopico(this.topico);
    if (!nivelAtualKey) return;

    const descendentes = this.descendentesDoNivelKey(nivelAtualKey);
    if (!descendentes.length) return; // sem filhos: não força nada

    const statuses = descendentes.map(d => this.getEstadoById(d.id).status);
    const novoStatus = this.calcularStatusAgregado(statuses);

    if (this.estado.status !== novoStatus) {
      // se estava rodando timer e mudou pra algo que não é em_estudo, para o timer sem efeitos colaterais
      if (novoStatus !== 'em_estudo') {
        this.stopTimer();
      }
      this.estado.status = novoStatus;
      this.estado.ultimaAtualizacao = new Date();

      // preserva pomodoro do payload atual
      const payload = { ...this.estado, pomodoro: this.pomodoroEstado };
      this.setEstadoById(this.topicoId, payload);

      this.statusPorTopico[this.topicoId] = novoStatus;
    }
  }

  /**
   * ✅ Quando um tópico muda (ex.: 1.2.1), sobe recalculando os PAIS (1.2 e depois 1).
   * Cada pai é calculado com base em TODOS os descendentes dele.
   */
  private recalcularStatusDosPaisAutomaticamente(): void {
    if (!this.topico || !this.topicosProva?.length) return;

    let nivelKey = this.nivelKeyDoTopico(this.topico);
    if (!nivelKey) return;

    // sobe: 1.2.1 -> 1.2 -> 1
    while (nivelKey.includes('.')) {
      nivelKey = nivelKey.substring(0, nivelKey.lastIndexOf('.'));

      const pai = this.topicosProva.find(t => this.nivelKeyDoTopico(t) === nivelKey);
      if (!pai?.id) continue;

      const descendentes = this.descendentesDoNivelKey(nivelKey);
      if (!descendentes.length) continue;

      const statuses = descendentes.map(d => this.getEstadoById(d.id).status);
      const novoStatusPai = this.calcularStatusAgregado(statuses);

      const estadoPai = this.getEstadoById(pai.id);
      if (estadoPai.status !== novoStatusPai) {
        estadoPai.status = novoStatusPai;
        estadoPai.ultimaAtualizacao = new Date();
        this.setEstadoById(pai.id, estadoPai);

        // se aparecer na UI, atualiza cache
        this.statusPorTopico[pai.id] = novoStatusPai;
      }
    }
  }

  // =========================
  // ✅ POMODORO - persistência compatível
  // =========================
  private normalizarPomodoro(p: any): { etapa: PomodoroEtapa; restanteMs: number; ciclosFocoConcluidos: number } {
    const def = {
      etapa: 'foco' as PomodoroEtapa,
      restanteMs: this.pomodoroConfig.focoMin * 60 * 1000,
      ciclosFocoConcluidos: 0
    };

    if (!p) return def;

    const etapa: PomodoroEtapa =
      p.etapa === 'foco' || p.etapa === 'pausa_curta' || p.etapa === 'pausa_longa'
        ? p.etapa
        : 'foco';

    const restanteMs = Number(p.restanteMs);
    const ciclos = Number(p.ciclosFocoConcluidos);

    return {
      etapa,
      restanteMs: Number.isFinite(restanteMs) && restanteMs >= 0 ? restanteMs : def.restanteMs,
      ciclosFocoConcluidos: Number.isFinite(ciclos) && ciclos >= 0 ? ciclos : 0
    };
  }

  private formatarMMSS(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  pomodoroAviso = {
  aberto: false,
  titulo: '',
  mensagem: ''
};
private prepararNotificacoesPomodoro(): void {
  try {
    if (typeof window === 'undefined') return;

    // Notification do navegador (opcional)
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        // só pede quando o usuário entrar no pomodoro (não fica pedindo toda hora)
        Notification.requestPermission().catch(() => {});
      }
    }
  } catch {}
}

private avisarTrocaEtapaPomodoro(etapa: PomodoroEtapa): void {
  const titulo =
    etapa === 'foco' ? '⏱ Pomodoro: Foco' :
    etapa === 'pausa_curta' ? '☕ Pomodoro: Pausa curta' :
    '🛌 Pomodoro: Pausa longa';

  const mensagem =
    etapa === 'foco'
      ? 'Hora de voltar ao foco!'
      : etapa === 'pausa_curta'
        ? 'Foco encerrado. Começou a pausa curta.'
        : 'Foco encerrado. Começou a pausa longa.';

  // 1) Toast interno (não trava a tela como alert())
  this.pomodoroAviso.aberto = true;
  this.pomodoroAviso.titulo = titulo;
  this.pomodoroAviso.mensagem = mensagem;

  if (this.pomodoroAvisoTimer) clearTimeout(this.pomodoroAvisoTimer);
  this.pomodoroAvisoTimer = setTimeout(() => {
    this.pomodoroAviso.aberto = false;
  }, 5000);

  // 2) Vibração (celular) - opcional
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as any).vibrate([200, 120, 200]);
    }
  } catch {}

  // 3) Som (beep simples) - opcional
  this.tocarAlarme();


  // 4) Notificação do browser (opcional, se permitido)
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(titulo, { body: mensagem });
      }
    }
  } catch {}
}

private tocarBeepe(): void {
  try {
    if (typeof window === 'undefined') return;

    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 880; // Hz
    gain.gain.value = 0.06;

    osc.connect(gain);
    gain.connect(ctx.destination);

    // em alguns browsers precisa garantir resume após clique
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => {});
    }, 180);
  } catch {}
}

private pomodoroAvisoTimer: any = null;
// ✅ tempos do pomodoro (em segundos)
pomodoroCfg = {
  focoMs: 10_000,        // 10s
  pausaCurtaMs: 5_000,   // 5s
  pausaLongaMs: 8_000,   // 8s
  ciclosAtePausaLonga: 2
};



private prepararAlarme(): void {
  if (this.alarmAudio) return;

  this.alarmAudio = new Audio('assets/alarm-clock.mp3');
  this.alarmAudio.preload = 'auto';
  this.alarmAudio.volume = 1.0;

  // garante que o UI saiba quando terminou
  this.alarmAudio.onended = () => (this.alarmeTocando = false);
  this.alarmAudio.load();
}


tocarAlarme(): void {
  this.prepararAlarme();
  if (!this.alarmAudio) return;

  this.alarmAudio.currentTime = 0;
  this.alarmeTocando = true;

  this.alarmAudio.play().catch(err => {
    this.alarmeTocando = false;
    console.warn('Browser bloqueou autoplay:', err);
  });
}
pararAlarme(): void {
  if (!this.alarmAudio) return;

  this.alarmAudio.pause();
  this.alarmAudio.currentTime = 0; // volta pro início
  this.alarmeTocando = false;
}

flashcardForm: {
  frente: string;
  verso: string;
  tags: string;
  tipo: FlashcardTipo;
  dificuldade: FlashcardDificuldade;
} = {
  frente: '',
  verso: '',
  tags: '',
  tipo: 'qa',
  dificuldade: 'media'
};

// ✅ Contexto (metadados) separado do form (pra não dar erro de propriedade)
flashcardContext: {
  provaId: number;
  topicoId: number;
  nivel: string;
  descricao: string;
} = {
  provaId: 0,
  topicoId: 0,
  nivel: '',
  descricao: ''
};



// =========================
// ✅ ABRIR MODAL
// =========================
abrirModalFlashcard(): void {
  // Atualiza contexto do tópico atual
  const ultimo = this.breadcrumb?.length ? this.breadcrumb[this.breadcrumb.length - 1] : this.topico;

  this.flashcardContext = {
    provaId: this.provaId,
    topicoId: this.topicoId,
    nivel: (this.getNivelTopico(ultimo) || '').toString(),
    descricao: (ultimo?.descricao || '').toString()
  };

  // Limpa campos principais (mantém tipo/dificuldade se quiser)
  this.flashcardForm.frente = '';
  this.flashcardForm.verso = '';
  this.flashcardForm.tags = this.flashcardForm.tags ?? '';
  this.flashcardForm.tipo = this.flashcardForm.tipo ?? 'qa';
  this.flashcardForm.dificuldade = this.flashcardForm.dificuldade ?? 'media';

  this.modalFlashcardAberto = true;
}

// =========================
// ✅ FECHAR MODAL
// =========================
fecharModalFlashcard(): void {
  this.modalFlashcardAberto = false;
}

// =========================
// ✅ SALVAR NO LOCALSTORAGE
// =========================
salvarFlashcardLocal(): void {
  const frente = (this.flashcardForm.frente || '').trim();
  const verso = (this.flashcardForm.verso || '').trim();

  if (!frente || !verso) {
    alert('Preencha Frente e Verso do flashcard.');
    return;
  }

  const flashcard = {
    id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? (crypto as any).randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    criadoEm: new Date().toISOString(),

    // contexto
    ...this.flashcardContext,

    // dados do form
    ...this.flashcardForm,

    // normaliza tags
    tags: (this.flashcardForm.tags || '').trim()
  };

  const storageKey = `flashcards_${this.provaId}`; // ✅ por prova (depois filtra por topicoId)
  const atual = localStorage.getItem(storageKey);
  const lista = atual ? (JSON.parse(atual) as any[]) : [];

  lista.push(flashcard);
  localStorage.setItem(storageKey, JSON.stringify(lista));

  this.fecharModalFlashcard();
}

// =========================
// ✅ GERAR DO TRECHO SELECIONADO (fallback DOM)
// =========================
gerarFlashcardDoTrecho(): void {
  const sel = window.getSelection();
  const textoSelecionado = (sel?.toString() || '').trim();

  if (!textoSelecionado) {
    alert('Selecione um trecho no editor antes de gerar o flashcard.');
    return;
  }

  this.abrirModalFlashcard();

  // sugestão: verso vira o trecho, frente vira a pergunta
  this.flashcardForm.tipo = 'qa';
  this.flashcardForm.frente = 'Explique o trecho abaixo:';
  this.flashcardForm.verso = textoSelecionado;
}



}
