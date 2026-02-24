import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import {
  DashboardStreakResumoDTO,
  HojeFilaItemDTO,
  HojeFilaResponseDTO,
  PrioridadeFilaHoje,
  TipoFilaHoje
} from 'src/app/core/models/hoje-fila.models';
import { EditalResumoRetencaoDTO, RetencaoAnalyticsResponseDTO, RetencaoAnalyticsSerieDTO } from 'src/app/core/models/retencao-analytics.models';
import { RetencaoCognitivaResumoDTO, TopicoCognitivoDTO } from 'src/app/core/models/cognitive-metrics.models';
import { CognitiveMetricsService } from 'src/app/core/services/cognitive-metrics.service';
import { RevisaoDashboardItem } from 'src/app/core/components/area-aluno/models/RevisaoDashboardItem';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { HojeTrackingService } from 'src/app/core/services/hoje-tracking.service';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';
import {
  RevisaoDashboardResumoDTO,
  SalaEstudoService
} from 'src/app/core/components/area-aluno/services/sala-estudo.service';
import { EditalService } from 'src/app/core/components/area-aluno/services/edital.service';
import { Edital } from 'src/app/core/components/area-aluno/models/Edital';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { extrairStatusCanonicoRevisao, statusCanonicoParaDashboard } from 'src/app/core/components/area-aluno/utils/revisao-status.util';

interface HojeExecucaoState {
  pendingAdvance: boolean;
  lastIndex: number;
  day: string;
  queueKey: string;
}

interface HojeUiViewModel {
  estado: {
    score: number;
    label: string;
    descricao: string;
    streakTexto: string;
    streakMeta: string;
    badgeLabel: string;
    badgeClass: string;
  };
  progresso: {
    titulo: string;
    hojeTexto: string;
    hojeBarraPct: number;
    editalTexto: string;
    editalBarraPct: number;
    faltamTexto: string;
    evolucaoTexto: string;
    estimativaTexto: string | null;
  };
  risco: {
    mostrar: boolean;
    titulo: string;
    texto: string;
    qtdTexto: string | null;
  };
  heroItem: {
    materia: string;
    titulo: string;
    tempoTexto: string;
    statusTexto: string;
  };
}

interface TopicoMateriaRef {
  materiaId: number;
  materiaNome: string | null;
}

@Component({
  selector: 'app-hoje',
  templateUrl: './hoje.component.html',
  styleUrls: ['./hoje.component.css']
})
export class HojeComponent implements OnInit, OnDestroy {
  // Guardrails da projecao para reduzir oscilacao e evitar estimativas incoerentes.
  private readonly PROJECAO_JANELA_DIAS = 7;
  private readonly PROJECAO_MIN_SERIE_PONTOS = 3;
  private readonly PROJECAO_MIN_DIAS_JANELA = 3;
  private readonly PROJECAO_MIN_DELTA_TOPICOS = 2;
  private readonly TEMPO_MEDIO_MIN = 0.05;
  private readonly TEMPO_MEDIO_MAX = 120;
  private readonly ONE_DAY_MS = 86400000;
  private readonly estabilidadeSnapshotKey = 'hoje:estabilidade-global-snapshot:v1';

  loading = false;
  fila: HojeFilaResponseDTO = { totalItens: 0, tempoEstimadoMinutos: 0, itens: [] };
  streakResumo: DashboardStreakResumoDTO | null = null;
  indiceAtual = 0;
  itemAtual: HojeFilaItemDTO | null = null;
  modoExecucao = false;
  resumoEdital: EditalResumoRetencaoDTO | null = null;
  resumoCognitivo14d: RetencaoCognitivaResumoDTO | null = null;
  streakDias: number | null = null;
  filaConcluidaRegistrada = false;
  feedbackConclusaoItem?: string;
  cardEntrando = false;
  qtdTopicosEmRiscoJanela30: number | null = null;
  private cognitivoPorTopico = new Map<number, TopicoCognitivoDTO>();
  private feedbackConclusaoPendente: { topicoId: number; prioridade: PrioridadeFilaHoje | null | undefined } | null = null;
  private feedbackConclusaoTimer: ReturnType<typeof setTimeout> | null = null;
  private estadoExecucaoMemoria: HojeExecucaoState | null = null;
  private ultimoDiaFilaConcluidaMemoria: string | null = null;
  private snapshotCognitivoAntesMemoria: { topicoId: number; risk: number | null; stability: number | null } | null = null;
  private snapshotRetencaoAntesMemoria: number | null = null;
  private topicoMateriaMap = new Map<number, TopicoMateriaRef>();
  private materiaIdsEditalAtivo = new Set<number>();
  private editalAtivoResolvido = false;
  private editalAtivoAtual: Edital | null = null;
  private analyticsRetencao30: RetencaoAnalyticsResponseDTO | null = null;
  private resumoRevisoes: RevisaoDashboardResumoDTO | null = null;
  private contagemRevisoesCards: { vencidas: number; hoje: number; emDia: number } | null = null;
  private estabilidadeGlobalOntem: number | null = null;
  iniciandoRevisaoPrioritaria = false;

  constructor(
    private hojeFilaService: HojeFilaService,
    private salaEstudoService: SalaEstudoService,
    private retencaoAnalyticsService: RetencaoAnalyticsService,
    private cognitiveMetricsService: CognitiveMetricsService,
    private editalService: EditalService,
    private hojeTrackingService: HojeTrackingService,
    private router: Router,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.limparEstadoExecucaoLegado();
    this.carregarMapaTopicoMateria();
    this.carregarStreakResumo();
    this.carregarFila();
    this.carregarResumoRevisoes();
    this.carregarResumoEdital();
    this.carregarAnalyticsRetencao();
    this.carregarResumoCognitivo();
    this.carregarTopicosCognitivos();
    this.carregarQtdTopicosEmRiscoJanela30();
  }

  ngOnDestroy(): void {
    if (this.feedbackConclusaoTimer) {
      clearTimeout(this.feedbackConclusaoTimer);
      this.feedbackConclusaoTimer = null;
    }
  }

