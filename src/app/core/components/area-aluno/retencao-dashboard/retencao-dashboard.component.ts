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
type NivelUsuarioClassificacao = 'CRITICO' | 'MODERADO' | 'LEVE' | 'SEM_DADOS';

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
  renderDetalhesDialog = false;
  topicoDetalheId: number | null = null;
  topicoDetalheNome = '';
  topicoDetalheMateriaNome = '';
  topicoDetalheClassificacao: string | null = null;
  topicoDetalheScore: number | null = null;
  topicoDetalheStabilityDias: number | null = null;
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

  get janelaEscopoLabel(): string {
    return `JANELA: ${this.janelaSelecionada}d`;
  }

  get heroRetencaoTitulo(): string {
    return `Saude da fila (Janela: ${this.janelaSelecionada}d): ${this.heroEstado.label}`;
  }

  get tooltipEscopoJanela(): string {
    return `Indicador calculado na janela de ${this.janelaSelecionada} dias selecionada.`;
  }

  get tooltipRiscoGeralJanela(): string {
    return `Risco medio na janela: combina topicos criticos e em risco dos ultimos ${this.janelaSelecionada} dias.`;
  }

  get heroCounts(): { criticos: number; moderados: number; leves: number; semDados: number } {
    const inicial = { criticos: 0, moderados: 0, leves: 0, semDados: 0 };
    return (this.topicosEmRisco || []).reduce((acc, topico) => {
      const nivel = this.obterNivelUsuarioTopico(topico?.classificacao, topico?.score);
      if (nivel === 'CRITICO') acc.criticos += 1;
      else if (nivel === 'MODERADO') acc.moderados += 1;
      else if (nivel === 'LEVE') acc.leves += 1;
      else acc.semDados += 1;
      return acc;
    }, inicial);
  }

  get heroEstado(): {
    label: string;
    classeCss: string;
    ctaLabel: string;
    ctaAction: 'goCriticos' | 'goRisco' | 'none';
  } {
    const counts = this.heroCounts;
    if (counts.criticos > 0) {
      return {
        label: 'Pressao acumulada',
        classeCss: 'hero-operacional--danger',
        ctaLabel: 'Resolver urgencias agora',
        ctaAction: 'goCriticos'
      };
    }
    if (counts.moderados > 0) {
      return {
        label: 'Moderado',
        classeCss: 'hero-operacional--warning',
        ctaLabel: 'Fazer revisao rapida',
        ctaAction: 'goRisco'
      };
    }
    return {
      label: 'Saudavel',
      classeCss: 'hero-operacional--success',
      ctaLabel: 'Manter ritmo',
      ctaAction: 'none'
    };
  }

  get mostrarLevesNoHero(): boolean {
    return this.heroCounts.leves > 0;
  }

  get heroDescricao(): string {
    if (this.heroEstado.classeCss === 'hero-operacional--danger') {
      return `Ha urgencias na fila observada na janela de ${this.janelaSelecionada} dias.`;
    }
    if (this.heroEstado.classeCss === 'hero-operacional--warning') {
      return `Ha topicos em alerta na janela de ${this.janelaSelecionada} dias.`;
    }
    return `Sem pressao operacional relevante na janela de ${this.janelaSelecionada} dias.`;
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
    this.renderDetalhesDialog = true;
    this.detalhesVisivel = false;
    this.topicoDetalheId = topico.topicoId;
    this.topicoDetalheNome = topico.nomeTopico || `Topico ${topico.topicoId}`;
    const topicoRisco = (this.topicosEmRisco || []).find((item) => Number(item?.topicoId) === Number(topico.topicoId)) as any;
    const topicoErro = (this.errosReincidentes || []).find((item) => Number(item?.topicoId) === Number(topico.topicoId)) as any;
    const topicoBase = topicoRisco || topicoErro || null;
    this.topicoDetalheClassificacao = topicoBase?.classificacao || null;
    this.topicoDetalheScore = Number.isFinite(Number(topicoBase?.score)) ? Number(topicoBase?.score) : null;
    this.topicoDetalheMateriaNome = String(topicoBase?.nomeMateria || '').trim();
    const stabilityRaw = Number(topicoBase?.stabilityDias ?? topicoBase?.stability ?? null);
    this.topicoDetalheStabilityDias = Number.isFinite(stabilityRaw) && stabilityRaw > 0 ? stabilityRaw : null;
    this.carregandoDetalhes = true;
    this.serieDetalhe = [];
    this.historicoDetalhe = [];
    setTimeout(() => {
      this.detalhesVisivel = true;
    }, 0);

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

  onDetalhesHide(): void {
    this.detalhesVisivel = false;
    this.renderDetalhesDialog = false;
    this.limparBackdropDialog();
  }

  onDetalhesVisibleChange(visible: boolean): void {
    this.detalhesVisivel = visible;
    if (!visible) {
      this.renderDetalhesDialog = false;
      this.limparBackdropDialog();
    }
  }

  formatarPercentual(valor: number | null | undefined): string {
    const numero = Number(valor ?? 0);
    return `${numero.toFixed(1)}%`;
  }

  formatarTaxaErro(valor: number | null | undefined): string {
    const raw = Number(valor);
    if (!Number.isFinite(raw) || raw < 0) return '-';

    const percentual = raw <= 1 ? raw * 100 : raw;
    const normalizado = Math.max(0, Math.min(100, percentual));
    const casas = normalizado >= 10 ? 0 : 1;
    return `${normalizado.toFixed(casas)}%`;
  }

  mapClassificacaoParaNivelUsuario(classificacao: string): NivelUsuarioClassificacao {
    const normalizado = String(classificacao || '').toUpperCase().trim();
    if (normalizado === 'CRITICO') return 'CRITICO';
    if (normalizado === 'EM_RISCO') return 'MODERADO';
    if (normalizado === 'CONSOLIDADO') return 'LEVE';
    return 'SEM_DADOS';
  }

  get statusLabel(): string {
    const score = this.scoreDetalheAtual;
    if (!Number.isFinite(Number(score))) return 'SEM DADOS';
    if (Number(score) >= 0.75) return 'CONSOLIDADO';
    if (Number(score) >= 0.45) return 'EM ALERTA';
    return 'CRITICO';
  }

  get statusClass(): string {
    const score = this.scoreDetalheAtual;
    if (!Number.isFinite(Number(score))) return 'status-pill status-pill--neutral';
    if (Number(score) >= 0.75) return 'status-pill status-pill--ok';
    if (Number(score) >= 0.45) return 'status-pill status-pill--warn';
    return 'status-pill status-pill--bad';
  }

  get statusDescription(): string {
    if (this.statusLabel === 'CONSOLIDADO') return 'Baixo risco de esquecimento no curto prazo.';
    if (this.statusLabel === 'EM ALERTA') return 'Precisa reforco para nao virar critico.';
    if (this.statusLabel === 'CRITICO') return 'Risco alto de esquecimento no curto prazo.';
    return 'Dados insuficientes para classificar no momento.';
  }

  get ultimaRevisaoEm(): Date | null {
    const datas = (this.historicoDetalhe || [])
      .map((h) => new Date(String(h?.respondidoEm || '')))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!datas.length) return null;
    return datas.sort((a, b) => b.getTime() - a.getTime())[0];
  }

  get ultimaRevisaoLabel(): string {
    const ultima = this.ultimaRevisaoEm;
    if (!ultima) return 'Data nao disponivel';
    const dias = this.diasEntre(ultima, new Date());
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ha 1 dia';
    return `ha ${dias} dias`;
  }

  get acaoAgoraLabel(): string {
    const score = this.scoreDetalheAtual;
    if (!Number.isFinite(Number(score))) return 'Faca 2 revisoes para gerar dados.';
    if (Number(score) < 0.45) return 'Revisar hoje + amanha (reforco).';
    if (Number(score) < 0.75) return 'Revisar nos proximos 2 dias.';
    return 'Manter cadencia. Siga a proxima revisao programada.';
  }

  buildMotivos(): string[] {
    const motivos: string[] = [];
    const score = this.scoreDetalheAtual;
    const erros = this.totalErrosDetalheJanela;
    const eventos = this.totalEventosDetalheJanela;
    const ultima = this.ultimaRevisaoEm;

    if (ultima) {
      const diasSemRevisar = this.diasEntre(ultima, new Date());
      if (diasSemRevisar >= 14) motivos.push(`Voce esta ha ${diasSemRevisar} dias sem revisar.`);
      else if (diasSemRevisar >= 7) motivos.push(`Ja faz ${diasSemRevisar} dias desde a ultima revisao.`);
      else motivos.push(`Revisao recente (${diasSemRevisar} ${diasSemRevisar === 1 ? 'dia' : 'dias'} atras).`);
    } else {
      motivos.push('Data da ultima revisao nao disponivel.');
    }

    if (erros >= 3) {
      motivos.push(`Houve ${erros} erros recentes - isso reduz estabilidade.`);
    } else if (erros >= 1) {
      motivos.push(`Ocorreram ${erros} erros recentes - vale reforcar.`);
    } else if (erros === 0 && Number.isFinite(Number(score)) && Number(score) < 0.45) {
      motivos.push('Mesmo sem erros, o tempo sem pratica elevou o risco.');
    }

    if (eventos < 3) {
      motivos.push(`Poucas revisoes recentes (${eventos} eventos) - confianca do modelo menor.`);
    }

    return motivos.slice(0, 3);
  }

  get motivosDetalhe(): string[] {
    return this.buildMotivos();
  }

  calcProjecao(): { naoRevisarLabel: string; revisarHojeLabel: string; obs?: string } {
    const score = this.scoreDetalheAtual;
    const ultima = this.ultimaRevisaoEm;
    const t = ultima ? this.diasEntre(ultima, new Date()) : null;
    if (t === null || !Number.isFinite(t)) {
      return {
        naoRevisarLabel: 'Projecao indisponivel (pouca evidencia).',
        revisarHojeLabel: 'Projecao indisponivel (pouca evidencia).'
      };
    }

    let s = Number(this.topicoDetalheStabilityDias);
    if (!Number.isFinite(s) || s <= 0) {
      if (!Number.isFinite(Number(score))) {
        return {
          naoRevisarLabel: 'Projecao indisponivel (pouca evidencia).',
          revisarHojeLabel: 'Projecao indisponivel (pouca evidencia).'
        };
      }
      if (Number(score) >= 0.75) s = 14;
      else if (Number(score) >= 0.45) s = 7;
      else s = 3;
    }

    const riskIn3 = 1 - Math.exp(-(t + 3) / s);
    const riskAfterReview = 1 - Math.exp(-(1 / (s * 1.2)));

    return {
      naoRevisarLabel: `Em 3 dias, risco sobe para ${this.formatPercent(riskIn3)}.`,
      revisarHojeLabel: `Risco cai para ~${this.formatPercent(riskAfterReview)} e sua proxima revisao tende a espacar mais.`
    };
  }

  get projecaoDetalhe(): { naoRevisarLabel: string; revisarHojeLabel: string; obs?: string } {
    return this.calcProjecao();
  }

  get detalheClassificacaoNivel(): NivelUsuarioClassificacao {
    return this.obterNivelUsuarioTopico(this.topicoDetalheClassificacao, this.scoreDetalheAtual);
  }

  get detalheClassificacaoLabel(): string {
    const nivel = this.detalheClassificacaoNivel;
    if (nivel === 'CRITICO') return 'CRITICO';
    if (nivel === 'MODERADO') return 'MODERADO';
    if (nivel === 'LEVE') return 'LEVE';
    return 'SEM DADOS';
  }

  get detalheClassificacaoClasse(): string {
    const nivel = this.detalheClassificacaoNivel;
    if (nivel === 'CRITICO') return 'badge badge-critico';
    if (nivel === 'MODERADO') return 'badge badge-risco';
    if (nivel === 'LEVE') return 'badge badge-consolidado';
    return 'badge badge-sem-dados';
  }

  get detalheClassificacaoSignificado(): string {
    const nivel = this.detalheClassificacaoNivel;
    if (nivel === 'CRITICO') return 'Risco alto de esquecimento no curto prazo.';
    if (nivel === 'MODERADO') return 'Em alerta: precisa revisar para nao virar critico.';
    if (nivel === 'LEVE') return 'Memoria consolidada para este topico.';
    return 'Ainda sem dados suficientes para classificar.';
  }

  get scoreDetalheAtual(): number | null {
    if (Number.isFinite(Number(this.topicoDetalheScore))) {
      return Number(this.topicoDetalheScore);
    }
    const serieValida = (this.serieDetalhe || []).filter((p) => Number.isFinite(Number(p?.scoreDia)));
    if (!serieValida.length) return null;
    const maisRecente = [...serieValida].sort((a, b) => {
      const ta = new Date(String(a?.data || '')).getTime();
      const tb = new Date(String(b?.data || '')).getTime();
      return tb - ta;
    })[0];
    const score = Number(maisRecente?.scoreDia);
    return Number.isFinite(score) ? score : null;
  }

  get scoreDetalheFaixaLabel(): string {
    const score = this.scoreDetalheAtual;
    if (score == null) return 'Sem score no momento.';
    if (score < 0.45) return `${score.toFixed(2)} = critico (< 0.45)`;
    if (score < 0.75) return `${score.toFixed(2)} = moderado (0.45 a 0.75)`;
    return `${score.toFixed(2)} = leve (>= 0.75)`;
  }

  get totalEventosDetalheJanela(): number {
    return (this.serieDetalhe || []).reduce((acc, p) => acc + Math.max(0, Number(p?.eventosNoDia || 0)), 0);
  }

  get totalErrosDetalheJanela(): number {
    return (this.serieDetalhe || []).reduce((acc, p) => acc + Math.max(0, Number(p?.errosNoDia || 0)), 0);
  }

  get detalheAcaoAgora(): string {
    return this.acaoAgoraLabel;
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

  private limparBackdropDialog(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const limpar = () => {
      document.querySelectorAll<HTMLElement>('.retencao-detalhes-mask').forEach((mask) => {
        mask.classList.add('retencao-mask-force-hide');
        mask.style.pointerEvents = 'none';
        mask.style.opacity = '0';
        window.setTimeout(() => mask.remove(), 40);
      });
      document.querySelectorAll<HTMLElement>('.p-dialog-mask, .p-component-overlay').forEach((mask) => {
        const el = mask as HTMLElement;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || Number(style.opacity || 1) < 0.2) {
          el.style.pointerEvents = 'none';
          window.setTimeout(() => el.remove(), 40);
        }
      });

      document.body.classList.remove('p-overflow-hidden');
      document.documentElement.classList.remove('p-overflow-hidden');
    };

    window.setTimeout(limpar, 120);
    window.setTimeout(limpar, 260);
  }

  private clamp(valor: number, min: number, max: number): number {
    if (!Number.isFinite(valor)) return min;
    return Math.max(min, Math.min(max, valor));
  }

  private formatPercent(fraction: number): string {
    const pct = this.clamp(fraction * 100, 0, 100);
    const casas = pct >= 10 ? 0 : 1;
    return `${pct.toFixed(casas)}%`;
  }

  private diasEntre(dateA: Date, dateB: Date): number {
    const inicio = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime();
    const fim = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime();
    return Math.max(0, Math.floor((fim - inicio) / 86400000));
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

  executarHeroAcao(): void {
    const acao = this.heroEstado.ctaAction;
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

  private obterNivelUsuarioTopico(classificacao: string | null | undefined, score: number | null | undefined): NivelUsuarioClassificacao {
    const viaClassificacao = this.mapClassificacaoParaNivelUsuario(String(classificacao || ''));
    if (viaClassificacao !== 'SEM_DADOS') return viaClassificacao;
    return this.mapScoreParaNivelUsuario(score);
  }

  private mapScoreParaNivelUsuario(score: number | null | undefined): NivelUsuarioClassificacao {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'SEM_DADOS';
    if (n < 0.45) return 'CRITICO';
    if (n < 0.75) return 'MODERADO';
    return 'LEVE';
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

