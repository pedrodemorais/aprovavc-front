import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { catchError, map, of, switchMap } from 'rxjs';
import { TopicoCognitivoDTO } from 'src/app/core/models/cognitive-metrics.models';
import {
  AvaliacaoRevisao,
  ClassificacaoRetencaoTopico,
  EditalResumoRetencaoDTO,
  ErroReincidenteDTO,
  RetencaoAnalyticsResponseDTO,
  RetencaoAnalyticsSerieDTO,
  RetencaoPontoDTO,
  RevisaoEventoHistoricoDTO,
  TopicoRiscoDTO
} from 'src/app/core/models/retencao-analytics.models';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';
import { EditalService } from 'src/app/core/components/area-aluno/services/edital.service';
import { Edital } from 'src/app/core/components/area-aluno/models/Edital';
import {
  getSnapshotComparacao,
  getSnapshotHoje,
  insightEvolucao,
  insightProjecao,
  insightVelocidade,
  normalizarSummary
} from './retencao-insights.util';
import {
  ESTADO_SISTEMA_EXPLICACAO_CURTA,
  calcularIndiceEstabilidade,
  calcularMomentum,
  mapearFaixaEstabilidade,
  montarDelta7dLabel,
  montarProximaAcaoEstadoSistema,
  montarUrgenciaEstadoSistema
} from './retencao-system-intelligence.util';

interface TopicoMateriaRef {
  materiaId: number;
  materiaNome: string | null;
}

@Component({
  selector: 'app-retencao-dashboard',
  templateUrl: './retencao-dashboard.component.html',
  styleUrls: ['./retencao-dashboard.component.css']
})
export class RetencaoDashboardComponent implements OnInit {
  abaSelecionada: 'geral' | 'criticos' = 'geral';
  janelaSelecionada: 7 | 14 | 30 = 30;
  janelaOptions: Array<{ label: string; value: 7 | 14 | 30 }> = [
    { label: '7 dias', value: 7 },
    { label: '14 dias', value: 14 },
    { label: '30 dias', value: 30 }
  ];

  resumo: EditalResumoRetencaoDTO | null = null;
  topicosEmRisco: TopicoRiscoDTO[] = [];
  errosReincidentes: ErroReincidenteDTO[] = [];

  carregandoResumo = false;
  carregandoRisco = false;
  carregandoErros = false;
  carregandoCriticos = false;
  carregandoAnalytics = false;

  premiumBloqueado = false;

  detalhesVisivel = false;
  topicoDetalheId: number | null = null;
  topicoDetalheNome = '';
  serieDetalhe: RetencaoPontoDTO[] = [];
  historicoDetalhe: RevisaoEventoHistoricoDTO[] = [];
  carregandoDetalhes = false;

