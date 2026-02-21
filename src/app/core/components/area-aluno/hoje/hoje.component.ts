import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { HojeFilaItemDTO, HojeFilaResponseDTO, PrioridadeFilaHoje, TipoFilaHoje } from 'src/app/core/models/hoje-fila.models';
import { EditalResumoRetencaoDTO } from 'src/app/core/models/retencao-analytics.models';
import { RetencaoCognitivaResumoDTO, TopicoCognitivoDTO } from 'src/app/core/models/cognitive-metrics.models';
import { CognitiveMetricsService } from 'src/app/core/services/cognitive-metrics.service';
import { RevisaoDashboardItem } from 'src/app/core/components/area-aluno/models/RevisaoDashboardItem';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { HojeTrackingService } from 'src/app/core/services/hoje-tracking.service';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';
import { SalaEstudoService } from 'src/app/core/components/area-aluno/services/sala-estudo.service';

interface HojeExecucaoState {
  pendingAdvance: boolean;
  lastIndex: number;
}

@Component({
  selector: 'app-hoje',
  templateUrl: './hoje.component.html',
  styleUrls: ['./hoje.component.css']
})
export class HojeComponent implements OnInit, OnDestroy {
  loading = false;
  fila: HojeFilaResponseDTO = { totalItens: 0, tempoEstimadoMinutos: 0, itens: [] };
  indiceAtual = 0;
  itemAtual: HojeFilaItemDTO | null = null;
  modoExecucao = false;
  resumoEdital: EditalResumoRetencaoDTO | null = null;
  resumoCognitivo14d: RetencaoCognitivaResumoDTO | null = null;
  streakDias = 0;
  filaConcluidaRegistrada = false;
  feedbackConclusaoItem?: string;
  cardEntrando = false;
  private cognitivoPorTopico = new Map<number, TopicoCognitivoDTO>();
  private feedbackConclusaoPendente: { topicoId: number; prioridade: PrioridadeFilaHoje | null | undefined } | null = null;
  private feedbackConclusaoTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly stateKey = 'hoje:fila:execucao';
  private readonly streakDaysKey = 'hoje:streak:dias-validos';
  private readonly filaConcluidaDiaKey = 'hoje:fila:concluida-dia';
  private readonly cognitivoSnapshotKey = 'hoje:cognitivo:snapshot-topico';
  private readonly retencaoSnapshotKey = 'hoje:cognitivo:snapshot-retencao14d';
  private readonly historicoConcluidosKey = 'hoje:historico:concluidos-por-dia';

  constructor(
    private hojeFilaService: HojeFilaService,
    private salaEstudoService: SalaEstudoService,
    private retencaoAnalyticsService: RetencaoAnalyticsService,
    private cognitiveMetricsService: CognitiveMetricsService,
    private hojeTrackingService: HojeTrackingService,
    private router: Router,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.streakDias = this.calcularStreak();
    this.carregarFila();
    this.carregarResumoEdital();
    this.carregarResumoCognitivo();
    this.carregarTopicosCognitivos();
  }

  ngOnDestroy(): void {
    if (this.feedbackConclusaoTimer) {
      clearTimeout(this.feedbackConclusaoTimer);
      this.feedbackConclusaoTimer = null;
    }
  }

  get totalItens(): number {
    return Number(this.fila?.totalItens || this.fila?.itens?.length || 0);
  }

  get tempoEstimadoMinutos(): number {
    return Number(this.fila?.tempoEstimadoMinutos || 0);
  }

  get tempoEstimadoLabel(): string {
    return this.formatarTempoMinutos(this.calcularTempoTotal(), this.totalItens > 0);
  }

  get revisaoConcluida(): boolean {
    return this.totalItens > 0 && this.indiceAtual >= this.totalItens;
  }

  get consolidadoHoje(): number {
    return this.revisaoConcluida ? this.totalItens : this.indiceAtual;
  }