  get totalItens(): number {
    if (Array.isArray(this.fila?.itens)) {
      return this.fila.itens.length;
    }
    return Number(this.fila?.totalItens || 0);
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

  get qtdRevisoesAtrasadas(): number {
    if (this.contagemRevisoesCards) {
      return Number(this.contagemRevisoesCards.vencidas || 0);
    }
    if (this.resumoRevisoes) {
      return Number(this.resumoRevisoes.vencidas || 0);
    }
    const itens = Array.isArray(this.fila?.itens) ? this.fila.itens : [];
    return itens.filter((item) => item?.prioridade === PrioridadeFilaHoje.ATRASADA).length;
  }

  get qtdRevisoesVenceHoje(): number {
    if (this.contagemRevisoesCards) {
      return Number(this.contagemRevisoesCards.hoje || 0);
    }
    if (this.resumoRevisoes) {
      return Number(this.resumoRevisoes.hoje || 0);
    }
    const itens = Array.isArray(this.fila?.itens) ? this.fila.itens : [];
    return itens.filter((item) => item?.prioridade === PrioridadeFilaHoje.ALTA).length;
  }

  get qtdRevisoesEmDia(): number {
    if (this.contagemRevisoesCards) {
      return Number(this.contagemRevisoesCards.emDia || 0);
    }
    if (this.resumoRevisoes) {
      return Number(this.resumoRevisoes.emDia || 0);
    }
    const itens = Array.isArray(this.fila?.itens) ? this.fila.itens : [];
    return itens.filter((item) =>
      item?.prioridade !== PrioridadeFilaHoje.ATRASADA &&
      item?.prioridade !== PrioridadeFilaHoje.ALTA
    ).length;
  }

  get podeComecarRevisaoPrioritaria(): boolean {
    return (this.qtdRevisoesAtrasadas + this.qtdRevisoesVenceHoje) > 0;
  }

  get temPendenciasGeraisRevisao(): boolean {
    return this.podeComecarRevisaoPrioritaria;
  }

  get percentualEditalConsolidado(): number {
    const consolidados = Number(this.resumoEdital?.topicosConsolidados);
    const totalEdital = this.totalTopicosEditalAtivo;

    if (Number.isFinite(consolidados) && totalEdital !== null && totalEdital > 0) {
      return (consolidados / totalEdital) * 100;
    }

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
    if (dias === null) return 'streak-badge streak-neutro';
    if (dias >= 7) return 'streak-badge streak-forte';
    if (dias >= 2) return 'streak-badge streak-ok';
    return 'streak-badge streak-neutro';
  }

  get mostrarStreak(): boolean {
    return true;
  }

  get streakTexto(): string {
    const dias = this.streakDiasAtual;
    return dias === 1 ? '🔥 1 dia sem faltar' : `🔥 ${dias} dias sem faltar`;
  }

  get streakBadgeLabel(): string {
    switch (this.streakResumo?.statusHoje) {
      case 'CONCLUIU':
        return 'Mantida';
      case 'INICIOU':
        return 'Quase la';
      case 'NAO_INICIOU':
        return 'Em aberto';
      default:
        return 'Em aberto';
    }
  }

  get streakBadgeClass(): string {
    switch (this.streakResumo?.statusHoje) {
      case 'CONCLUIU':
        return 'streak-chip streak-chip--done';
      case 'INICIOU':
        return 'streak-chip streak-chip--progress';
      default:
        return 'streak-chip streak-chip--open';
    }
  }

  get streakStatusSubtitulo(): string {
    switch (this.streakResumo?.statusHoje) {
      case 'CONCLUIU':
        return 'Sequencia mantida. Boa!';
      case 'INICIOU':
        return 'Voce comecou - finalize 1 item para manter a sequencia.';
      case 'NAO_INICIOU':
      default:
        return 'Ainda da tempo de manter sua sequencia hoje.';
    }
  }

  get streakMelhorTexto(): string {
    return 'Melhor: ' + Number(this.streakResumo?.melhorStreak || 0) + ' dias';
  }

  get streakConsistenciaTexto(): string {
    const qtd = Number(this.streakResumo?.consistencia30DiasQtd || 0);
    const total = Number(this.streakResumo?.consistencia30DiasTotal || 30);
    const pct = Number(this.streakResumo?.consistencia30DiasPercent || 0).toFixed(1);
    return `Consistencia (30d): ${qtd}/${total} (${pct}%)`;
  }

  get mostrarCtaStreakComecar(): boolean {
    return this.streakResumo?.statusHoje === 'NAO_INICIOU' && this.totalItens > 0 && !!this.itemAtual && !this.revisaoConcluida;
  }

  get ui(): HojeUiViewModel {
    const consistenciaPct = Number(this.streakResumo?.consistencia30DiasPercent || 0).toFixed(1);
    const consistenciaPctLabel = consistenciaPct.endsWith('.0')
      ? `${Math.round(Number(consistenciaPct))}%`
      : `${consistenciaPct}%`;

    const scoreEstado = this.calcularScoreEstadoPlaceholder();
    const evolucaoTexto = this.montarTextoEvolucao7d() || 'Evolucao (7d): sem dados no backend';
    const riskTopicos = this.qtdTopicosEmRiscoJanela30 ?? this.quantidadeTopicosCriticos;
    const mostrarRisco = riskTopicos > 0;
    const riskPercent = this.percentualTopicosCriticosInteiro;
    const scoreEdital = Math.max(0, Math.min(100, Number(this.percentualEditalConsolidado.toFixed(1))));
    const temPendenciaHoje = this.temPendenciasGeraisRevisao;

    const estadoResolvido = this.resolverEstadoEstudo({
      scoreEstado,
      temPendenciaHoje,
      mostrarRisco,
      riskPercent,
      riskTopicos
    });

    return {
      estado: {
        score: scoreEstado,
        label: estadoResolvido.label,
        descricao: estadoResolvido.descricao,
        streakTexto: this.streakTexto,
        streakMeta: `Melhor: ${Number(this.streakResumo?.melhorStreak || 0)} | Consistencia (30d): ${consistenciaPctLabel}` ,
        badgeLabel: this.streakBadgeLabel,
        badgeClass: this.streakBadgeClass
      },
      progresso: {
        titulo: 'Progresso interpretado',
        hojeTexto: this.progressoTexto === 'Fila finalizada'
          ? 'Hoje: fila finalizada (100%)'
          : this.totalItens > 0
            ? `Hoje: Item ${this.indiceAtual + 1} de ${this.totalItens} (${this.progressoPercentualLabel})`
            : 'Hoje: sem itens pendentes',
        hojeBarraPct: this.progressoPercentual,
        editalTexto: `Edital: ${this.percentualEditalConsolidadoLabel} consolidado`,
        editalBarraPct: scoreEdital,
        faltamTexto: this.faltamTopicosConsolidar !== null
          ? `Faltam ${this.faltamTopicosConsolidar} topicos no edital ativo`
          : '',
        evolucaoTexto,
        estimativaTexto: this.diasEstimadosConsolidacao !== null
          ? `Ritmo atual: ~${this.diasEstimadosConsolidacao} dias para consolidar o edital`
          : this.baseProjecaoInsuficiente
            ? 'Projecao indisponivel (base pequena). Faca mais revisoes para ativar.'
            : 'Projecao ainda nao disponivel.'
      },
      risco: {
        mostrar: mostrarRisco,
        titulo: 'Risco atual',
        texto: `${riskPercent}% dos topicos estao em nivel critico${riskTopicos ? ` (${riskTopicos})` : ''}.`,
        qtdTexto: riskTopicos > 0
          ? `${riskTopicos} ${riskTopicos === 1 ? 'topico critico' : 'topicos criticos'} para revisar`
          : null
      },
      heroItem: {
        materia: this.itemAtual?.materiaNome || 'Materia',
        titulo: this.itemAtual?.topicoNome || 'Topico sem nome',
        tempoTexto: this.itemAtual
          ? this.formatarTempoSegundos((this.itemAtual.tempoEstimadoMinutos || 0) * 60)
          : '~1 min',
        statusTexto: this.itemAtual ? this.prioridadeLabel(this.itemAtual.prioridade) : 'Prioridade'
      }
    };
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
    const serie = this.analyticsRetencao30?.serie || [];
    const atual = serie.length ? Number(serie[serie.length - 1]?.consolidados) : NaN;
    if (Number.isFinite(atual) && atual >= 0) return atual;
    return 0;
  }

  get consolidadoSemanaTexto(): string {
    const labelBackend = this.fila?.insights?.consolidadosSemanaLabel;
    if (labelBackend) return labelBackend;
    const qtd = this.consolidadoSemana;
    if (qtd === 1) {
      return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ Voce consolidou 1 topico esta semana.';
    }
    return `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ Voce consolidou ${qtd} topicos esta semana.`;
  }

  get tendencia7DiasPercent(): number | null {
    const backend = Number(this.fila?.insights?.tendencia7dPercent);
    if (Number.isFinite(backend)) {
      return Number(backend.toFixed(1));
    }

    const snapshots = this.obterSnapshotsRetencao7d();
    if (!snapshots) return null;
    const delta = snapshots.atual.consolidacaoPercent - snapshots.base.consolidacaoPercent;
    return Number(delta.toFixed(1));
  }

  get tendencia7DiasTexto(): string {
    const valor = this.tendencia7DiasPercent;
    if (valor === null) return '0% na sua consolidaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltimos 7 dias)';
    const sinal = valor > 0 ? '+' : '';
    return `${sinal}${valor}% na sua consolidaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o (ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltimos 7 dias)`;
  }

  private montarTextoEvolucao7d(): string | null {
    if (!this.temBaseConfiavelParaTendencia()) {
      return null;
    }

    const deltaPercentual = this.tendencia7DiasPercent;
    if (deltaPercentual === null) {
      return null;
    }

    const snapshots = this.obterSnapshotsRetencao7d();
    if (!snapshots) return null;
    const deltaTopicos = snapshots.atual.consolidados - snapshots.base.consolidados;
    const sinalPp = deltaPercentual > 0 ? '+' : '';
    const sinalTopico = deltaTopicos > 0 ? '+' : '';
    const topicoLabel = Math.abs(deltaTopicos) === 1 ? 'topico' : 'topicos';

    return `Evolucao (7d): ${sinalPp}${deltaPercentual} p.p. na consolidacao (${sinalTopico}${deltaTopicos} ${topicoLabel})`;
  }

  private calcularScoreEstadoPlaceholder(): number {
    const retencaoPercent = this.retencao14d === null ? 50 : Math.round(this.retencao14d * 100);
    const editalPercent = Math.round(this.percentualEditalConsolidado);
    const streakPeso = Math.min(100, this.streakDiasAtual * 8);
    const bruto = (retencaoPercent * 0.5) + (editalPercent * 0.35) + (streakPeso * 0.15);
    return Math.max(0, Math.min(100, Math.round(bruto)));
  }

  private mapearLabelEstado(score: number): string {
    if (score >= 80) return 'Em dia';
    if (score >= 60) return 'Bom ritmo';
    if (score >= 40) return 'Ajustar ritmo';
    return 'Priorizar revisao';
  }

  private montarDescricaoEstado(score: number): string {
    if (score >= 80) return 'Seu estudo esta estavel. Continue nesse ritmo.';
    if (score >= 60) return 'Bom progresso, com risco controlado no curto prazo.';
    if (score >= 40) return 'Voce esta avancando, mas vale reforcar revisoes.';
    return 'Priorize revisoes agora para recuperar a estabilidade.';
  }

  private resolverEstadoEstudo(input: {
    scoreEstado: number;
    temPendenciaHoje: boolean;
    mostrarRisco: boolean;
    riskPercent: number;
    riskTopicos: number;
  }): { label: string; descricao: string } {
    const { scoreEstado, temPendenciaHoje, mostrarRisco, riskPercent, riskTopicos } = input;

    if (temPendenciaHoje) {
      return {
        label: 'Priorizar revisao agora',
        descricao: 'Voce ainda tem revisoes pendentes para hoje.'
      };
    }

    if (mostrarRisco) {
      const sufixoQtd = riskTopicos > 0 ? ` (${riskTopicos} topicos)` : '';
      return {
        label: 'Hoje: em dia',
        descricao: `Sem pendencias hoje. Atencao: ${riskPercent}% dos topicos estao em risco no curto prazo${sufixoQtd}.`
      };
    }

    return {
      label: 'Hoje: em dia',
      descricao: this.montarDescricaoEstado(scoreEstado)
    };
  }

  private temBaseConfiavelParaTendencia(): boolean {
    const backend = Number(this.fila?.insights?.tendencia7dPercent);
    if (Number.isFinite(backend)) {
      return true;
    }
    return !!this.obterSnapshotsRetencao7d();
  }

  private deveMostrarRiscoCognitivo(): boolean {
    if (this.retencao14d === null) {
      return false;
    }
    return (this.retencao14d * 100) < 50;
  }

  get progressoPercentual(): number {
    if (this.revisaoConcluida || !this.totalItens) return 100;
    const atual = this.indiceAtual + 1;
    return Math.max(0, Math.min(100, Math.round((atual / this.totalItens) * 100)));
  }

  get progressoPercentualLabel(): string {
    return `${this.progressoPercentual}%`;
  }

  get progressoHojeClasse(): string {
    const pct = this.progressoPercentual;
    if (pct >= 100) return 'progresso-mini-card--completo';
    if (pct >= 67) return 'progresso-mini-card--alto';
    if (pct >= 34) return 'progresso-mini-card--medio';
    return 'progresso-mini-card--baixo';
  }

  get progressoHojeStatusLabel(): string {
    const pct = this.progressoPercentual;
    if (pct >= 100) return 'COMPLETO';
    if (pct >= 67) return 'ALTO';
    if (pct >= 34) return 'MEDIO';
    return 'BAIXO';
  }

  get progressoHojeGaugeClasse(): string {
    const pct = this.progressoPercentual;
    if (pct >= 67) return 'progress-level--verde';
    if (pct >= 34) return 'progress-level--laranja';
    return 'progress-level--vermelho';
  }

  get progressoHojeNeedleAngle(): number {
    return -90 + (this.progressoPercentual * 180) / 100;
  }

  get progressoHojeArcDasharray(): string {
    const total = 157.1; // semicircunferencia aproximada para r=50
    const filled = (total * this.progressoPercentual) / 100;
    return `${filled.toFixed(1)} ${total.toFixed(1)}`;
  }

  get faltamTopicosConsolidar(): number | null {
    const total = this.totalTopicosEditalAtivo ?? Number(this.resumoEdital?.totalTopicos);
    const consolidados = Number(this.resumoEdital?.topicosConsolidados);
    if (!Number.isFinite(total) || !Number.isFinite(consolidados)) return null;
    return Math.max(0, total - consolidados);
  }

  get totalTopicosEditalAtivo(): number | null {
    const total = this.topicoMateriaMap.size;
    return total > 0 ? total : null;
  }

  get editalEscopoLabel(): string {
    const edital = this.editalAtivoAtual;
    if (!edital) return 'Edital ativo';

    const nome = String(edital?.nome || '').trim();
    const cargo = String(edital?.cargo || '').trim();

    if (nome && cargo) return `${nome} - ${cargo}`;
    return nome || cargo || 'Edital ativo';
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

  get retencao14dPercentualInteiro(): number {
    if (this.retencao14d === null) return 0;
    return Math.max(0, Math.min(100, Math.round(this.retencao14d * 100)));
  }

  get riscoGeralPercentualInteiro(): number {
    const total = this.totalTopicosEditalAtivo ?? Number(this.resumoEdital?.totalTopicos);
    const criticos = Number(this.resumoEdital?.topicosCriticos ?? this.qtdTopicosEmRiscoJanela30 ?? 0);
    const emRisco = Number(this.resumoEdital?.topicosEmRisco ?? 0);

    if (Number.isFinite(total) && total > 0) {
      const numerador = Math.max(0, criticos) + Math.max(0, emRisco);
      const percentual = (numerador / total) * 100;
      if (percentual > 0 && percentual < 1) return 1;
      return Math.max(0, Math.min(100, Math.round(percentual)));
    }

    return this.retencao14dPercentualInteiro;
  }

  get quantidadeTopicosRiscoGeral(): number {
    const criticos = Number(this.resumoEdital?.topicosCriticos ?? this.qtdTopicosEmRiscoJanela30 ?? 0);
    const emRisco = Number(this.resumoEdital?.topicosEmRisco ?? 0);
    const total = Math.max(0, criticos) + Math.max(0, emRisco);
    return Number.isFinite(total) ? total : (this.quantidadeTopicosCriticosParaRevisar || 0);
  }

  get textoTopicosRiscoGeral(): string {
    const qtd = this.quantidadeTopicosRiscoGeral;
    if (qtd === 1) return '1 topico em risco';
    return `${qtd} topicos em risco`;
  }

  get riscoGeralFaixaLabel(): string {
    const v = this.riscoGeralPercentualInteiro;
    if (v >= 75) return 'Critico';
    if (v >= 50) return 'Alto';
    if (v >= 25) return 'Moderado';
    return 'Baixo';
  }

  get riscoGeralFaixaClasse(): string {
    const v = this.riscoGeralPercentualInteiro;
    if (v >= 75) return 'risk-level--critico';
    if (v >= 50) return 'risk-level--alto';
    if (v >= 25) return 'risk-level--moderado';
    return 'risk-level--baixo';
  }

  get riscoGeralNeedleAngle(): number {
    const pct = this.riscoGeralPercentualInteiro;
    return -90 + (pct * 180) / 100;
  }

  get riscoGeralArcDasharray(): string {
    const total = 157.1; // semicircunferencia aproximada para r=50
    const filled = (total * this.riscoGeralPercentualInteiro) / 100;
    return `${filled.toFixed(1)} ${total.toFixed(1)}`;
  }

  get quantidadeTopicosCriticosParaRevisar(): number {
    return this.qtdTopicosEmRiscoJanela30 ?? this.quantidadeTopicosCriticos;
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
    if (this.retencao14d >= 0.7) return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥';
    if (this.retencao14d >= 0.4) return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â ';
    return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â';
  }

  get mediaTopicosPorDia7d(): number {
    const snapshots = this.obterSnapshotsRetencao7d();
    if (!snapshots) return 0;
    const dias = Math.max(1, snapshots.dias);
    const delta = snapshots.atual.consolidados - snapshots.base.consolidados;
    if (!Number.isFinite(delta) || delta <= 0) return 0;
    // Nao arredonda no motor de calculo; arredondamento fica para a camada de exibicao.
    return delta / dias;
  }

  get diasEstimadosConsolidacao(): number | null {
    const restantes = this.faltamTopicosConsolidar;
    if (restantes === null) return null;

    const metrica7d = this.metricaProjecao7d;
    if (metrica7d?.baseInsuficiente) {
      return null;
    }

    const media = metrica7d?.mediaTopicosPorDia7d ?? this.mediaTopicosPorDia7d;
    if (Number.isFinite(media) && media > 0) {
      return Math.ceil(restantes / media);
    }

    const tempoMedio = Number(this.analyticsRetencao30?.tempoMedioDiasAteConsolidar);
    const tempoMedioValido =
      Number.isFinite(tempoMedio) &&
      tempoMedio >= this.TEMPO_MEDIO_MIN &&
      tempoMedio <= this.TEMPO_MEDIO_MAX;

    if (tempoMedioValido) {
      return Math.ceil(restantes * tempoMedio);
    }

    return null;
  }

  get baseProjecaoInsuficiente(): boolean {
    return !!this.metricaProjecao7d?.baseInsuficiente;
  }

  private get metricaProjecao7d():
    | { mediaTopicosPorDia7d: number; deltaTopicos: number; diasJanela: number; baseInsuficiente: boolean }
    | null {
    const snapshots = this.obterSnapshotsRetencao7d();
    if (!snapshots) return null;

    const deltaTopicos = Number(snapshots.atual.consolidados) - Number(snapshots.base.consolidados);
    const diasJanela = Math.max(1, Number(snapshots.dias || 0));
    const mediaTopicosPorDia7d = Number.isFinite(deltaTopicos) && deltaTopicos > 0
      ? deltaTopicos / diasJanela
      : 0;

    const serieLen = Array.isArray(this.analyticsRetencao30?.serie) ? this.analyticsRetencao30!.serie.length : 0;
    const baseInsuficiente =
      serieLen < this.PROJECAO_MIN_SERIE_PONTOS ||
      diasJanela < this.PROJECAO_MIN_DIAS_JANELA ||
      !Number.isFinite(deltaTopicos) ||
      deltaTopicos < this.PROJECAO_MIN_DELTA_TOPICOS;

    return { mediaTopicosPorDia7d, deltaTopicos, diasJanela, baseInsuficiente };
  }

  get mostrarBotaoCriticos(): boolean {
    return this.quantidadeTopicosCriticos > 0;
  }

  get resistenciaGlobalMemoriaPercent(): number | null {
    return this.calcularMediaEstabilidade(Array.from(this.cognitivoPorTopico.values()));
  }

  get resistenciaGlobalMemoriaLabel(): string {
    const valor = this.resistenciaGlobalMemoriaPercent;
    return valor === null ? '--' : `${valor}%`;
  }

  get resistenciaRevisadosHojePercent(): number | null {
    const revisadosHoje = Array.from(this.cognitivoPorTopico.values()).filter((item) => this.foiRevisadoHoje(item));
    return this.calcularMediaEstabilidade(revisadosHoje);
  }

  get resistenciaRevisadosHojeLabel(): string {
    const valor = this.resistenciaRevisadosHojePercent;
    return valor === null ? 'Nenhuma revisão registrada hoje.' : `${valor}%`;
  }

  get qtdTopicosRevisadosHojeCognitivo(): number {
    let qtd = 0;
    for (const item of this.cognitivoPorTopico.values()) {
      if (this.foiRevisadoHoje(item)) qtd += 1;
    }
    return qtd;
  }

  get variacaoResistenciaGlobalOntem(): number | null {
    const hoje = this.resistenciaGlobalMemoriaPercent;
    if (hoje === null || this.estabilidadeGlobalOntem === null) return null;
    return Number((hoje - this.estabilidadeGlobalOntem).toFixed(1));
  }

  get variacaoResistenciaGlobalLabel(): string {
    const delta = this.variacaoResistenciaGlobalOntem;
    if (delta === null) return 'Sem base de ontem';
    if (delta > 0) return `▲ +${delta}%`;
    if (delta < 0) return `▼ ${delta}%`;
    return '0.0%';
  }

  get teveRevisoesHojeCognitivo(): boolean {
    return this.qtdTopicosRevisadosHojeCognitivo > 0;
  }

  get mensagemContextualEstabilidade(): string | null {
    const deltaGlobal = this.variacaoResistenciaGlobalOntem;
    if (deltaGlobal !== null && deltaGlobal < 0 && this.teveRevisoesHojeCognitivo) {
      return 'Mesmo revisando hoje, alguns tópicos não revisados degradaram ao longo do tempo.';
    }

    const revisadosHoje = this.resistenciaRevisadosHojePercent;
    if (revisadosHoje !== null && revisadosHoje > 0) {
      return 'Boa evolução nos tópicos trabalhados hoje.';
    }

    return null;
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

  get quantidadeTopicosEmRiscoTotal(): number {
    let qtd = 0;
    for (const item of this.cognitivoPorTopico.values()) {
      const classificacao = String(item?.classificacao || '').toUpperCase();
      if (classificacao === 'CRITICO' || classificacao === 'EM_RISCO') {
        qtd += 1;
      }
    }
    return qtd;
  }

  get percentualTopicosCriticosInteiro(): number {
    const qtdCriticos = this.qtdTopicosEmRiscoJanela30 ?? this.quantidadeTopicosCriticos;
    const total = this.totalTopicosEditalAtivo;

    if (!Number.isFinite(qtdCriticos) || qtdCriticos <= 0) {
      return 0;
    }

    if (total !== null && total > 0) {
      const percentual = (qtdCriticos / total) * 100;
      if (percentual > 0 && percentual < 1) {
        return 1;
      }
      return Math.max(0, Math.min(100, Math.round(percentual)));
    }

    return this.retencao14dPercentualInteiro;
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
      lastIndex: this.indiceAtual,
      day: this.obterDiaAtualIso(),
      queueKey: this.gerarAssinaturaFilaAtual()
    });

    this.router.navigateByUrl(this.itemAtual.deepLink).finally(() => {
      // Em navegacao normal o componente sera destruido; fallback para falha de navegacao.
      this.modoExecucao = false;
    });
  }

  comecarRevisaoPrioritaria(): void {
    if (this.iniciandoRevisaoPrioritaria || !this.podeComecarRevisaoPrioritaria) {
      return;
    }

    this.iniciandoRevisaoPrioritaria = true;

    forkJoin({
      atrasadas: this.salaEstudoService.listarRevisoesDashboardUnificado({
        status: 'ATRASADA',
        page: 0,
        size: 5000
      }).pipe(catchError(() => of(null))),
      hoje: this.salaEstudoService.listarRevisoesDashboardUnificado({
        status: 'HOJE',
        page: 0,
        size: 5000
      }).pipe(catchError(() => of(null)))
    }).pipe(
      map(({ atrasadas, hoje }) => {
        const atrasadasFiltradas = this.filtrarPorEditalAtivo((atrasadas?.itens || []) as RevisaoDashboardItem[]);
        const primeiroAtrasado = atrasadasFiltradas[0] || null;
        if (primeiroAtrasado?.materiaId) {
          return {
            materiaId: Number(primeiroAtrasado.materiaId),
            topicoId: Number(primeiroAtrasado.topicoId || 0),
            filtro: 'atrasadas'
          };
        }

        const hojeFiltradas = this.filtrarPorEditalAtivo((hoje?.itens || []) as RevisaoDashboardItem[]);
        const primeiroHoje = hojeFiltradas[0] || null;
        return {
          materiaId: Number(primeiroHoje?.materiaId || 0),
          topicoId: Number(primeiroHoje?.topicoId || 0),
          filtro: 'hoje'
        };
      })
    ).subscribe({
      next: (alvo) => {
        const materiaId = Number(alvo?.materiaId || 0);
        if (!materiaId) {
          this.iniciandoRevisaoPrioritaria = false;
          return;
        }

        this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
          queryParams: {
            modo: 'revisar',
            filtro: alvo.filtro,
            topicoId: Number((alvo as any)?.topicoId || 0) || null
          }
        }).finally(() => {
          this.iniciandoRevisaoPrioritaria = false;
        });
      },
      error: () => {
        this.iniciandoRevisaoPrioritaria = false;
      }
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
    if (dias <= 0) return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ 0 dias seguidos';
    if (dias === 1) return 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ 1 dia seguido';
    if (dias >= 7) return `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ ${dias} dias seguidos`;
    return `ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â°ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ ${dias} dias seguidos`;
  }

  private carregarFila(): void {
    this.loading = true;

    this.hojeFilaService.getFilaHoje().subscribe({
      next: (resp) => {
        const filaNormalizada: HojeFilaResponseDTO = {
          totalItens: Array.isArray(resp?.itens) ? resp.itens.length : Number(resp?.totalItens || 0),
          tempoEstimadoMinutos: Number(resp?.tempoEstimadoMinutos || 0),
          itens: Array.isArray(resp?.itens) ? resp.itens : [],
          insights: resp?.insights ?? null
        };
        const filaEnriquecida = this.aplicarMapaMateriaNaFila(filaNormalizada);
        const filaFiltrada = this.filtrarFilaPorEditalAtivo(filaEnriquecida);

        if (filaFiltrada.totalItens > 0 || filaFiltrada.itens.length > 0) {
          this.aplicarFila(filaFiltrada);
          this.loading = false;
          return;
        }

        this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }).subscribe({
          next: (respRevisoes) => {
            const fallback = this.montarFilaFallback(respRevisoes?.itens || []);
            this.aplicarFila(this.filtrarFilaPorEditalAtivo(fallback));
            this.loading = false;
          },
          error: () => {
            this.aplicarFila(filaFiltrada);
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
          detail: err?.error?.message || 'NÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o foi possÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­vel carregar a fila de hoje.'
        });
      }
    });
  }