  readonly classificacao = ClassificacaoRetencaoTopico;
  topicosCriticos: TopicoCognitivoDTO[] = [];
  analytics: RetencaoAnalyticsResponseDTO | null = null;
  private topicoMateriaMap = new Map<number, TopicoMateriaRef>();
  private editalAtivoAtual: Edital | null = null;
  tendenciasChartData: any;
  estadoSistemaVM: {
    score: number;
    label: string;
    faixaTexto: string;
    explicacaoCurta: string;
    urgencia: { nivel: 'ok' | 'warn' | 'danger'; texto: string };
    proximaAcao: {
      texto: string;
      ctaLabel: string;
      ctaAction: 'goCriticos' | 'goRisco' | 'startFirstCritico' | 'none';
    };
    delta7dLabel: string | null;
  } = {
    score: 100,
    label: 'Saudavel',
    faixaTexto: 'Zona verde',
    explicacaoCurta: ESTADO_SISTEMA_EXPLICACAO_CURTA,
    urgencia: { nivel: 'ok', texto: 'Boa estabilidade - mantenha a consistencia para nao voltar a acumular.' },
    proximaAcao: { texto: 'Continue revisando para manter o sistema saudavel.', ctaLabel: '', ctaAction: 'none' },
    delta7dLabel: 'Tendencia: - (historico insuficiente)'
  };
  velocidadeDiasValor = 'â€”';
  velocidadeComparativoLabel = 'â€” (sem historico de velocidade)';
  projecaoDiasValor = 'â€”';
  projecaoDiasSub = 'precisamos de mais dias de historico';
  projecaoDiasExtra = '';
  evolucaoValor = 'â€”';
  evolucaoSub = 'historico insuficiente';
  evolucaoExtra = 'â€”';
  readonly tendenciasChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        min: 0,
        max: 100,
        ticks: {
          callback: (value: number) => `${value}%`
        },
        title: {
          display: true,
          text: 'Consolidacao (%)'
        }
      },
      y1: {
        type: 'linear',
        position: 'right',
        min: 0,
        ticks: {
          precision: 0
        },
        grid: {
          drawOnChartArea: false
        },
        title: {
          display: true,
          text: 'Criticos (qtd)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const serie = context?.raw as RetencaoAnalyticsSerieDTO | undefined;
            if (!serie) return `${context.dataset.label}: ${context.formattedValue}`;
            if (context.dataset?.yAxisID === 'y1') return `Criticos: ${serie.criticosCount}`;
            return `Consolidacao: ${Number(serie.consolidacaoPercent || 0).toFixed(1)}%`;
          },
          afterBody: (items: any[]) => {
            const serie = items?.[0]?.raw as RetencaoAnalyticsSerieDTO | undefined;
            if (!serie) return [];
            return [
              `Consolidados: ${serie.consolidados}`,
              `Em risco: ${serie.emRisco}`,
              `Criticos: ${serie.criticos}`,
              `Sem dados: ${serie.semDados}`
            ];
          }
        }
      }
    }
  };

  constructor(
    private retencaoService: RetencaoAnalyticsService,
    private editalService: EditalService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const view = String(this.route.snapshot.queryParamMap.get('view') || '').toLowerCase();
    if (view === 'criticos') {
      this.abaSelecionada = 'criticos';
    }
    this.carregarMapaTopicoMateria();
    this.carregarResumoETopicos();
    this.carregarErrosReincidentes();
    this.carregarTopicosCriticos();
  }

  onJanelaChange(): void {
    this.carregarResumoETopicos();
    this.carregarTopicosCriticos();
  }

  carregarResumoETopicos(): void {
    this.carregandoResumo = true;
    this.carregandoRisco = true;
    this.carregandoAnalytics = true;

    forkJoin({
      resumo: this.retencaoService.buscarResumoEdital(this.janelaSelecionada),
      topicos: this.retencaoService.buscarTopicosEmRisco(this.janelaSelecionada, 50),
      analytics: this.retencaoService.buscarAnalyticsRetencao(this.janelaSelecionada)
    }).subscribe({
      next: ({ resumo, topicos, analytics }) => {
        this.resumo = resumo;
        this.topicosEmRisco = this.aplicarMapaMateria(topicos || []);
        this.analytics = analytics || null;
        this.topicosCriticos = this.converterTopicosRiscoParaCriticos(this.topicosEmRisco);
        this.montarGraficoTendencias(analytics?.serie || []);
        this.atualizarMetricasEstrategicas();
        this.carregandoResumo = false;
        this.carregandoRisco = false;
        this.carregandoAnalytics = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoResumo = false;
        this.carregandoRisco = false;
        this.carregandoAnalytics = false;
        this.analytics = null;
        this.tendenciasChartData = null;
        this.atualizarMetricasEstrategicas();
        this.tratarErroHttp(err, 'Falha ao carregar dados de retenÃ§Ã£o');
      }
    });
  }

  get dominioScoreLabel(): string {
    const total = Number(this.resumo?.totalTopicos);
    const consolidados = Number(this.resumo?.topicosConsolidados);
    const emRisco = Number(this.resumo?.topicosEmRisco);
    const criticos = Number(this.resumo?.topicosCriticos);
    const semDados = Number(this.resumo?.topicosSemDados);

    let score: number;
    if (
      Number.isFinite(total) &&
      total > 0 &&
      Number.isFinite(consolidados) &&
      Number.isFinite(emRisco) &&
      Number.isFinite(criticos) &&
      Number.isFinite(semDados)
    ) {
      score = ((consolidados * 1.0) + (emRisco * 0.6) + (criticos * 0.2) + (semDados * 0.0)) / total * 100;
    } else {
      score = Number(this.analytics?.dominioScore);
    }

    if (!Number.isFinite(score)) return 'â€”';
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    return `${clamped}/100`;
  }

  get tempoMedioConsolidacaoLabel(): string {
    const valor = Number(this.analytics?.tempoMedioDiasAteConsolidar);
    if (!Number.isFinite(valor) || valor <= 0) return 'â€”';
    return `${valor.toFixed(1)} dias`;
  }

  get totalTopicosResumo(): number {
    const total = Number(this.resumo?.totalTopicos ?? 0);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  get quantidadeTopicosCriticosCard(): number {
    const qtd = Number(this.resumo?.topicosCriticos ?? 0);
    return Number.isFinite(qtd) && qtd > 0 ? Math.round(qtd) : 0;
  }

  get quantidadeTopicosRiscoGeralCard(): number {
    const criticos = Number(this.resumo?.topicosCriticos ?? 0);
    const emRisco = Number(this.resumo?.topicosEmRisco ?? 0);
    const total = (Number.isFinite(criticos) ? criticos : 0) + (Number.isFinite(emRisco) ? emRisco : 0);
    return total > 0 ? Math.round(total) : 0;
  }

  get percentualTopicosCriticosCard(): number {
    const total = this.totalTopicosResumo;
    if (total <= 0) return 0;
    const percentual = (this.quantidadeTopicosCriticosCard / total) * 100;
    if (percentual > 0 && percentual < 1) return 1;
    return Math.max(0, Math.min(100, Math.round(percentual)));
  }

  get percentualRiscoGeralCard(): number {
    const total = this.totalTopicosResumo;
    if (total <= 0) return 0;
    const percentual = (this.quantidadeTopicosRiscoGeralCard / total) * 100;
    if (percentual > 0 && percentual < 1) return 1;
    return Math.max(0, Math.min(100, Math.round(percentual)));
  }

  get riscoGeralFaixaLabelCard(): string {
    const v = this.percentualRiscoGeralCard;
    if (v >= 75) return 'CRITICO';
    if (v >= 50) return 'ALTO';
    if (v >= 25) return 'MODERADO';
    return 'BAIXO';
  }

  get riscoGeralFaixaClasseCard(): string {
    const v = this.percentualRiscoGeralCard;
    if (v >= 75) return 'risk-level--critico';
    if (v >= 50) return 'risk-level--alto';
    if (v >= 25) return 'risk-level--moderado';
    return 'risk-level--baixo';
  }

  get riscoGeralNeedleAngleCard(): number {
    const pct = this.percentualRiscoGeralCard;
    return -90 + (pct * 180) / 100;
  }

  get riscoGeralArcDasharrayCard(): string {
    const total = 157.1;
    const filled = (total * this.percentualRiscoGeralCard) / 100;
    return `${filled.toFixed(1)} ${total.toFixed(1)}`;
  }

  get percentualConsolidadoCardLabel(): string {
    const valor = Number(this.resumo?.percentualConsolidado ?? 0);
    const normalizado = Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : 0;
    return `${normalizado.toFixed(1)}%`;
  }

  get faltamTopicosConsolidarCard(): number {
    const total = Number(this.resumo?.totalTopicos ?? 0);
    const consolidados = Number(this.resumo?.topicosConsolidados ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(consolidados)) return 0;
    return Math.max(0, Math.round(total - consolidados));
  }

  get editalEscopoLabelCard(): string {
    const edital = this.editalAtivoAtual;
    if (!edital) return 'Edital ativo';
    const nome = String(edital?.nome || '').trim();
    const cargo = String(edital?.cargo || '').trim();
    if (nome && cargo) return `${nome} ${cargo}`;
    return nome || cargo || 'Edital ativo';
  }

  get estadoSistemaClasse(): string {
    switch (this.estadoSistemaVM.label) {
      case 'Saudavel':
        return 'estado-sistema-saudavel';
      case 'Estavel':
        return 'estado-sistema-estavel';
      case 'Instavel':
        return 'estado-sistema-instavel';
      default:
        return 'estado-sistema-critico';
    }
  }

  carregarErrosReincidentes(): void {
    this.carregandoErros = true;
    this.retencaoService.buscarErrosReincidentes(30, 20).subscribe({
      next: (itens) => {
        this.errosReincidentes = this.aplicarMapaMateria(itens || []);
        this.carregandoErros = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoErros = false;
        this.tratarErroHttp(err, 'Falha ao carregar erros reincidentes');
      }
    });
  }

  selecionarAba(aba: 'geral' | 'criticos'): void {
    this.abaSelecionada = aba;
  }

  carregarTopicosCriticos(): void {
    this.carregandoCriticos = true;
    this.retencaoService.buscarTopicosEmRisco(this.janelaSelecionada, 200).subscribe({
      next: (itens) => {
        const normalizados = this.aplicarMapaMateria(itens || []);
        this.topicosCriticos = this.converterTopicosRiscoParaCriticos(normalizados);
        this.carregandoCriticos = false;
      },
      error: (err: HttpErrorResponse) => {
        this.topicosCriticos = [];
        this.carregandoCriticos = false;
        this.tratarErroHttp(err, 'Falha ao carregar topicos criticos');
      }
    });
  }

  abrirDetalhes(topico: { topicoId: number; nomeTopico: string | null }): void {
    this.topicoDetalheId = topico.topicoId;
    this.topicoDetalheNome = topico.nomeTopico || `TÃ³pico ${topico.topicoId}`;
    this.detalhesVisivel = true;
    this.carregandoDetalhes = true;
    this.serieDetalhe = [];
    this.historicoDetalhe = [];

    forkJoin({
      serie: this.retencaoService.buscarSerieTopico(topico.topicoId, 30),
      historico: this.retencaoService.buscarHistoricoTopico(topico.topicoId, 30)
    }).subscribe({
      next: ({ serie, historico }) => {
        this.serieDetalhe = serie || [];
        this.historicoDetalhe = historico || [];
        this.carregandoDetalhes = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoDetalhes = false;
        this.tratarErroHttp(err, 'Falha ao carregar detalhes do tÃ³pico');
      }
    });
  }

  revisarAgora(materiaId: number | null, topicoId: number): void {
    if (materiaId == null) {
      return;
    }
    this.router.navigate([`/area-restrita/sala-estudo/${materiaId}`], {
      queryParams: { topicoId }
    });
  }

  irParaPlanos(): void {
    this.router.navigate(['/area-restrita/assinatura']);
  }

  formatarPercentual(valor: number | null | undefined): string {
    const numero = Number(valor ?? 0);
    return `${numero.toFixed(1)}%`;
  }

  get resumoPizzaStyle(): string {
    const consolidado = this.clampPercent(this.resumo?.percentualConsolidado);
    const risco = this.clampPercent(this.resumo?.percentualEmRisco);
    const critico = this.clampPercent(this.resumo?.percentualCritico);
    const semDados = this.clampPercent(this.resumo?.percentualSemDados);

    const p1 = consolidado;
    const p2 = p1 + critico;
    const p3 = p2 + risco;
    const p4 = Math.min(100, p3 + semDados);

    return `conic-gradient(
      #1F7A4D 0% ${p1}%,
      #C0392B ${p1}% ${p2}%,
      #E67E22 ${p2}% ${p3}%,
      #BDC3C7 ${p3}% ${p4}%,
      #edf0f3 ${p4}% 100%
    )`;
  }

  private montarGraficoTendencias(serie: RetencaoAnalyticsSerieDTO[]): void {
    if (!Array.isArray(serie) || serie.length === 0) {
      this.tendenciasChartData = null;
      return;
    }

    const labels = serie.map((ponto) => this.formatarDataCurta(ponto.data));
    const maxCriticos = Math.max(
      1,
      Number(this.analytics?.totalTopicos || 0),
      ...serie.map((ponto) => Number(ponto.criticosCount || 0))
    );

    this.tendenciasChartOptions.scales.y1.max = maxCriticos;

    this.tendenciasChartData = {
      labels,
      datasets: [
        {
          label: 'Consolidacao (%)',
          yAxisID: 'y',
          data: serie.map((ponto) => ({ x: this.formatarDataCurta(ponto.data), y: Number(ponto.consolidacaoPercent || 0), ...ponto })),
          borderColor: '#22a447',
          backgroundColor: 'rgba(34, 164, 71, 0.14)',
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.3
        },
        {
          label: 'Criticos (qtd)',
          yAxisID: 'y1',
          data: serie.map((ponto) => ({ x: this.formatarDataCurta(ponto.data), y: Number(ponto.criticosCount || 0), ...ponto })),
          borderColor: '#e53935',
          backgroundColor: 'rgba(229, 57, 53, 0.14)',
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.3
        }
      ]
    };
  }

  private formatarDataCurta(dataIso: string): string {
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) return dataIso;
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  private atualizarMetricasEstrategicas(): void {
    const serie = this.analytics?.serie || [];
    const hoje = getSnapshotHoje(serie) || normalizarSummary(this.resumo);
    const ref = getSnapshotComparacao(serie, this.janelaSelecionada);

    const indiceEstabilidade = calcularIndiceEstabilidade(this.resumo);
    const faixa = mapearFaixaEstabilidade(indiceEstabilidade.valor);
    const totalTopicos = Number(this.resumo?.totalTopicos || 0);
    const qtdCriticos = Number(this.resumo?.topicosCriticos || 0);
    const qtdEmRisco = Number(this.resumo?.topicosEmRisco || 0);
    const percentCriticos = totalTopicos > 0 ? (qtdCriticos / totalTopicos) * 100 : 0;
    const momentum = calcularMomentum(serie);

    this.estadoSistemaVM = {
      score: indiceEstabilidade.valor,
      label: faixa.label,
      faixaTexto: faixa.faixaTexto,
      explicacaoCurta: ESTADO_SISTEMA_EXPLICACAO_CURTA,
      urgencia: montarUrgenciaEstadoSistema(percentCriticos),
      proximaAcao: montarProximaAcaoEstadoSistema(qtdCriticos, qtdEmRisco),
      delta7dLabel: montarDelta7dLabel(momentum)
    };

    const velocidadeHoje = Number(this.analytics?.tempoMedioDiasAteConsolidar);
    const velocidade = insightVelocidade(
      Number.isFinite(velocidadeHoje) && velocidadeHoje > 0 ? velocidadeHoje : null,
      hoje,
      ref
    );
    this.velocidadeDiasValor = velocidade.valor;
    this.velocidadeComparativoLabel = velocidade.comparativoLabel;

    const projecao = insightProjecao(hoje, ref);
    this.projecaoDiasValor = projecao.valor;
    this.projecaoDiasSub = projecao.subtitulo;
    this.projecaoDiasExtra = projecao.sugestaoOpcional;

    const evolucao = insightEvolucao(hoje, ref);
    this.evolucaoValor = evolucao.principal;
    this.evolucaoSub = evolucao.secundario;
    this.evolucaoExtra = evolucao.extra;
  }

  executarAcaoEstadoSistema(): void {
    const acao = this.estadoSistemaVM.proximaAcao.ctaAction;
    if (acao === 'goCriticos') {
      this.selecionarAba('criticos');
      return;
    }
    if (acao === 'goRisco') {
      this.selecionarAba('geral');
      setTimeout(() => {
        const el = document.getElementById('topicos-em-risco');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    }
  }

  private aplicarMapaMateria<T extends { topicoId: number; materiaId: number | null; nomeMateria?: string | null }>(itens: T[]): T[] {
    if (!Array.isArray(itens) || !itens.length || !this.topicoMateriaMap.size) {
      return itens || [];
    }

    return itens.map((item) => {
      const topicoId = Number(item?.topicoId || 0);
      const ref = this.topicoMateriaMap.get(topicoId);
      if (!ref) return item;

      return {
        ...item,
        materiaId: ref.materiaId,
        nomeMateria: ref.materiaNome ?? item?.nomeMateria ?? null
      };
    });
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
        this.editalAtivoAtual = (editais || []).find((e) => e?.ativo) || null;
        this.rebuildTopicoMateriaMap(editais || []);
        this.topicosEmRisco = this.aplicarMapaMateria(this.topicosEmRisco || []);
        this.errosReincidentes = this.aplicarMapaMateria(this.errosReincidentes || []);
        this.topicosCriticos = this.aplicarMapaMateria(this.topicosCriticos || []).filter((item) => this.ehTopicoCriticoRelevante(item));
      },
      error: () => {
        this.editalAtivoAtual = null;
        this.topicoMateriaMap.clear();
      }
    });
  }

  private editalTemTopicos(edital: Edital | null | undefined): boolean {
    return Boolean((edital?.materias || []).some((m: any) => Array.isArray(m?.topicos) && m.topicos.length > 0));
  }

  private rebuildTopicoMateriaMap(editais: Edital[]): void {
    const mapa = new Map<number, TopicoMateriaRef>();

    for (const edital of editais || []) {
      for (const materia of (edital as any)?.materias || []) {
        const materiaId = Number((materia as any)?.materiaId ?? (materia as any)?.id);
        const materiaNome = String((materia as any)?.materiaNome ?? (materia as any)?.nome ?? '').trim() || null;
        if (!Number.isFinite(materiaId) || materiaId <= 0) continue;

        this.indexarTopicosMateria(mapa, (materia as any)?.topicos || [], {
          materiaId,
          materiaNome
        });
      }
    }

    this.topicoMateriaMap = mapa;
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

  private clampPercent(valor: number | null | undefined): number {
    const n = Number(valor ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  formatarScore(valor: number | null): string {
    if (valor == null || Number.isNaN(valor)) {
      return '-';
    }
    return valor.toFixed(2);
  }

  formatarRisk(valor: number | null): string {
    if (valor == null || Number.isNaN(valor)) {
      return '-';
    }
    const bruto = Number(valor);
    const percentual = bruto <= 1 ? bruto * 100 : bruto;
    const normalizado = Math.max(0, Math.min(100, percentual));
    if (normalizado > 0 && normalizado < 1) {
      return '<1%';
    }
    return `${Math.round(normalizado)}%`;
  }

  private ehTopicoCriticoRelevante(item: TopicoCognitivoDTO): boolean {
    const classificacao = String(item?.classificacao || '').toUpperCase();
    const risk = Number(item?.risk);
    const riskValido = Number.isFinite(risk);
    const riskPositivo = riskValido && risk > 0;
    return classificacao === 'CRITICO' && riskPositivo;
  }

  private converterTopicosRiscoParaCriticos(itens: TopicoRiscoDTO[]): TopicoCognitivoDTO[] {
    return (itens || [])
      .filter((t) => String(t?.classificacao || '').toUpperCase() === 'CRITICO')
      .map((t) => {
        const score = Number(t?.score);
        const scoreValido = Number.isFinite(score);
        const scoreNormalizado = scoreValido ? (score <= 1 ? score : score / 100) : null;
        const risk = scoreNormalizado === null ? 100 : Math.max(1, Math.min(100, Math.round((1 - scoreNormalizado) * 100)));

        return {
          topicoId: Number(t?.topicoId || 0),
          materiaId: t?.materiaId ?? null,
          nomeMateria: (t as any)?.nomeMateria ?? null,
          nomeTopico: t?.nomeTopico ?? null,
          score: scoreValido ? score : null,
          risk,
          stability: null,
          diasDesdeUltimoEvento: t?.diasDesdeUltimoEvento ?? null,
          classificacao: 'CRITICO'
        } as TopicoCognitivoDTO;
      })
      .filter((item) => this.ehTopicoCriticoRelevante(item));
  }

  formatarDataIso(dataIso: string | null | undefined): string {
    if (!dataIso) {
      return '-';
    }
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) {
      return dataIso;
    }
    return data.toLocaleString('pt-BR');
  }

  formatarAvaliacao(avaliacao: AvaliacaoRevisao): string {
    switch (avaliacao) {
      case AvaliacaoRevisao.ERREI:
        return 'Errei';
      case AvaliacaoRevisao.DIFICIL:
        return 'DifÃ­cil';
      case AvaliacaoRevisao.BOM:
        return 'Bom';
      case AvaliacaoRevisao.FACIL:
        return 'FÃ¡cil';
      default:
        return avaliacao;
    }
  }

  classeClassificacao(classificacao: ClassificacaoRetencaoTopico): string {
    switch (classificacao) {
      case ClassificacaoRetencaoTopico.CRITICO:
        return 'badge badge-critico';
      case ClassificacaoRetencaoTopico.EM_RISCO:
        return 'badge badge-risco';
      case ClassificacaoRetencaoTopico.CONSOLIDADO:
        return 'badge badge-consolidado';
      default:
        return 'badge badge-sem-dados';
    }
  }

  private tratarErroHttp(err: HttpErrorResponse, fallbackMsg: string): void {
    if (err.status === 402) {
      this.premiumBloqueado = true;
      this.messageService.add({
        severity: 'warn',
        summary: 'Plano',
        detail: 'Recurso disponÃ­vel no plano premium'
      });
      return;
    }

    if (err.status === 401) {
      this.messageService.add({
        severity: 'warn',
        summary: 'SessÃ£o',
        detail: 'Sua sessÃ£o expirou. FaÃ§a login novamente.'
      });
      this.router.navigate(['/login']);
      return;
    }

    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: fallbackMsg
    });
  }
}