  get tempoTotalInvestidoMinutos(): number {
    if (!this.fila?.itens?.length) return 0;
    return this.fila.itens
      .slice(0, this.indiceAtual)
      .reduce((acc, item) => acc + Number(item?.tempoEstimadoMinutos || 0), 0);
  }

  get tempoTotalInvestidoLabel(): string {
    return this.formatarTempoMinutos(this.tempoTotalInvestidoMinutos, this.consolidadoHoje > 0);
  }

  get percentualEditalConsolidado(): number {
    return Number(this.resumoEdital?.percentualConsolidado || 0);
  }

  get percentualEditalConsolidadoLabel(): string {
    return `${this.percentualEditalConsolidado.toFixed(1)}%`;
  }

  get percentualEditalConsolidadoWidth(): string {
    const pct = Math.max(0, Math.min(100, this.percentualEditalConsolidado));
    return `${pct}%`;
  }

  get streakClasse(): string {
    const dias = this.streakDiasAtual;
    if (dias >= 7) return 'streak-badge streak-forte';
    if (dias >= 2) return 'streak-badge streak-ok';
    return 'streak-badge streak-neutro';
  }

  get mostrarStreak(): boolean {
    return true;
  }

  get streakTexto(): string {
    return this.formatarStreak();
  }

  get progressoTexto(): string {
    if (!this.totalItens || this.revisaoConcluida) {
      return 'Fila finalizada';
    }
    return `Item ${this.indiceAtual + 1} de ${this.totalItens} (${this.progressoPercentualLabel})`;
  }

  get fraseImpacto(): string {
    return this.totalItens > 0
      ? 'Foco total na sua consolidacao.'
      : 'Memoria consolidada por hoje.';
  }

  get consolidadoSemana(): number {
    const backend = Number(this.fila?.insights?.consolidadosSemana);
    if (Number.isFinite(backend) && backend >= 0) return backend;
    return this.somarHistoricoPeriodo(7, 0);
  }

  get consolidadoSemanaTexto(): string {
    const labelBackend = this.fila?.insights?.consolidadosSemanaLabel;
    if (labelBackend) return labelBackend;
    const qtd = this.consolidadoSemana;
    if (qtd === 1) {
      return '🔥 Voce consolidou 1 topico esta semana.';
    }
    return `🔥 Voce consolidou ${qtd} topicos esta semana.`;
  }

  get tendencia7DiasPercent(): number | null {
    const backend = Number(this.fila?.insights?.tendencia7dPercent);
    if (Number.isFinite(backend)) {
      return Number(backend.toFixed(1));
    }

    const atual7 = this.somarHistoricoPeriodo(7, 0);
    const anterior7 = this.somarHistoricoPeriodo(7, 7);

    if (atual7 === 0 && anterior7 === 0) {
      return null;
    }

    const totalTopicos = Number(this.resumoEdital?.totalTopicos || 0);
    if (Number.isFinite(totalTopicos) && totalTopicos > 0) {
      const variacaoPctPontos = ((atual7 - anterior7) / totalTopicos) * 100;
      return Number(variacaoPctPontos.toFixed(1));
    }

    if (anterior7 <= 0) {
      return atual7 > 0 ? 100 : 0;
    }

    const variacaoRelativa = ((atual7 - anterior7) / anterior7) * 100;
    return Number(variacaoRelativa.toFixed(1));
  }

  get tendencia7DiasTexto(): string {
    const valor = this.tendencia7DiasPercent;
    if (valor === null) return '0% na sua consolidação (últimos 7 dias)';
    const sinal = valor > 0 ? '+' : '';
    return `${sinal}${valor}% na sua consolidação (últimos 7 dias)`;
  }

  get progressoPercentual(): number {
    if (!this.totalItens) return 0;
    if (this.revisaoConcluida) return 100;
    const atual = this.indiceAtual + 1;
    return Math.max(0, Math.min(100, Math.round((atual / this.totalItens) * 100)));
  }