  private carregarStreakResumo(): void {
    this.hojeFilaService.getDashboardStreak().subscribe({
      next: (resumo) => {
        this.streakResumo = resumo;
        const streakBackend = Number(resumo?.streakAtual);
        this.streakDias = Number.isFinite(streakBackend) && streakBackend >= 0 ? streakBackend : 0;
      },
      error: () => {
        this.streakResumo = null;
        this.streakDias = 0;
      }
    });
  }

  private carregarResumoRevisoes(): void {
    this.salaEstudoService.limparCacheRevisoesDashboard();
    this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }).subscribe({
      next: (resp) => {
        const itensFiltrados = this.filtrarPorEditalAtivo((resp?.itens || []) as RevisaoDashboardItem[]);
        this.contagemRevisoesCards = this.calcularContagemRevisoesCards(itensFiltrados);
        this.resumoRevisoes = this.contagemRevisoesCards
          ? {
              vencidas: this.contagemRevisoesCards.vencidas,
              hoje: this.contagemRevisoesCards.hoje,
              emDia: this.contagemRevisoesCards.emDia,
              total: this.contagemRevisoesCards.vencidas + this.contagemRevisoesCards.hoje + this.contagemRevisoesCards.emDia
            }
          : null;
      },
      error: () => {
        this.resumoRevisoes = null;
        this.contagemRevisoesCards = null;
      }
    });
  }

  private calcularContagemRevisoesCards(itens: RevisaoDashboardItem[]): { vencidas: number; hoje: number; emDia: number } {
    const vencidas = new Set<string>();
    const hoje = new Set<string>();
    const emDia = new Set<string>();
    const hojeRef = new Date();

    for (const item of itens || []) {
      const chave = `${Number(item?.materiaId || 0)}:${Number(item?.topicoId || 0)}`;
      if (chave === '0:0') continue;

      const statusCanonico = extrairStatusCanonicoRevisao(item, hojeRef);
      const statusDashboard = statusCanonicoParaDashboard(statusCanonico) || 'FUTURA';

      if (statusDashboard === 'VENCIDA') {
        vencidas.add(chave);
      } else if (statusDashboard === 'EM_DIA') {
        hoje.add(chave);
      } else if (statusDashboard === 'FUTURA') {
        emDia.add(chave);
      }
    }

    return {
      vencidas: vencidas.size,
      hoje: hoje.size,
      emDia: emDia.size
    };
  }

  private aplicarFila(fila: HojeFilaResponseDTO): void {
    this.fila = fila;
    this.aplicarRetornoExecucao();
    this.atualizarItemAtual();
    this.registrarConclusaoFilaSeNecessario();
  }

  private montarFilaFallback(revisoes: RevisaoDashboardItem[]): HojeFilaResponseDTO {
    const itens = this.filtrarPorEditalAtivo(revisoes || [])
      .filter((r) => Number(r?.topicoId) > 0)
      .filter((r) => this.revisaoEhPendenteParaHoje(r))
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

  private aplicarMapaMateriaNaFila(fila: HojeFilaResponseDTO): HojeFilaResponseDTO {
    if (!fila?.itens?.length || !this.topicoMateriaMap.size) {
      return fila;
    }

    const itens = fila.itens.map((item) => {
      const topicoId = Number(item?.topicoId || 0);
      const ref = this.topicoMateriaMap.get(topicoId);
      if (!ref) {
        return item;
      }

      const materiaId = ref.materiaId;
      const materiaNome = ref.materiaNome ?? item.materiaNome ?? null;

      return {
        ...item,
        materiaId,
        materiaNome,
        deepLink: materiaId
          ? `/area-restrita/sala-estudo/${materiaId}?topicoId=${topicoId}`
          : item.deepLink
      };
    });

    return { ...fila, itens };
  }

  private carregarMapaTopicoMateria(): void {
    this.editalService.listarComInclude(['materias', 'topicos']).pipe(
      switchMap((editais) => {
        const ativos = (editais || []).filter((e) => e?.ativo && Number(e?.id) > 0);
        if (!ativos.length) {
          return of([] as Edital[]);
        }

        const pendentes = ativos.filter((edital) => !this.editalTemTopicos(edital));
        if (!pendentes.length) {
          return of(ativos);
        }

        const requisicoes = pendentes.map((edital) =>
          this.editalService.buscarPorId(Number(edital.id)).pipe(catchError(() => of(edital)))
        );
        if (!requisicoes.length) {
          return of(ativos);
        }

        return forkJoin(requisicoes).pipe(
          map((hidratados) => {
            const porId = new Map<number, Edital>();
            (hidratados || []).forEach((e) => {
              const id = Number(e?.id);
              if (id > 0) porId.set(id, e);
            });

            return ativos.map((edital) => porId.get(Number(edital.id)) || edital);
          })
        );
      })
    ).subscribe({
      next: (editais) => {
        const lista = editais || [];
        this.editalAtivoAtual = lista.find((e) => e?.ativo) || lista[0] || null;
        this.rebuildTopicoMateriaMap(lista);
        this.editalAtivoResolvido = true;
        this.recarregarDadosComFiltroEditalAtivo();
      },
      error: () => {
        this.topicoMateriaMap.clear();
        this.materiaIdsEditalAtivo.clear();
        this.editalAtivoAtual = null;
        this.editalAtivoResolvido = false;
      }
    });
  }

  private editalTemTopicos(edital: Edital | null | undefined): boolean {
    return Boolean((edital?.materias || []).some((m: any) => Array.isArray(m?.topicos) && m.topicos.length > 0));
  }

  private rebuildTopicoMateriaMap(editais: Edital[]): void {
    const mapa = new Map<number, TopicoMateriaRef>();
    const materiaIds = new Set<number>();

    for (const edital of editais || []) {
      for (const materia of (edital as any)?.materias || []) {
        if ((materia as any)?.ativo === false) continue;
        const materiaId = Number((materia as any)?.materiaId ?? (materia as any)?.id);
        const materiaNome = String((materia as any)?.materiaNome ?? (materia as any)?.nome ?? '').trim() || null;
        if (!Number.isFinite(materiaId) || materiaId <= 0) continue;
        materiaIds.add(materiaId);

        this.indexarTopicosMateria(mapa, (materia as any)?.topicos || [], {
          materiaId,
          materiaNome
        });
      }
    }

    this.topicoMateriaMap = mapa;
    this.materiaIdsEditalAtivo = materiaIds;
  }

  private indexarTopicosMateria(mapa: Map<number, TopicoMateriaRef>, topicos: any[], ref: TopicoMateriaRef): void {
    for (const topico of topicos || []) {
      const topicoId = Number((topico as any)?.id ?? (topico as any)?.topicoId);
      if (Number.isFinite(topicoId) && topicoId > 0 && !mapa.has(topicoId)) {
        mapa.set(topicoId, ref);
      }

      const filhos = (topico as any)?.subtopicos ?? (topico as any)?.filhos ?? (topico as any)?.children ?? [];
      if (Array.isArray(filhos) && filhos.length > 0) {
        this.indexarTopicosMateria(mapa, filhos, ref);
      }
    }
  }

  private normalizarPrioridadeFallback(status: string | undefined): PrioridadeFilaHoje {
    const key = String(status || '').toUpperCase();
    if (key === 'ATRASADA' || key === 'VENCIDA') return PrioridadeFilaHoje.ATRASADA;
    if (key === 'HOJE') return PrioridadeFilaHoje.ALTA;
    if (key === 'CRITICO') return PrioridadeFilaHoje.CRITICO;
    if (key === 'EM_RISCO') return PrioridadeFilaHoje.EM_RISCO;
    return PrioridadeFilaHoje.MEDIA;
  }

  private revisaoEhPendenteParaHoje(item: RevisaoDashboardItem): boolean {
    const statusCanonico = String(item?.statusCanonico || item?.statusRevisao || '').toUpperCase();
    if (statusCanonico === 'ATRASADA' || statusCanonico === 'HOJE') {
      return true;
    }

    const status = String(item?.status || '').toUpperCase();
    return status === 'VENCIDA' || status === 'EM_DIA';
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
    const day = this.obterDiaAtualIso();
    const queueKey = this.gerarAssinaturaFilaAtual();

    if (!state || state.day !== day || state.queueKey !== queueKey) {
      this.indiceAtual = 0;
      this.modoExecucao = false;
      if (this.totalItens > 0) {
        this.salvarEstadoExecucao({
          pendingAdvance: false,
          lastIndex: 0,
          day,
          queueKey
        });
      }
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
      this.carregarStreakResumo();
      this.salvarEstadoExecucao({
        pendingAdvance: false,
        lastIndex: this.indiceAtual,
        day,
        queueKey
      });
      this.modoExecucao = false;
      return;
    }

    this.indiceAtual = Math.min(Math.max(0, state.lastIndex), this.totalItens);
    this.salvarEstadoExecucao({
      pendingAdvance: false,
      lastIndex: this.indiceAtual,
      day,
      queueKey
    });
    this.modoExecucao = false;
  }

  private lerEstadoExecucao(): HojeExecucaoState | null {
    const parsed = this.estadoExecucaoMemoria;
    if (
      !parsed ||
      typeof parsed.pendingAdvance !== 'boolean' ||
      typeof parsed.lastIndex !== 'number' ||
      typeof parsed.day !== 'string' ||
      typeof parsed.queueKey !== 'string'
    ) {
      this.removerEstadoExecucao();
      return null;
    }
    return parsed;
  }

  private salvarEstadoExecucao(state: HojeExecucaoState): void {
    this.estadoExecucaoMemoria = { ...state };
  }

  private removerEstadoExecucao(): void {
    this.estadoExecucaoMemoria = null;
  }

  private limparEstadoExecucaoLegado(): void {
    this.removerEstadoExecucao();
  }

  private obterDiaAtualIso(): string {
    return this.formatarDiaLocal(new Date());
  }

  private gerarAssinaturaFilaAtual(): string {
    const itens = Array.isArray(this.fila?.itens) ? this.fila.itens : [];
    const assinaturaItens = itens
      .map((item) => `${item?.tipo || 'TOPICO'}:${Number(item?.topicoId || 0)}:${String(item?.prioridade || '')}`)
      .join('|');
    return `${this.totalItens}::${assinaturaItens}`;
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

  private carregarAnalyticsRetencao(): void {
    this.retencaoAnalyticsService.buscarAnalyticsRetencao(30).subscribe({
      next: (analytics) => {
        this.analyticsRetencao30 = analytics || null;
      },
      error: () => {
        this.analyticsRetencao30 = null;
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
        const filtrados = this.filtrarTopicosCognitivosPorEditalAtivo(topicos || []);
        filtrados.forEach((t) => {
          if (t?.topicoId) this.cognitivoPorTopico.set(t.topicoId, t);
        });
        this.atualizarSnapshotEstabilidadeGlobal();
        if (resolverFeedback) {
          this.resolverFeedbackConclusaoPendente(prioridadeFallback);
        }
      },
      error: () => {
        this.cognitivoPorTopico.clear();
        this.estabilidadeGlobalOntem = null;
      }
    });
  }

  private atualizarSnapshotEstabilidadeGlobal(): void {
    const hoje = this.obterDiaAtualIso();
    const ontem = this.obterDiaIsoOffset(-1);
    const estabilidadeAtual = this.resistenciaGlobalMemoriaPercent;
    if (estabilidadeAtual === null) {
      this.estabilidadeGlobalOntem = null;
      return;
    }

    const snapshots = this.lerSnapshotsEstabilidade();
    const snapOntem = snapshots.find((s) => s?.dia === ontem);
    this.estabilidadeGlobalOntem = Number.isFinite(Number(snapOntem?.valor))
      ? Number(snapOntem?.valor)
      : null;

    const semHoje = snapshots.filter((s) => s?.dia !== hoje);
    semHoje.push({ dia: hoje, valor: estabilidadeAtual });
    const recentes = semHoje
      .filter((s) => s && typeof s.dia === 'string' && Number.isFinite(Number(s.valor)))
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .slice(-15);

    this.salvarSnapshotsEstabilidade(recentes);
  }

  private lerSnapshotsEstabilidade(): Array<{ dia: string; valor: number }> {
    try {
      const raw = localStorage.getItem(this.estabilidadeSnapshotKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private salvarSnapshotsEstabilidade(snapshots: Array<{ dia: string; valor: number }>): void {
    try {
      localStorage.setItem(this.estabilidadeSnapshotKey, JSON.stringify(snapshots));
    } catch {
      // sem impacto no fluxo da tela
    }
  }

  private obterDiaIsoOffset(offsetDias: number): string {
    const data = new Date();
    data.setHours(0, 0, 0, 0);
    data.setDate(data.getDate() + offsetDias);
    return this.formatarDiaLocal(data);
  }

  private calcularMediaEstabilidade(topicos: TopicoCognitivoDTO[]): number | null {
    const valores = (topicos || [])
      .map((item) => this.normalizarPercent(item?.stability))
      .filter((v): v is number => v !== null);

    if (!valores.length) return null;
    const media = valores.reduce((acc, v) => acc + v, 0) / valores.length;
    return Number(media.toFixed(1));
  }

  private normalizarPercent(valor: number | null | undefined): number | null {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return Math.max(0, Math.min(100, n * 100));
    return Math.max(0, Math.min(100, n));
  }

  private foiRevisadoHoje(item: TopicoCognitivoDTO | null | undefined): boolean {
    if (!item) return false;

    const datasRevisao = [
      item.ultimaRevisaoEm,
      item.ultimaRevisao,
      item.dataUltimaRevisao
    ].filter((v) => !!v);

    if (datasRevisao.length > 0) {
      return datasRevisao.some((valor) => this.dataEhHoje(valor));
    }

    const datasEvento = [item.dataUltimoEvento, item.ultimoEventoEm].filter((v) => !!v);
    if (datasEvento.length > 0) {
      return datasEvento.some((valor) => this.dataEhHoje(valor));
    }

    const diasDesdeUltimoEvento = Number(item.diasDesdeUltimoEvento);
    return Number.isFinite(diasDesdeUltimoEvento) && diasDesdeUltimoEvento === 0;
  }

  private dataEhHoje(valor: unknown): boolean {
    if (!valor) return false;
    const data = new Date(String(valor));
    if (!Number.isFinite(data.getTime())) return false;
    return this.formatarDiaLocal(data) === this.obterDiaAtualIso();
  }

  private carregarQtdTopicosEmRiscoJanela30(): void {
    this.retencaoAnalyticsService.buscarTopicosEmRisco(30, 200).subscribe({
      next: (topicos) => {
        this.qtdTopicosEmRiscoJanela30 = Array.isArray(topicos)
          ? topicos
            .filter((t) => this.pertenceAoEditalAtivoPorTopicoOuMateria((t as any)?.topicoId, (t as any)?.materiaId))
            .filter((t) => String((t as any)?.classificacao || '').toUpperCase() === 'CRITICO').length
          : 0;
      },
      error: () => {
        this.qtdTopicosEmRiscoJanela30 = null;
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
        this.mostrarFeedbackConclusaoCustom('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Risco de esquecimento reduzido');
        this.feedbackConclusaoPendente = null;
        this.limparSnapshotCognitivoAntes();
        return;
      }
      if (
        snapshotAntes.stability !== null &&
        cognitivoAtual.stability !== null &&
        cognitivoAtual.stability > snapshotAntes.stability
      ) {
        this.mostrarFeedbackConclusaoCustom('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Estabilidade fortalecida');
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
      this.mostrarFeedbackConclusaoCustom('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Retencao 14d aumentou');
      return;
    }

    this.feedbackConclusaoPendente = null;
    this.limparSnapshotCognitivoAntes();
    this.limparSnapshotRetencaoAntes();
    if (prioridade) {
      this.mostrarFeedbackConclusaoCustom('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Topico reforcado');
      return;
    }
    this.mostrarFeedbackConclusaoCustom('ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â Topico reforcado');
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
    this.hojeTrackingService.registrarItemConcluido(
      itemConcluido.tipo,
      itemConcluido.prioridade,
      Number(itemConcluido.tempoEstimadoMinutos || 0)
    );
  }

  private registrarConclusaoFilaSeNecessario(): void {
    if (!this.revisaoConcluida || this.filaConcluidaRegistrada) return;
    const hoje = this.obterDiaAtualIso();
    if (this.ultimoDiaFilaConcluidaMemoria === hoje) {
      this.filaConcluidaRegistrada = true;
      return;
    }
    this.hojeTrackingService.registrarFilaConcluida(this.totalItens, this.tempoTotalInvestidoMinutos);
    this.ultimoDiaFilaConcluidaMemoria = hoje;
    this.filaConcluidaRegistrada = true;
  }

  private salvarSnapshotCognitivoAntes(topicoId: number): void {
    if (!topicoId) return;
    const atual = this.cognitivoPorTopico.get(topicoId);
    if (!atual) {
      this.limparSnapshotCognitivoAntes();
      return;
    }
    this.snapshotCognitivoAntesMemoria = {
      topicoId,
      risk: atual.risk ?? null,
      stability: atual.stability ?? null
    };
  }

  private salvarSnapshotRetencaoAntes(): void {
    if (this.retencao14d === null) {
      this.limparSnapshotRetencaoAntes();
      return;
    }
    this.snapshotRetencaoAntesMemoria = this.retencao14d;
  }

  private lerSnapshotRetencaoAntes(): number | null {
    return Number.isFinite(Number(this.snapshotRetencaoAntesMemoria))
      ? Number(this.snapshotRetencaoAntesMemoria)
      : null;
  }

  private limparSnapshotRetencaoAntes(): void {
    this.snapshotRetencaoAntesMemoria = null;
  }

  private lerSnapshotCognitivoAntes(): { topicoId: number; risk: number | null; stability: number | null } | null {
    const parsed = this.snapshotCognitivoAntesMemoria;
    if (!parsed || typeof parsed.topicoId !== 'number') {
      return null;
    }
    return {
      topicoId: parsed.topicoId,
      risk: Number.isFinite(Number(parsed.risk)) ? Number(parsed.risk) : null,
      stability: Number.isFinite(Number(parsed.stability)) ? Number(parsed.stability) : null
    };
  }

  private limparSnapshotCognitivoAntes(): void {
    this.snapshotCognitivoAntesMemoria = null;
  }

  private formatarDiaLocal(data: Date): string {
    const yyyy = data.getFullYear();
    const mm = String(data.getMonth() + 1).padStart(2, '0');
    const dd = String(data.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private obterSnapshotsRetencao7d():
    | { base: RetencaoAnalyticsSerieDTO; atual: RetencaoAnalyticsSerieDTO; dias: number }
    | null {
    const serie = this.analyticsRetencao30?.serie || [];
    if (!Array.isArray(serie) || serie.length < 2) return null;

    const atual = serie[serie.length - 1];
    if (!atual) return null;

    const dataAtual = new Date(atual.data).getTime();
    const targetBaseTime = Number.isFinite(dataAtual)
      ? (dataAtual - (this.PROJECAO_JANELA_DIAS * this.ONE_DAY_MS))
      : null;

    let base: RetencaoAnalyticsSerieDTO | null = null;
    let baseTime = Number.NEGATIVE_INFINITY;

    if (targetBaseTime !== null) {
      for (const ponto of serie) {
        const ts = new Date(String(ponto?.data || '')).getTime();
        if (!Number.isFinite(ts)) continue;
        if (ts <= targetBaseTime && ts > baseTime) {
          base = ponto;
          baseTime = ts;
        }
      }
    }

    if (!base) {
      base = serie[0] || null;
    }
    if (!base) return null;

    const dataBase = new Date(base.data).getTime();
    const dias = Number.isFinite(dataAtual) && Number.isFinite(dataBase)
      ? Math.max(1, Math.ceil((dataAtual - dataBase) / this.ONE_DAY_MS))
      : Math.max(1, serie.length - 1);

    return { base, atual, dias };
  }

  get streakDiasAtual(): number {
    const valor = Number(this.streakDias);
    if (Number.isFinite(valor) && valor >= 0) {
      const statusHoje = this.streakResumo?.statusHoje;
      const melhor = Number(this.streakResumo?.melhorStreak || 0);
      // Protege a UI de resposta incoerente: "INICIOU/CONCLUIU" nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o deve exibir 0
      if (valor === 0 && (statusHoje === 'INICIOU' || statusHoje === 'CONCLUIU') && melhor > 0) {
        return 1;
      }
      return valor;
    }
    return 0;
  }

  private filtrarFilaPorEditalAtivo(fila: HojeFilaResponseDTO): HojeFilaResponseDTO {
    const itens = this.filtrarPorEditalAtivo(Array.isArray(fila?.itens) ? fila.itens : []);
    const tempoEstimadoMinutos = itens.reduce((acc, item) => acc + Number(item?.tempoEstimadoMinutos || 0), 0);
    return {
      ...fila,
      totalItens: itens.length,
      tempoEstimadoMinutos,
      itens
    };
  }

  private filtrarTopicosCognitivosPorEditalAtivo(topicos: TopicoCognitivoDTO[]): TopicoCognitivoDTO[] {
    const lista = Array.isArray(topicos) ? topicos : [];
    return lista.filter((item) => this.pertenceAoEditalAtivoPorTopicoOuMateria(item?.topicoId, item?.materiaId));
  }

  private filtrarPorEditalAtivo<T extends { topicoId?: number | null; materiaId?: number | null }>(itens: T[]): T[] {
    const lista = Array.isArray(itens) ? itens : [];
    if (!this.editalAtivoResolvido) return lista;
    if (!this.materiaIdsEditalAtivo.size) return [];
    return lista.filter((item) => this.pertenceAoEditalAtivoPorTopicoOuMateria(item?.topicoId, item?.materiaId));
  }

  private pertenceAoEditalAtivoPorTopicoOuMateria(topicoId: unknown, materiaId: unknown): boolean {
    const materiaIdNum = Number(materiaId);
    if (Number.isFinite(materiaIdNum) && materiaIdNum > 0) {
      return this.materiaIdsEditalAtivo.has(materiaIdNum);
    }

    const topicoIdNum = Number(topicoId);
    if (Number.isFinite(topicoIdNum) && topicoIdNum > 0) {
      const ref = this.topicoMateriaMap.get(topicoIdNum);
      return !!ref && this.materiaIdsEditalAtivo.has(ref.materiaId);
    }

    return false;
  }

  private recarregarDadosComFiltroEditalAtivo(): void {
    this.carregarFila();
    this.carregarResumoRevisoes();
    this.carregarTopicosCognitivos();
    this.carregarQtdTopicosEmRiscoJanela30();
  }
}