  get progressoPercentualLabel(): string {
    return `${this.progressoPercentual}%`;
  }

  get faltamTopicosConsolidar(): number | null {
    const total = Number(this.resumoEdital?.totalTopicos);
    const consolidados = Number(this.resumoEdital?.topicosConsolidados);
    if (!Number.isFinite(total) || !Number.isFinite(consolidados)) return null;
    return Math.max(0, total - consolidados);
  }

  get mostrarBlocoCognitivo(): boolean {
    return this.retencao14d !== null;
  }

  get retencao14d(): number | null {
    const valor = Number(this.resumoCognitivo14d?.retencao14d);
    return Number.isFinite(valor) ? valor : null;
  }

  get retencao14dPercentLabel(): string {
    if (this.retencao14d === null) return '';
    return `${Math.round(this.retencao14d * 100)}%`;
  }

  get retencao14dClasse(): string {
    if (this.retencao14d === null) return 'cognitivo-retencao cognitivo-retencao--neutro';
    if (this.retencao14d >= 0.7) return 'cognitivo-retencao cognitivo-retencao--bom';
    if (this.retencao14d >= 0.4) return 'cognitivo-retencao cognitivo-retencao--neutro';
    return 'cognitivo-retencao cognitivo-retencao--alerta';
  }

  get retencao14dTitulo(): string {
    if (this.retencao14d === null) return '';
    if (this.retencao14d >= 0.7) return 'Excelente retencao (14d)';
    if (this.retencao14d >= 0.4) return `Retencao 14 dias: ${this.retencao14dPercentLabel}`;
    return `Retencao 14 dias: ${this.retencao14dPercentLabel}`;
  }

  get retencao14dSubtitulo(): string {
    if (this.retencao14d === null) return '';
    if (this.retencao14d >= 0.7) return 'Sua memoria esta estavel.';
    if (this.retencao14d >= 0.4) return 'Boa, mas ainda pode melhorar.';
    return 'Risco elevado de esquecimento.';
  }

  get retencao14dIcone(): string {
    if (this.retencao14d === null) return '';
    if (this.retencao14d >= 0.7) return '🔥';
    if (this.retencao14d >= 0.4) return '📊';
    return '⚠️';
  }

  get mediaTopicosPorDia7d(): number {
    const media = this.obterMediaTopicosUltimos7Dias();
    return Math.max(1, media);
  }

  get diasEstimadosConsolidacao(): number | null {
    const restantes = this.faltamTopicosConsolidar;
    if (restantes === null) return null;
    return Math.ceil(restantes / this.mediaTopicosPorDia7d);
  }

  get mostrarBotaoCriticos(): boolean {
    return this.quantidadeTopicosCriticos > 0;
  }

  get quantidadeTopicosCriticos(): number {
    let qtd = 0;
    for (const item of this.cognitivoPorTopico.values()) {
      if (String(item?.classificacao || '').toUpperCase() === 'CRITICO') {
        qtd += 1;
      }
    }
    return qtd;
  }

  get textoBotaoCriticos(): string {
    return `Ver ${this.quantidadeTopicosCriticos} topicos criticos`;
  }

  comecarRevisao(): void {
    if (!this.itemAtual?.deepLink || this.modoExecucao) {
      return;
    }

    this.salvarSnapshotCognitivoAntes(this.itemAtual.topicoId);
    this.salvarSnapshotRetencaoAntes();
    this.modoExecucao = true;
    this.salvarEstadoExecucao({
      pendingAdvance: true,
      lastIndex: this.indiceAtual
    });

    this.router.navigateByUrl(this.itemAtual.deepLink).finally(() => {
      // Em navegacao normal o componente sera destruido; fallback para falha de navegacao.
      this.modoExecucao = false;
    });
  }

  irParaObjetivos(): void {
    this.router.navigateByUrl('/area-restrita/dashboard');
  }

  continuarEstudando(): void {
    this.router.navigateByUrl('/area-restrita/estudar-materias');
  }

  verTopicosEmRisco(): void {
    this.router.navigateByUrl('/area-restrita/retencao');
  }

  verTopicosCriticos(): void {
    this.router.navigate(['/area-restrita/retencao'], {
      queryParams: { view: 'criticos' }
    });
  }

  prioridadeClasse(prioridade: PrioridadeFilaHoje | null | undefined): string {
    switch (prioridade) {
      case PrioridadeFilaHoje.ATRASADA:
      case PrioridadeFilaHoje.CRITICO:
        return 'badge badge-critico';
      case PrioridadeFilaHoje.EM_RISCO:
      case PrioridadeFilaHoje.ERRO_REINCIDENTE:
        return 'badge badge-alta';
      case PrioridadeFilaHoje.ALTA:
        return 'badge badge-alta';
      case PrioridadeFilaHoje.MEDIA:
        return 'badge badge-media';
      default:
        return 'badge badge-baixa';
    }
  }

  prioridadeLabel(prioridade: PrioridadeFilaHoje | string | null | undefined): string {
    const key = String(prioridade || '').toUpperCase();
    switch (key) {
      case 'ATRASADA':
        return 'Atrasada';
      case 'HOJE':
        return 'Hoje';
      case 'CRITICO':
        return 'Critico';
      case 'EM_RISCO':
        return 'Em risco';
      case 'ERRO_REINCIDENTE':
        return 'Erros reincidentes';
      case 'ALTA':
        return 'Alta';
      case 'MEDIA':
        return 'Media';
      case 'BAIXA':
        return 'Baixa';
      default:
        return key || 'Prioridade';
    }
  }

  formatarTempoMinutos(min: number, temItens: boolean): string {
    const valor = Number(min);
    if (!Number.isFinite(valor) || valor <= 0) {
      return temItens ? '~1 min' : '0 min';
    }
    return this.formatarMinutosParaLabel(Math.ceil(valor), true);
  }

  formatarTempoSegundos(seg: number): string {
    const valor = Number(seg);
    if (!Number.isFinite(valor) || valor <= 0) {
      return '~1 min';
    }
    if (valor < 60) {
      return '~1 min';
    }
    return this.formatarMinutosParaLabel(Math.ceil(valor / 60), false);
  }

  private formatarMinutosParaLabel(totalMinutos: number, aproximado: boolean): string {
    const minutos = Math.max(1, Math.ceil(Number(totalMinutos) || 0));
    const prefixo = aproximado ? '~' : '';

    if (minutos < 60) {
      return `${prefixo}${minutos} min`;
    }

    const horas = Math.floor(minutos / 60);
    const restoMinutos = minutos % 60;

    if (restoMinutos === 0) {
      return `${prefixo}${horas}h`;
    }

    return `${prefixo}${horas}h ${restoMinutos}min`;
  }

  calcularTempoTotal(): number {
    const totalItens = this.totalItens;
    const tempoEstimadoMin = this.tempoEstimadoMinutos;

    if (totalItens > 1) {
      if (!Number.isFinite(tempoEstimadoMin) || tempoEstimadoMin <= 1) {
        return totalItens * 3;
      }
      return Math.max(1, Math.ceil(tempoEstimadoMin));
    }

    if (totalItens === 1) {
      return Math.max(1, Math.ceil(tempoEstimadoMin || 0));
    }

    return 0;
  }

  formatarStreak(): string {
    const dias = this.streakDiasAtual;
    if (dias <= 0) return '🔥 0 dias seguidos';
    if (dias === 1) return '🔥 1 dia seguido';
    if (dias >= 7) return `🔥🔥 ${dias} dias seguidos`;
    return `🔥 ${dias} dias seguidos`;
  }

  private carregarFila(): void {
    this.loading = true;

    this.hojeFilaService.getFilaHoje().subscribe({
      next: (resp) => {
        const filaNormalizada: HojeFilaResponseDTO = {
          totalItens: Number(resp?.totalItens || 0),
          tempoEstimadoMinutos: Number(resp?.tempoEstimadoMinutos || 0),
          itens: Array.isArray(resp?.itens) ? resp.itens : [],
          insights: resp?.insights ?? null
        };

        const streakBackend = Number(filaNormalizada?.insights?.streakDias);
        if (Number.isFinite(streakBackend) && streakBackend >= 0) {
          this.streakDias = streakBackend;
        }

        if (filaNormalizada.totalItens > 0 || filaNormalizada.itens.length > 0) {
          this.aplicarFila(filaNormalizada);
          this.loading = false;
          return;
        }

        this.salaEstudoService.listarRevisoesDashboard().subscribe({
          next: (revisoes) => {
            const fallback = this.montarFilaFallback(revisoes || []);
            this.aplicarFila(fallback);
            this.loading = false;
          },
          error: () => {
            this.aplicarFila(filaNormalizada);
            this.loading = false;
          }
        });
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;
        this.fila = { totalItens: 0, tempoEstimadoMinutos: 0, itens: [] };
        this.itemAtual = null;
        this.messageService.add({
          severity: 'error',
          summary: 'Hoje',
          detail: err?.error?.message || 'Não foi possível carregar a fila de hoje.'
        });
      }
    });
  }

  private aplicarFila(fila: HojeFilaResponseDTO): void {
    this.fila = fila;
    this.aplicarRetornoExecucao();
    this.atualizarItemAtual();
    this.registrarConclusaoFilaSeNecessario();
  }

  private montarFilaFallback(revisoes: RevisaoDashboardItem[]): HojeFilaResponseDTO {
    const itens = (revisoes || [])
      .filter((r) => Number(r?.topicoId) > 0)
      .map((r) => this.mapearRevisaoDashboardParaHoje(r));

    return {
      totalItens: itens.length,
      tempoEstimadoMinutos: itens.reduce((acc, i) => acc + Number(i.tempoEstimadoMinutos || 0), 0),
      itens
    };
  }

  private mapearRevisaoDashboardParaHoje(item: RevisaoDashboardItem): HojeFilaItemDTO {
    const prioridade = this.normalizarPrioridadeFallback(item?.statusCanonico ?? item?.status);
    const materiaId = Number(item?.materiaId || 0) || null;
    const topicoId = Number(item?.topicoId || 0);
    return {
      tipo: TipoFilaHoje.TOPICO,
      topicoId,
      materiaId,
      materiaNome: item?.materiaNome || null,
      topicoNome: item?.topicoDescricao || null,
      prioridade,
      motivo: prioridade === PrioridadeFilaHoje.ATRASADA
        ? 'Revisao atrasada.'
        : prioridade === PrioridadeFilaHoje.ALTA
          ? 'Revisao prevista para hoje.'
          : 'Topico com revisao pendente.',
      tempoEstimadoMinutos: 3,
      deepLink: materiaId
        ? `/area-restrita/sala-estudo/${materiaId}?topicoId=${topicoId}`
        : '/area-restrita/revisoes'
    };
  }

  private normalizarPrioridadeFallback(status: string | undefined): PrioridadeFilaHoje {
    const key = String(status || '').toUpperCase();
    if (key === 'ATRASADA' || key === 'VENCIDA') return PrioridadeFilaHoje.ATRASADA;
    if (key === 'HOJE') return PrioridadeFilaHoje.ALTA;
    if (key === 'CRITICO') return PrioridadeFilaHoje.CRITICO;
    if (key === 'EM_RISCO') return PrioridadeFilaHoje.EM_RISCO;
    return PrioridadeFilaHoje.MEDIA;
  }

  private atualizarItemAtual(): void {
    if (!this.fila.itens.length || this.indiceAtual >= this.fila.itens.length) {
      this.itemAtual = null;
      return;
    }
    this.itemAtual = this.fila.itens[this.indiceAtual];
    this.dispararAnimacaoEntradaCard();
  }

  private aplicarRetornoExecucao(): void {
    const state = this.lerEstadoExecucao();
    if (!state) {
      this.indiceAtual = 0;
      this.modoExecucao = false;
      return;
    }

    if (state.pendingAdvance) {
      const itemConcluido = this.fila?.itens?.[state.lastIndex] || null;
      this.indiceAtual = Math.min(state.lastIndex + 1, this.totalItens);
      this.registrarConclusaoItemSeNecessario(state.lastIndex);
      if (itemConcluido?.topicoId) {
        this.feedbackConclusaoPendente = {
          topicoId: itemConcluido.topicoId,
          prioridade: itemConcluido?.prioridade
        };
      }
      this.carregarResumoCognitivo(true);
      this.carregarTopicosCognitivos(true, itemConcluido?.prioridade);
      this.marcarDiaValidoStreakSeNecessario();
      this.salvarEstadoExecucao({
        pendingAdvance: false,
        lastIndex: this.indiceAtual
      });
      this.modoExecucao = false;
      return;
    }

    this.indiceAtual = Math.min(Math.max(0, state.lastIndex), this.totalItens);
    this.modoExecucao = false;
  }

  private lerEstadoExecucao(): HojeExecucaoState | null {
    try {
      const raw = sessionStorage.getItem(this.stateKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as HojeExecucaoState;
      if (typeof parsed?.pendingAdvance !== 'boolean' || typeof parsed?.lastIndex !== 'number') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private salvarEstadoExecucao(state: HojeExecucaoState): void {
    sessionStorage.setItem(this.stateKey, JSON.stringify(state));
  }

  private carregarResumoEdital(): void {
    this.retencaoAnalyticsService.buscarResumoEdital(30).subscribe({
      next: (resumo) => {
        this.resumoEdital = resumo;
      },
      error: () => {
        this.resumoEdital = null;
      }
    });
  }

  private carregarResumoCognitivo(resolverFeedback = false): void {
    this.cognitiveMetricsService.getResumoRetencao(14).subscribe({
      next: (resumo) => {
        this.resumoCognitivo14d = resumo;
        if (resolverFeedback) {
          this.resolverFeedbackConclusaoPendente();
        }
      },
      error: () => {
        this.resumoCognitivo14d = null;
      }
    });
  }

  private carregarTopicosCognitivos(resolverFeedback = false, prioridadeFallback?: PrioridadeFilaHoje | null | undefined): void {
    this.cognitiveMetricsService.getTopicosCognitivos(14, null, 120).subscribe({
      next: (topicos) => {
        this.cognitivoPorTopico.clear();
        (topicos || []).forEach((t) => {
          if (t?.topicoId) this.cognitivoPorTopico.set(t.topicoId, t);
        });
        if (resolverFeedback) {
          this.resolverFeedbackConclusaoPendente(prioridadeFallback);
        }
      },
      error: () => {
        this.cognitivoPorTopico.clear();
      }
    });
  }

  private resolverFeedbackConclusaoPendente(prioridadeFallback?: PrioridadeFilaHoje | null | undefined): void {
    if (!this.feedbackConclusaoPendente) return;
    const topicoId = this.feedbackConclusaoPendente.topicoId;
    const prioridade = this.feedbackConclusaoPendente.prioridade ?? prioridadeFallback;

    const snapshotAntes = this.lerSnapshotCognitivoAntes();
    const cognitivoAtual = this.cognitivoPorTopico.get(topicoId);

    if (snapshotAntes && snapshotAntes.topicoId === topicoId && cognitivoAtual) {
      if (snapshotAntes.risk !== null && cognitivoAtual.risk !== null && cognitivoAtual.risk < snapshotAntes.risk) {
        this.mostrarFeedbackConclusaoCustom('✔ Risco de esquecimento reduzido');
        this.feedbackConclusaoPendente = null;
        this.limparSnapshotCognitivoAntes();
        return;
      }
      if (
        snapshotAntes.stability !== null &&
        cognitivoAtual.stability !== null &&
        cognitivoAtual.stability > snapshotAntes.stability
      ) {
        this.mostrarFeedbackConclusaoCustom('✔ Estabilidade fortalecida');
        this.feedbackConclusaoPendente = null;
        this.limparSnapshotCognitivoAntes();
        return;
      }
    }

    const retencaoAntes = this.lerSnapshotRetencaoAntes();
    if (
      retencaoAntes !== null &&
      this.retencao14d !== null &&
      this.retencao14d > retencaoAntes
    ) {
      this.feedbackConclusaoPendente = null;
      this.limparSnapshotCognitivoAntes();
      this.limparSnapshotRetencaoAntes();
      this.mostrarFeedbackConclusaoCustom('✔ Retencao 14d aumentou');
      return;
    }

    this.feedbackConclusaoPendente = null;
    this.limparSnapshotCognitivoAntes();
    this.limparSnapshotRetencaoAntes();
    if (prioridade) {
      this.mostrarFeedbackConclusaoCustom('✔ Topico reforcado');
      return;
    }
    this.mostrarFeedbackConclusaoCustom('✔ Topico reforcado');
  }

  private mostrarFeedbackConclusaoCustom(texto: string): void {
    this.feedbackConclusaoItem = texto;
    if (this.feedbackConclusaoTimer) {
      clearTimeout(this.feedbackConclusaoTimer);
    }
    this.feedbackConclusaoTimer = setTimeout(() => {
      this.feedbackConclusaoItem = undefined;
      this.feedbackConclusaoTimer = null;
    }, 2000);
  }

  private dispararAnimacaoEntradaCard(): void {
    this.cardEntrando = false;
    requestAnimationFrame(() => {
      this.cardEntrando = true;
    });
  }

  private registrarConclusaoItemSeNecessario(lastIndex: number): void {
    const itemConcluido = this.fila?.itens?.[lastIndex];
    if (!itemConcluido) return;
    this.incrementarHistoricoConcluidosDia();
    this.hojeTrackingService.registrarItemConcluido(
      itemConcluido.tipo,
      itemConcluido.prioridade,
      Number(itemConcluido.tempoEstimadoMinutos || 0)
    );
  }

  private registrarConclusaoFilaSeNecessario(): void {
    if (!this.revisaoConcluida || this.filaConcluidaRegistrada) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const ultimoDiaConcluido = localStorage.getItem(this.filaConcluidaDiaKey);
    if (ultimoDiaConcluido === hoje) {
      this.filaConcluidaRegistrada = true;
      return;
    }
    this.hojeTrackingService.registrarFilaConcluida(this.totalItens, this.tempoTotalInvestidoMinutos);
    localStorage.setItem(this.filaConcluidaDiaKey, hoje);
    this.filaConcluidaRegistrada = true;
  }

  private marcarDiaValidoStreakSeNecessario(): void {
    if (this.totalItens <= 0 || this.indiceAtual <= 0) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const dias = this.lerDiasValidosStreak();
    if (!dias.includes(hoje)) {
      dias.push(hoje);
      localStorage.setItem(this.streakDaysKey, JSON.stringify(dias));
      this.streakDias = this.calcularStreak();
    }
  }

  private lerDiasValidosStreak(): string[] {
    try {
      const raw = localStorage.getItem(this.streakDaysKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((d) => typeof d === 'string') : [];
    } catch {
      return [];
    }
  }

  private calcularStreak(): number {
    const dias = this.lerDiasValidosStreak()
      .map((d) => d.slice(0, 10))
      .filter(Boolean);
    if (!dias.length) return 0;

    const set = new Set(dias);
    let streak = 0;
    const current = new Date();
    current.setHours(0, 0, 0, 0);

    while (true) {
      const dia = current.toISOString().slice(0, 10);
      if (!set.has(dia)) break;
      streak += 1;
      current.setDate(current.getDate() - 1);
    }

    return streak;
  }

  private salvarSnapshotCognitivoAntes(topicoId: number): void {
    if (!topicoId) return;
    const atual = this.cognitivoPorTopico.get(topicoId);
    if (!atual) {
      this.limparSnapshotCognitivoAntes();
      return;
    }
    sessionStorage.setItem(this.cognitivoSnapshotKey, JSON.stringify({
      topicoId,
      risk: atual.risk ?? null,
      stability: atual.stability ?? null
    }));
  }

  private salvarSnapshotRetencaoAntes(): void {
    if (this.retencao14d === null) {
      this.limparSnapshotRetencaoAntes();
      return;
    }
    sessionStorage.setItem(this.retencaoSnapshotKey, String(this.retencao14d));
  }

  private lerSnapshotRetencaoAntes(): number | null {
    const raw = sessionStorage.getItem(this.retencaoSnapshotKey);
    if (!raw) return null;
    const valor = Number(raw);
    return Number.isFinite(valor) ? valor : null;
  }

  private limparSnapshotRetencaoAntes(): void {
    sessionStorage.removeItem(this.retencaoSnapshotKey);
  }

  private lerSnapshotCognitivoAntes(): { topicoId: number; risk: number | null; stability: number | null } | null {
    try {
      const raw = sessionStorage.getItem(this.cognitivoSnapshotKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { topicoId?: number; risk?: number | null; stability?: number | null };
      if (!parsed || typeof parsed.topicoId !== 'number') return null;
      return {
        topicoId: parsed.topicoId,
        risk: Number.isFinite(Number(parsed.risk)) ? Number(parsed.risk) : null,
        stability: Number.isFinite(Number(parsed.stability)) ? Number(parsed.stability) : null
      };
    } catch {
      return null;
    }
  }

  private limparSnapshotCognitivoAntes(): void {
    sessionStorage.removeItem(this.cognitivoSnapshotKey);
  }

  private incrementarHistoricoConcluidosDia(): void {
    const hoje = new Date().toISOString().slice(0, 10);
    const historico = this.lerHistoricoConcluidos();
    historico[hoje] = Number(historico[hoje] || 0) + 1;
    localStorage.setItem(this.historicoConcluidosKey, JSON.stringify(historico));
  }

  private lerHistoricoConcluidos(): Record<string, number> {
    try {
      const raw = localStorage.getItem(this.historicoConcluidosKey);
      const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      const saida: Record<string, number> = {};
      Object.keys(parsed || {}).forEach((k) => {
        const v = Number(parsed[k]);
        if (Number.isFinite(v) && v >= 0) {
          saida[k] = v;
        }
      });
      return saida;
    } catch {
      return {};
    }
  }

  private obterMediaTopicosUltimos7Dias(): number {
    const historico = this.lerHistoricoConcluidos();
    const base = new Date();
    base.setHours(0, 0, 0, 0);

    let soma = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const chave = d.toISOString().slice(0, 10);
      soma += Number(historico[chave] || 0);
    }
    return soma / 7;
  }

  private somarHistoricoPeriodo(dias: number, deslocamentoDias: number): number {
    const historico = this.lerHistoricoConcluidos();
    const base = new Date();
    base.setHours(0, 0, 0, 0);

    let soma = 0;
    for (let i = 0; i < dias; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() - deslocamentoDias - i);
      const chave = d.toISOString().slice(0, 10);
      soma += Number(historico[chave] || 0);
    }

    return soma;
  }

  private get streakDiasAtual(): number {
    const backend = Number(this.fila?.insights?.streakDias);
    if (Number.isFinite(backend) && backend >= 0) {
      return backend;
    }
    return Math.max(0, Number(this.streakDias || 0));
  }
}


