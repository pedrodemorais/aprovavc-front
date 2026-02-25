import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, filter, map, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RetencaoCognitivaResumoDTO, TopicoCognitivoDTO } from 'src/app/core/models/cognitive-metrics.models';
import { DashboardStreakResumoDTO, HojeFilaResponseDTO, PrioridadeFilaHoje } from 'src/app/core/models/hoje-fila.models';
import { RetencaoAnalyticsResponseDTO, RetencaoAnalyticsSerieDTO } from 'src/app/core/models/retencao-analytics.models';
import { CognitiveMetricsService } from 'src/app/core/services/cognitive-metrics.service';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';
import { RefreshBusService } from 'src/app/core/services/refresh-bus.service';
import { EditalService } from 'src/app/core/components/area-aluno/services/edital.service';
import { RevisaoDashboardItem } from 'src/app/core/components/area-aluno/models/RevisaoDashboardItem';
import {
  RevisaoDashboardResponseDTO,
  SalaEstudoService
} from 'src/app/core/components/area-aluno/services/sala-estudo.service';

export interface HojeResumoDTO {
  filaHojeTotal: number;
  filaHojeCriticos: number;
  filaHojeModerados: number;
  filaHojeBaixo: number;
  atrasadas: number;
  venceHoje: number;
  emDia: number;
  risco24h: number;
  risco48h: number;
  risco7d: number;
  estabilidadeMedia: number | null;
  coberturaBasePercent: number;
  retencaoMedia7d: number;
  retencaoMedia14d: number;
  evolucao7dPp: number;
  evolucao7dTopicos: number;
  evolucao7dCriticos: number;
  projecaoDiasRitmoAtual: number;
  projecaoDiasMais3PorDia?: number | null;
  projecaoDiasSoAtraso?: number | null;
  streakAtual: number;
  streakRecorde: number;
  streakMediaQuebra?: number | null;
  temDados: boolean;
}

type EstadoCognitivoDia = 'estavel' | 'sob_pressao' | 'alta_pressao';
interface UrgenciaFocoItem {
  topicoId: number;
  materiaId: number | null;
  nome: string;
  nivel: string;
  scoreLabel: string;
  riscoValor: number;
  riscoLabel: string;
  proximaRevisaoLabel: string;
}

@Component({
  selector: 'app-foco',
  templateUrl: './foco.component.view.html',
  styleUrls: ['./foco.component.scss']
})
export class FocoComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly estabilidadeSnapshotKey = 'foco:estabilidade-global-snapshot:v1';
  private materiasEditalAtivo = new Set<number>();
  private topicosCognitivosAtivos: TopicoCognitivoDTO[] = [];
  private estabilidadeGlobalOntem: number | null = null;
  loading = true;
  cardsRefreshing = false;
  erro = false;
  iniciandoRevisao = false;
  resumo: HojeResumoDTO | null = null;
  atualizadoAgora: string | null = null;

  constructor(
    private hojeFilaService: HojeFilaService,
    private salaEstudoService: SalaEstudoService,
    private cognitiveMetricsService: CognitiveMetricsService,
    private retencaoAnalyticsService: RetencaoAnalyticsService,
    private refreshBusService: RefreshBusService,
    private editalService: EditalService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.registrarRefreshHandlers();
    this.carregarResumo('init');
  }

  get hasRevisao(): boolean {
    return Number(this.resumo?.filaHojeTotal || 0) > 0;
  }

  get podeMostrarProjecaoAvancada(): boolean {
    return !!this.resumo?.temDados;
  }

  get tituloHero(): string {
    if (!this.resumo) return '';
    if (this.hasRevisao) {
      return `${this.resumo.filaHojeTotal} topicos exigem atencao hoje.`;
    }
    return 'Hoje sua memoria esta protegida.';
  }

  get subtituloHero(): string {
    if (!this.resumo) return '';
    if (this.hasRevisao) {
      return 'Se ignorados, sua retencao pode cair nas proximas 48h. Vamos proteger sua memoria.';
    }
    if (Number(this.resumo.risco24h || 0) > 0) {
      return `${this.resumo.risco24h} topicos estao em risco nas proximas 24h, mesmo sem pendencias imediatas na fila de hoje.`;
    }
    return 'Nenhum topico critico nas proximas 24h. Volte amanha para manter o ritmo.';
  }

  get focoStatusEscopoLabel(): string {
    return 'STATUS: HOJE';
  }

  get focoProjecaoEscopoLabel(): string {
    return 'PROJECAO: CURTO PRAZO';
  }

  get tooltipClassificacaoFilaHoje(): string {
    return 'Critico: score < 0.45 | Moderado: 0.45 a 0.75 | Leve: >= 0.75 (fila de hoje).';
  }

  get tooltipProjecaoCurtoPrazo(): string {
    return 'Baseado no risco estimado se nao houver revisao ate o prazo.';
  }

  get detalheSeveridade(): string {
    if (!this.resumo || !this.hasRevisao) return '';
    return `${this.resumo.filaHojeCriticos} criticos | ${this.resumo.filaHojeModerados} moderados | ${this.resumo.filaHojeBaixo} leves`;
  }

  get copyStreak(): string {
    if (!this.resumo) return '';
    if (this.resumo.streakAtual === 0 && this.resumo.filaHojeTotal === 0) {
      return 'Hoje ainda nao iniciado';
    }
    return `Sequencia ativa: ${this.resumo.streakAtual} dias`;
  }

  get copyOscilacao(): string | null {
    if (!this.resumo) return null;
    return this.resumo.evolucao7dPp < 0 ? 'Oscilacao normal - vamos estabilizar com constancia.' : null;
  }

  get resistenciaGlobalPercent(): number {
    return Number(this.resumo?.estabilidadeMedia || 0);
  }

  get baseGeralPercent(): number | null {
    if (this.resumo?.estabilidadeMedia === null || this.resumo?.estabilidadeMedia === undefined) {
      return null;
    }
    const n = Number(this.resumo.estabilidadeMedia);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  }

  get baseGeralLabel(): string {
    const v = this.baseGeralPercent;
    return v === null ? 'Sem base ainda' : `${v}%`;
  }

  get baseGeralProgressValue(): number {
    const v = this.baseGeralPercent;
    return v === null ? 0 : v;
  }

  get baseGeralSemBase(): boolean {
    return this.baseGeralPercent === null;
  }

  get resistenciaRevisadosHojePercent(): number | null {
    const revisadosHoje = this.topicosCognitivosAtivos.filter((item) => this.foiRevisadoHoje(item));
    return this.calcularMediaEstabilidade(revisadosHoje);
  }

  get resistenciaRevisadosHojeLabel(): string {
    const valor = this.resistenciaRevisadosHojePercent;
    return valor === null ? 'Nenhuma revisao registrada hoje.' : `${valor}%`;
  }

  get resistenciaRevisadosHojeValorBarra(): number {
    const valor = this.resistenciaRevisadosHojePercent;
    if (valor === null) return 0;
    return Math.max(0, Math.min(100, Math.round(valor)));
  }

  get qtdRevisadosHoje(): number {
    let qtd = 0;
    this.topicosCognitivosAtivos.forEach((item) => {
      if (this.foiRevisadoHoje(item)) qtd += 1;
    });
    return qtd;
  }

  get teveRevisoesHoje(): boolean {
    return this.qtdRevisadosHoje > 0;
  }

  get variacaoResistenciaGlobalOntem(): number | null {
    if (this.estabilidadeGlobalOntem === null) return null;
    return Number((this.resistenciaGlobalPercent - this.estabilidadeGlobalOntem).toFixed(1));
  }

  get variacaoResistenciaGlobalLabel(): string {
    const delta = this.variacaoResistenciaGlobalOntem;
    if (delta === null) return 'Sem base de ontem';
    if (delta > 0) return `+${delta}%`;
    if (delta < 0) return `${delta}%`;
    return '0.0%';
  }

  get mensagemContextualEstabilidade(): string | null {
    const delta = this.variacaoResistenciaGlobalOntem;
    if (delta !== null && delta < 0 && this.teveRevisoesHoje) {
      return 'Mesmo revisando hoje, alguns topicos nao revisados degradaram ao longo do tempo.';
    }

    const revisadosHoje = this.resistenciaRevisadosHojePercent;
    if (revisadosHoje !== null && revisadosHoje >= this.resistenciaGlobalPercent) {
      return 'Boa evolucao nos topicos trabalhados hoje.';
    }

    return null;
  }

  get comparativoBaseGeralLabel(): string {
    if (this.estabilidadeGlobalOntem === null) {
      return 'Ainda sem comparacao com ontem.';
    }

    const ontem = Math.round(this.estabilidadeGlobalOntem);
    const delta = this.variacaoResistenciaGlobalOntem ?? 0;
    if (delta > 0) {
      return `Ontem: ${ontem}% (+${Math.round(delta)})`;
    }
    if (delta < 0) {
      return `Ontem: ${ontem}% (${Math.round(delta)})`;
    }
    return `Ontem: ${ontem}% (0)`;
  }

  get microcopySaudeMemoriaLinhas(): { linha1: string; linha2: string } {
    return this.getMicrocopyLinhas();
  }

  get risco24hLabel(): string {
    return this.formatarValorRisco(this.resumo?.risco24h);
  }

  get risco48hLabel(): string {
    return this.formatarValorRisco(this.resumo?.risco48h);
  }

  get risco7dLabel(): string {
    return this.formatarValorRisco(this.resumo?.risco7d);
  }

  formatNumeroTopicos(n: number): string {
    const valor = Math.max(0, Math.round(Number(n) || 0));
    if (valor === 0) return '0 topicos';
    return valor === 1 ? '1 topico' : `${valor} topicos`;
  }

  getLabelBaseGeral(coberturaPercent: number): string {
    const p = Math.max(0, Math.min(100, Math.round(Number(coberturaPercent) || 0)));
    if (p < 30) return 'Em construcao';
    if (p < 70) return 'Em progresso';
    return 'Consistente';
  }

  get baseGeralStatusLabel(): string {
    return this.getLabelBaseGeral(this.resumo?.coberturaBasePercent || 0);
  }

  getStatusSaudeMemoria(): 'urgente' | 'atencao' | 'ok' {
    const criticosFila = Math.max(
      0,
      Math.round(Number(this.resumo?.filaHojeCriticos || 0))
    );

    const risco48h = Math.max(
      0,
      Math.round(Number(this.resumo?.risco48h || 0))
    );

    if (criticosFila > 0) {
      return 'urgente';
    }

    if (risco48h > 0) {
      return 'atencao';
    }

    return 'ok';
  }

  getStatusSaudeMemoriaLabel(): string {
    const s = this.getStatusSaudeMemoria();
    if (s === 'urgente') return 'Status: urgente';
    if (s === 'atencao') return 'Status: atencao';
    return 'Status: ok';
  }

  getDeltaBase(): number {
    const atual = Math.max(0, Math.round(Number(this.resistenciaGlobalPercent || 0)));
    const ontemResumo = Number((this.resumo as any)?.resistenciaGlobalOntemPercent);
    const ontemFonte = Number.isFinite(ontemResumo) ? ontemResumo : this.estabilidadeGlobalOntem;
    const ontem = Math.max(0, Math.round(Number(ontemFonte || 0)));
    return atual - ontem;
  }

  getEstadoCognitivoDoDia(): EstadoCognitivoDia {
    const criticos = Number(this.resumo?.filaHojeCriticos || 0);
    const moderados = Number(this.resumo?.filaHojeModerados || 0);

    if (criticos > 0 || moderados >= 15) return 'alta_pressao';
    if (criticos === 0 && moderados >= 5) return 'sob_pressao';
    if (criticos === 0 && moderados < 5) return 'estavel';
    return 'estavel';
  }

  getEstadoCognitivoDescricao(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'Ha urgencias agora. Resolver hoje evita atrasos e esquecimento.';
    if (s === 'sob_pressao') return 'Alguns topicos entram em alerta nas proximas 48h. Uma revisao curta resolve.';
    return 'Sua memoria esta protegida hoje. Continue consistente.';
  }

  getHeroTitulo(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'SOB PRESSAO';
    if (s === 'sob_pressao') return 'EM ALERTA';
    return 'ESTAVEL';
  }

  getHeroDescricao(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'Ha urgencias agora. Resolver hoje evita atrasos e esquecimento.';
    if (s === 'sob_pressao') return 'Alguns topicos entram em alerta nas proximas 48h. Uma revisao curta resolve.';
    return 'Sua memoria esta protegida hoje. Continue consistente.';
  }

  get focoPonteEscopoLabel(): string {
    return 'Este status considera apenas a fila de hoje. A visao de 30 dias pode indicar pressao acumulada.';
  }

  get statusLabel(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'SOB PRESSAO';
    if (s === 'sob_pressao') return 'EM ALERTA';
    return 'ESTAVEL';
  }

  get statusClass(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'status-badge status-badge--danger';
    if (s === 'sob_pressao') return 'status-badge status-badge--warn';
    return 'status-badge status-badge--ok';
  }

  get situacaoResumoCurto(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'Pressao acumulada exige acao.';
    if (s === 'sob_pressao') return 'Risco concentrado no curto prazo.';
    return 'Sem escalada imediata.';
  }

  get heroUrgenciaTitulo(): string {
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    if (risco48h > 0) return `${risco48h} TOPICOS EM RISCO (48H)`;
    return 'SEM RISCO NAS PROXIMAS 48H';
  }

  get heroUrgenciaSubtitulo(): string {
    const risco24h = Math.max(0, Math.round(Number(this.resumo?.risco24h || 0)));
    if (risco24h > 0) return `${risco24h} topicos comecam a enfraquecer sem revisao.`;
    return 'Sem escalacao imediata.';
  }

  getHeroBotaoLabel(): string {
    const risco48h = Number(this.resumo?.risco48h || 0);
    const risco24h = Number(this.resumo?.risco24h || 0);
    if (risco48h > 0) return 'EXECUTAR REVISAO CRITICA';
    if (risco24h > 0) return 'REFORCAR 24H';
    return 'MANTER RITMO';
  }

  getHeroBotaoClasse(): string {
    if (Number(this.resumo?.risco48h || 0) > 0) return 'hero-btn--danger';
    if (Number(this.resumo?.risco24h || 0) > 0) return 'hero-btn--warning';
    return 'hero-btn--success';
  }

  getHeroClasse(): string {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'alta_pressao') return 'hero--danger';
    if (s === 'sob_pressao') return 'hero--warning';
    return 'hero--success';
  }

  executarHeroAcao(): void {
    const s = this.getEstadoCognitivoDoDia();
    if (s === 'estavel' && !this.hasRevisao) {
      this.irParaEstudar();
      return;
    }
    this.iniciarRevisao();
  }

  getMicrocopyLinhas(): { linha1: string; linha2: string } {
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    const risco7d = Math.max(0, Math.round(Number(this.resumo?.risco7d || 0)));
    const criticosFila = Math.max(0, Math.round(Number(this.resumo?.filaHojeCriticos || 0)));
    const base = Math.max(0, Math.min(100, Math.round(Number(this.resistenciaGlobalPercent || 0))));
    const teveHoje = this.teveRevisoesHoje;
    const mediaHoje = Math.max(0, Math.min(100, Math.round(Number(this.resistenciaRevisadosHojePercent || 0))));

    let linha1 = 'Voce esta em dia. Mantenha o ritmo.';
    if (criticosFila > 0) linha1 = 'Priorize os criticos hoje para evitar esquecimento.';
    else if (risco48h > 0) linha1 = 'Priorize os topicos em alerta (48h) para evitar que virem criticos.';
    else if (risco7d > 0) linha1 = 'Faca revisoes curtas hoje para nao acumular na semana.';

    let linha2 = 'Sua base esta fortalecendo. Continue consistente.';
    if (base < 40) linha2 = 'Sua base geral ainda esta em construcao - isso e normal no comeco.';
    else if (base >= 70) linha2 = 'Sua base esta firme. O desafio e manter constancia.';

    if (teveHoje && mediaHoje >= 70 && base < 70) {
      linha2 = linha2 + ' Boa qualidade hoje.';
    }

    return { linha1, linha2 };
  }

  get planoHojePassos(): Array<{ titulo: string; descricao: string; concluido: boolean }> {
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    const risco24h = Math.max(0, Math.round(Number(this.resumo?.risco24h || 0)));
    const filaHoje = Math.max(0, Math.round(Number(this.resumo?.filaHojeTotal || 0)));

    return [
      {
        titulo: `01 - Resolver 48h (${this.formatNumeroTopicos(risco48h)})`,
        descricao: risco48h > 0 ? 'Prioridade operacional imediata.' : 'Nenhuma urgencia 48h.',
        concluido: risco48h === 0
      },
      {
        titulo: `02 - Reforcar 24h (${this.formatNumeroTopicos(risco24h)})`,
        descricao: risco24h > 0 ? 'Evita migracao para criticidade.' : 'Sem reforco obrigatorio.',
        concluido: risco24h === 0
      },
      {
        titulo: '03 - Estudo novo',
        descricao: filaHoje > 0 ? 'Executar apos a fila prioritaria.' : 'Janela livre para avancar conteudo.',
        concluido: false
      }
    ];
  }

  get topUrgenciasHoje(): UrgenciaFocoItem[] {
    const prioridade = (c: string): number => {
      const n = String(c || '').toUpperCase();
      if (n === 'CRITICO') return 0;
      if (n === 'EM_RISCO') return 1;
      return 2;
    };

    return (this.topicosCognitivosAtivos || [])
      .filter((t) => Number(t?.topicoId || 0) > 0)
      .map((t) => {
        const classificacao = String(t?.classificacao || '').toUpperCase();
        const risco = Number(this.normalizarRiskPercent(t?.risk) ?? 0);
        const score = this.normalizarPercent(t?.score);
        return {
          topicoId: Number(t?.topicoId || 0),
          materiaId: Number(t?.materiaId || 0) || null,
          nome: String(t?.nomeTopico || `Topico ${t?.topicoId || ''}`),
          nivel: classificacao === 'CRITICO' ? 'CRITICO' : (classificacao === 'EM_RISCO' ? 'ALERTA' : 'OK'),
          scoreLabel: score === null ? '--' : `${Math.round(score)}%`,
          riscoValor: risco,
          riscoLabel: this.formatarValorRisco(risco),
          proximaRevisaoLabel: this.formatarProximaRevisaoOperacional(t, classificacao)
        } as UrgenciaFocoItem;
      })
      .sort((a, b) => {
        const ac = this.topicosCognitivosAtivos.find((t) => Number(t?.topicoId) === a.topicoId)?.classificacao || '';
        const bc = this.topicosCognitivosAtivos.find((t) => Number(t?.topicoId) === b.topicoId)?.classificacao || '';
        const porClasse = prioridade(ac) - prioridade(bc);
        if (porClasse !== 0) return porClasse;
        return b.riscoValor - a.riscoValor;
      })
      .slice(0, 5);
  }

  get tendenciaEstruturalLabel(): string {
    const delta = this.variacaoResistenciaGlobalOntem;
    if (delta === null) return 'Sem base';
    if (delta > 0) return 'Em melhora';
    if (delta < 0) return 'Em queda';
    return 'Estavel';
  }

  get tendenciaEstruturalClass(): string {
    const delta = this.variacaoResistenciaGlobalOntem;
    if (delta === null) return 'trend trend--neutral';
    if (delta > 0) return 'trend trend--up';
    if (delta < 0) return 'trend trend--down';
    return 'trend trend--neutral';
  }

  get ctaPrincipalLabel(): string {
    return this.getHeroBotaoLabel();
  }

  get diagnosticoImpactoLinhas(): string[] {
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    const risco24h = Math.max(0, Math.round(Number(this.resumo?.risco24h || 0)));
    if (risco48h > 0) {
      return [
        `${this.formatNumeroTopicos(risco48h)} entram em zona critica nas proximas 48h.`,
        'Risco medio tende a subir.'
      ];
    }
    if (risco24h > 0) {
      return [`${this.formatNumeroTopicos(risco24h)} comecam a enfraquecer em 24h.`];
    }
    return ['Sem impacto relevante nas proximas 48h.'];
  }

  get acaoRecomendadaLabel(): string {
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    const risco24h = Math.max(0, Math.round(Number(this.resumo?.risco24h || 0)));
    if (risco48h > 0) return 'Priorizar revisao critica antes de iniciar conteudo novo.';
    if (risco24h > 0) return 'Reforcar topicos de 24h para manter estabilidade.';
    return 'Manter ritmo e avancar em estudo novo.';
  }

  get mapaRiscoInterpretacao(): string {
    const risco24h = Math.max(0, Math.round(Number(this.resumo?.risco24h || 0)));
    const risco48h = Math.max(0, Math.round(Number(this.resumo?.risco48h || 0)));
    const risco7d = Math.max(0, Math.round(Number(this.resumo?.risco7d || 0)));
    if (risco48h > risco24h && risco48h > 0) return 'Concentracao de risco no horizonte de 48h.';
    if (risco7d >= 10) return 'Acumulo estrutural no medio prazo.';
    return 'Distribuicao de risco sob controle.';
  }

  get tendenciaConsolidadosLabel(): string {
    const delta = Number(this.resumo?.evolucao7dTopicos || 0);
    const sinal = delta >= 0 ? '+' : '';
    return `${sinal}${delta} topicos consolidados`;
  }

  get tendenciaCriticosLabel(): string {
    const delta = Number(this.resumo?.evolucao7dCriticos || 0);
    const sinal = delta >= 0 ? '+' : '';
    return `${sinal}${delta} criticos`;
  }

  get tendenciaTempoConsolidacaoLabel(): string {
    const dias = Math.max(0, Math.round(Number(this.resumo?.projecaoDiasRitmoAtual || 0)));
    return dias > 0 ? `${dias} dias` : '--';
  }

  get tendenciaOperacionalInterpretacao(): string {
    const consolidados = Number(this.resumo?.evolucao7dTopicos || 0);
    const criticos = Number(this.resumo?.evolucao7dCriticos || 0);
    if (consolidados > Math.max(0, criticos)) return 'Base estrutural em expansao.';
    if (criticos > 0) return 'Pressao crescente na fila.';
    return 'Estabilidade mantida.';
  }

  executarCtaPrincipal(): void {
    this.executarHeroAcao();
  }

  verFilaCompleta(): void {
    this.abrirRevisoes();
  }

  getFilaItemClass(item: UrgenciaFocoItem): string {
    if (item.nivel === 'CRITICO') return 'fila-item fila-item--critico';
    if (item.nivel === 'ALERTA') return 'fila-item fila-item--alerta';
    return 'fila-item fila-item--ok';
  }

  iniciarRevisao(): void {
    this.comecarRevisaoPrioritaria();
  }

  irParaEstudar(): void {
    this.router.navigateByUrl('/area-restrita/estudar-materias');
  }

  revisarUrgenciaAgora(item: UrgenciaFocoItem): void {
    const materiaId = Number(item?.materiaId || 0);
    const topicoId = Number(item?.topicoId || 0);
    if (!materiaId || !topicoId) {
      this.comecarRevisaoPrioritaria();
      return;
    }
    this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
      queryParams: { topicoId, modo: 'revisar' }
    });
  }

  verDetalhesUrgencia(item: UrgenciaFocoItem): void {
    this.router.navigate(['/area-restrita/retencao'], {
      queryParams: { view: 'criticos', topicoId: item.topicoId }
    });
  }

  verListaUrgencias(): void {
    this.router.navigate(['/area-restrita/retencao'], {
      queryParams: { view: 'criticos' }
    });
  }

  abrirRetencao(): void {
    this.router.navigate(['/area-restrita/retencao'], {
      queryParams: { janela: 30 }
    });
  }

  abrirRevisoes(): void {
    this.router.navigate(['/area-restrita/revisoes'], {
      queryParams: { filtro: 'hoje' }
    });
  }

  tentarNovamente(): void {
    this.carregarResumo('manual');
  }

  private registrarRefreshHandlers(): void {
    this.refreshBusService.revisaoConcluida$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evento) => {
        console.debug('[FOCO] refresh disparado por revisao concluida', evento);
        this.carregarResumo('evento-revisao', true);
      });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        if (!this.router.url.includes('/foco')) return;
        if (this.loading && !this.resumo) return;
        console.debug('[FOCO] refresh disparado por NavigationEnd', { url: this.router.url });
        this.carregarResumo('navigation', true);
      });
  }

  private carregarResumo(origem: string, manterTela = false): void {
    const temResumoPrevio = !!this.resumo;
    this.loading = !manterTela || !temResumoPrevio;
    this.cardsRefreshing = manterTela && temResumoPrevio;
    if (!manterTela) {
      this.erro = false;
    }
    console.debug('[FOCO] buscar dados dos cards', { origem, manterTela });

    this.salaEstudoService.limparCacheRevisoesDashboard();

    this.buscarMateriasEditalAtivo().pipe(
      switchMap((editalAtivoMateriaIds) =>
        forkJoin({
          editalAtivoMateriaIds: of(editalAtivoMateriaIds),
          fila: this.hojeFilaService.getFilaHoje().pipe(
            catchError(() => of({ totalItens: 0, tempoEstimadoMinutos: 0, itens: [] } as HojeFilaResponseDTO))
          ),
          streak: this.hojeFilaService.getDashboardStreak().pipe(catchError(() => of(null))),
          revisoes: this.buscarRevisoesEditalAtivo(editalAtivoMateriaIds).pipe(catchError(() => of(null))),
          cognitivo14d: this.cognitiveMetricsService.getResumoRetencao(14).pipe(catchError(() => of(null))),
          cognitivo7d: this.cognitiveMetricsService.getResumoRetencao(7).pipe(catchError(() => of(null))),
          topicosCognitivos: this.cognitiveMetricsService.getTopicosCognitivos(14, null, 500).pipe(catchError(() => of([]))),
          analytics: this.retencaoAnalyticsService.buscarAnalyticsRetencao(30).pipe(catchError(() => of(null)))
        })
      )
    ).subscribe({
      next: (data) => {
        this.materiasEditalAtivo = data.editalAtivoMateriaIds;
        this.topicosCognitivosAtivos = this.filtrarPorMateriaAtiva(data.topicosCognitivos || [], this.materiasEditalAtivo);
        this.resumo = this.montarResumo(
          data.fila,
          data.streak,
          data.revisoes,
          data.cognitivo7d,
          data.cognitivo14d,
          data.topicosCognitivos,
          data.analytics
        );
        this.atualizarSnapshotEstabilidadeGlobal();
        this.loading = false;
        this.cardsRefreshing = false;
        this.erro = false;
        this.atualizadoAgora = this.formatarHorario(new Date());
        console.debug('[FOCO] cards atualizados', {
          filaHojeTotal: this.resumo.filaHojeTotal,
          risco24h: this.resumo.risco24h,
          atualizadoAgora: this.atualizadoAgora
        });
      },
      error: (error) => {
        console.debug('[FOCO] erro ao atualizar cards', { origem, error });
        if (!temResumoPrevio) {
          this.erro = true;
        }
        this.loading = false;
        this.cardsRefreshing = false;
      }
    });
  }

  private formatarHorario(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(data);
  }

  private formatarValorRisco(valor: number | null | undefined): string {
    const n = Number(valor);
    if (!Number.isFinite(n)) return '--';
    if (!Number.isInteger(n) && n >= 0 && n <= 100) {
      return `${Math.round(n)}%`;
    }
    return this.formatNumeroTopicos(n);
  }

  private montarResumo(
    fila: HojeFilaResponseDTO | null,
    streak: DashboardStreakResumoDTO | null,
    revisoes: RevisaoDashboardResponseDTO | null,
    cognitivo7d: RetencaoCognitivaResumoDTO | null,
    cognitivo14d: RetencaoCognitivaResumoDTO | null,
    topicosCognitivos: TopicoCognitivoDTO[],
    analytics: RetencaoAnalyticsResponseDTO | null
  ): HojeResumoDTO {
    const materiaIds = this.materiasEditalAtivo;
    const filaSafe = fila || { totalItens: 0, tempoEstimadoMinutos: 0, itens: [] };
    const itensFilaBase = Array.isArray(filaSafe.itens) ? filaSafe.itens : [];
    const itensFila = this.filtrarPorMateriaAtiva(itensFilaBase, materiaIds);
    const filaHojeTotal = itensFila.length;
    const filaHojeCriticos = itensFila.filter((item) =>
      item?.prioridade === PrioridadeFilaHoje.ATRASADA ||
      item?.prioridade === PrioridadeFilaHoje.CRITICO ||
      item?.prioridade === PrioridadeFilaHoje.ALTA
    ).length;
    const filaHojeModerados = itensFila.filter((item) =>
      item?.prioridade === PrioridadeFilaHoje.EM_RISCO ||
      item?.prioridade === PrioridadeFilaHoje.ERRO_REINCIDENTE ||
      item?.prioridade === PrioridadeFilaHoje.MEDIA
    ).length;
    const filaHojeBaixo = Math.max(0, filaHojeTotal - filaHojeCriticos - filaHojeModerados);

    const atrasadas = Number(revisoes?.resumo?.vencidas || 0);
    const venceHoje = Number(revisoes?.resumo?.hoje || 0);
    const emDia = Number(revisoes?.resumo?.emDia || 0);

    const topicosCognitivosFiltrados = this.filtrarPorMateriaAtiva(topicosCognitivos || [], materiaIds);
    const { risco24h, risco48h, risco7d, estabilidadeMedia, coberturaBasePercent } = this.calcularRiscoECognicao(topicosCognitivosFiltrados);
    const {
      evolucao7dPp,
      evolucao7dTopicos,
      evolucao7dCriticos,
      projecaoDiasRitmoAtual,
      projecaoDiasMais3PorDia
    } = this.calcularEvolucaoEProjecao(analytics);

    const retencaoMedia7d = this.toPercentValue(cognitivo7d?.retencao7d ?? cognitivo7d?.retencao14d ?? null);
    const retencaoMedia14d = this.toPercentValue(cognitivo14d?.retencao14d ?? null);

    const temDados = !!analytics?.serie?.length || topicosCognitivosFiltrados.length > 0;

    return {
      filaHojeTotal,
      filaHojeCriticos,
      filaHojeModerados,
      filaHojeBaixo,
      atrasadas,
      venceHoje,
      emDia,
      risco24h,
      risco48h,
      risco7d,
      estabilidadeMedia,
      coberturaBasePercent,
      retencaoMedia7d,
      retencaoMedia14d,
      evolucao7dPp,
      evolucao7dTopicos,
      evolucao7dCriticos,
      projecaoDiasRitmoAtual,
      projecaoDiasMais3PorDia,
      projecaoDiasSoAtraso: null,
      streakAtual: Math.max(0, Number(streak?.streakAtual || 0)),
      streakRecorde: Math.max(0, Number(streak?.melhorStreak || 0)),
      streakMediaQuebra: null,
      temDados
    };
  }

  private calcularRiscoECognicao(topicos: TopicoCognitivoDTO[]): {
    risco24h: number;
    risco48h: number;
    risco7d: number;
    estabilidadeMedia: number | null;
    coberturaBasePercent: number;
  } {
    const lista = Array.isArray(topicos) ? topicos : [];
    const riscos = lista.map((t) => this.normalizarRiskPercent(t?.risk));

    const risco24h = lista.filter((t, idx) =>
      String(t?.classificacao || '').toUpperCase() === 'CRITICO' || (riscos[idx] ?? 0) >= 80
    ).length;
    const risco48h = lista.filter((t, idx) => {
      const classificacao = String(t?.classificacao || '').toUpperCase();
      return classificacao === 'CRITICO' || classificacao === 'EM_RISCO' || (riscos[idx] ?? 0) >= 60;
    }).length;
    const risco7d = lista.filter((t, idx) => {
      const classificacao = String(t?.classificacao || '').toUpperCase();
      return classificacao === 'CRITICO' || classificacao === 'EM_RISCO' || (riscos[idx] ?? 0) >= 35;
    }).length;

    const estabilidadeMedia = this.calcularBaseGeralPercent(lista);
    const coberturaBasePercent = this.calcularCoberturaBasePercent(lista);

    return { risco24h, risco48h, risco7d, estabilidadeMedia, coberturaBasePercent };
  }

  private calcularEvolucaoEProjecao(analytics: RetencaoAnalyticsResponseDTO | null): {
    evolucao7dPp: number;
    evolucao7dTopicos: number;
    evolucao7dCriticos: number;
    projecaoDiasRitmoAtual: number;
    projecaoDiasMais3PorDia: number | null;
  } {
    const serie = analytics?.serie || [];
    const atual = serie.length ? serie[serie.length - 1] : null;
    const base = serie.length > 7 ? serie[serie.length - 8] : (serie.length > 1 ? serie[0] : null);
    const evolucao7dPp = atual && base
      ? Number((Number(atual.consolidacaoPercent || 0) - Number(base.consolidacaoPercent || 0)).toFixed(1))
      : 0;
    const evolucao7dTopicos = atual && base ? Number(atual.consolidados || 0) - Number(base.consolidados || 0) : 0;
    const evolucao7dCriticos = atual && base ? Number(atual.criticos || 0) - Number(base.criticos || 0) : 0;

    const ritmoAtual = this.calcularDiasRitmoAtual(analytics, atual, base);
    // Cenario otimizado desabilitado temporariamente ate regra de monotonicidade ser aplicada.
    // TODO: reativar apenas com guardrail: otimizado < atual < passivo.
    const projecaoDiasMais3PorDia = null;

    return {
      evolucao7dPp,
      evolucao7dTopicos,
      evolucao7dCriticos,
      projecaoDiasRitmoAtual: ritmoAtual,
      projecaoDiasMais3PorDia
    };
  }

  private formatarProximaRevisaoOperacional(item: TopicoCognitivoDTO, classificacao: string): string {
    const ultima = [item?.ultimaRevisaoEm, item?.ultimaRevisao, item?.dataUltimaRevisao, item?.dataUltimoEvento, item?.ultimoEventoEm]
      .find((v) => !!v);
    if (ultima) {
      const dias = this.calcularDiasEntre(String(ultima), new Date().toISOString());
      if (dias <= 0) return 'hoje';
      if (dias === 1) return '1 dia';
      if (dias <= 2) return `${dias} dias`;
    }

    if (classificacao === 'CRITICO') return 'imediata';
    if (classificacao === 'EM_RISCO') return 'ate 48h';
    return 'ate 7 dias';
  }

  private calcularDiasRitmoAtual(
    analytics: RetencaoAnalyticsResponseDTO | null,
    atual: RetencaoAnalyticsSerieDTO | null,
    base: RetencaoAnalyticsSerieDTO | null
  ): number {
    const backend = Number(analytics?.tempoMedioDiasAteConsolidar);
    if (Number.isFinite(backend) && backend > 0) {
      return Math.ceil(backend);
    }

    const faltam = this.calcularTopicosRestantes(analytics, atual);
    if (faltam <= 0) return 0;

    const ritmoDia = this.calcularRitmoPorDia(atual, base);
    if (ritmoDia <= 0) return Math.max(1, faltam);
    return Math.ceil(faltam / ritmoDia);
  }

  private calcularDiasComMaisTres(
    analytics: RetencaoAnalyticsResponseDTO | null,
    atual: RetencaoAnalyticsSerieDTO | null,
    base: RetencaoAnalyticsSerieDTO | null
  ): number | null {
    const faltam = this.calcularTopicosRestantes(analytics, atual);
    if (faltam <= 0) return 0;

    const ritmoDia = this.calcularRitmoPorDia(atual, base);
    if (ritmoDia <= 0) return null;

    return Math.ceil(faltam / (ritmoDia + 3));
  }

  private calcularTopicosRestantes(
    analytics: RetencaoAnalyticsResponseDTO | null,
    atual: RetencaoAnalyticsSerieDTO | null
  ): number {
    const total = Math.max(0, Number(analytics?.totalTopicos || 0));
    const consolidados = Math.max(0, Number(atual?.consolidados || 0));
    return Math.max(0, total - consolidados);
  }

  private calcularRitmoPorDia(atual: RetencaoAnalyticsSerieDTO | null, base: RetencaoAnalyticsSerieDTO | null): number {
    if (!atual || !base) return 0;
    const dias = this.calcularDiasEntre(base.data, atual.data);
    if (dias <= 0) return 0;
    const delta = Number(atual.consolidados || 0) - Number(base.consolidados || 0);
    return delta > 0 ? delta / dias : 0;
  }

  private calcularDiasEntre(inicio: string | null | undefined, fim: string | null | undefined): number {
    const start = new Date(String(inicio || '')).getTime();
    const end = new Date(String(fim || '')).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  private normalizarRiskPercent(valor: number | null | undefined): number | null {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return Math.max(0, Math.min(100, Math.round(n * 100)));
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private normalizarPercent(valor: number | null | undefined): number | null {
    const n = Number(valor);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return Math.max(0, Math.min(100, n * 100));
    return Math.max(0, Math.min(100, n));
  }

  private toPercentValue(valor: number | null | undefined): number {
    const normalizado = this.normalizarPercent(valor);
    return normalizado === null ? 0 : Number(normalizado.toFixed(1));
  }

  private calcularMediaEstabilidade(topicos: TopicoCognitivoDTO[]): number | null {
    const valores = (topicos || [])
      .map((item) => this.normalizarQualidadePercent(item))
      .filter((v): v is number => v !== null && v > 0);

    if (!valores.length) return null;
    return Math.round(valores.reduce((acc, v) => acc + v, 0) / valores.length);
  }

  private normalizarQualidadePercent(item: TopicoCognitivoDTO | null | undefined): number | null {
    if (!item) return null;

    const score = this.normalizarPercent(item?.score);
    if (score !== null) return score;

    const raw = Number(item?.stability);
    if (!Number.isFinite(raw)) return null;

    // guardrail: valores tipicos de "dias" (ex: 7, 14, 30, 90) nao sao percentuais
    if (raw > 1 && raw <= 365) return null;

    // guardrail: claramente fora de escala
    if (raw > 1000) return null;

    return this.normalizarPercent(raw);
  }

  private obterTopicosComBase(topicos: TopicoCognitivoDTO[]): TopicoCognitivoDTO[] {
    return (topicos || []).filter((t) => {
      const q = this.normalizarQualidadePercent(t);
      return q !== null && q > 0;
    });
  }

  private calcularBaseGeralPercent(topicos: TopicoCognitivoDTO[]): number | null {
    const comBase = this.obterTopicosComBase(topicos);
    const vals = comBase
      .map((t) => this.normalizarQualidadePercent(t))
      .filter((v): v is number => v !== null && v > 0);

    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  private calcularCoberturaBasePercent(topicos: TopicoCognitivoDTO[]): number {
    const total = Math.max(0, (topicos || []).length);
    if (total === 0) return 0;
    const comBase = this.obterTopicosComBase(topicos).length;
    return Math.round((comBase / total) * 100);
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

  private atualizarSnapshotEstabilidadeGlobal(): void {
    const estabilidadeAtual = this.resistenciaGlobalPercent;
    const hoje = this.obterDiaAtualIso();
    const ontem = this.obterDiaIsoOffset(-1);
    const snapshots = this.lerSnapshotsEstabilidade();
    const snapshotOntem = snapshots.find((s) => s?.dia === ontem);
    this.estabilidadeGlobalOntem = Number.isFinite(Number(snapshotOntem?.valor))
      ? Number(snapshotOntem?.valor)
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

  private obterDiaAtualIso(): string {
    return this.formatarDiaLocal(new Date());
  }

  private obterDiaIsoOffset(offsetDias: number): string {
    const data = new Date();
    data.setHours(0, 0, 0, 0);
    data.setDate(data.getDate() + offsetDias);
    return this.formatarDiaLocal(data);
  }

  private formatarDiaLocal(data: Date): string {
    const yyyy = data.getFullYear();
    const mm = String(data.getMonth() + 1).padStart(2, '0');
    const dd = String(data.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private filtrarPorMateriaAtiva<T extends { materiaId?: number | null }>(itens: T[], materiaIds: Set<number>): T[] {
    const lista = Array.isArray(itens) ? itens : [];
    if (!materiaIds.size) return lista;
    return lista.filter((item) => {
      const materiaId = Number(item?.materiaId || 0);
      return materiaId > 0 && materiaIds.has(materiaId);
    });
  }

  private buscarRevisoesEditalAtivo(materiaIds: Set<number>): Observable<RevisaoDashboardResponseDTO> {
    if (!materiaIds.size) {
      return of({
        resumo: { vencidas: 0, hoje: 0, emDia: 0, total: 0 },
        itens: []
      });
    }

    const requests = Array.from(materiaIds).map((materiaId) =>
      this.salaEstudoService.listarRevisoesDashboardUnificado({
        materiaId,
        page: 0,
        size: 5000
      }).pipe(
        catchError(() => of({
          resumo: { vencidas: 0, hoje: 0, emDia: 0, total: 0 },
          itens: []
        } as RevisaoDashboardResponseDTO))
      )
    );

    return forkJoin(requests).pipe(
      map((responses) => {
        const resumo = responses.reduce(
          (acc, resp) => {
            acc.vencidas += Number(resp?.resumo?.vencidas || 0);
            acc.hoje += Number(resp?.resumo?.hoje || 0);
            acc.emDia += Number(resp?.resumo?.emDia || 0);
            acc.total += Number(resp?.resumo?.total || 0);
            return acc;
          },
          { vencidas: 0, hoje: 0, emDia: 0, total: 0 }
        );

        return {
          resumo,
          itens: responses.flatMap((resp) => resp?.itens || [])
        } as RevisaoDashboardResponseDTO;
      })
    );
  }

  private buscarMateriasEditalAtivo() {
    return this.editalService.listarComInclude(['materias']).pipe(
      map((editais) => {
        const ids = new Set<number>();

        const editaisAtivos = (editais || []).filter((e) => e?.ativo);
        editaisAtivos.forEach((edital) => {
          const materias = Array.isArray((edital as any)?.materias) ? ((edital as any).materias as any[]) : [];
          materias.forEach((materia) => {
            if (materia?.ativo === false) return;
            const materiaId = Number(materia?.materiaId ?? materia?.id ?? 0);
            if (materiaId > 0) {
              ids.add(materiaId);
            }
          });
        });

        return ids;
      })
    );
  }

  private comecarRevisaoPrioritaria(): void {
    if (this.iniciandoRevisao || !this.hasRevisao) {
      return;
    }

    this.iniciandoRevisao = true;

    forkJoin({
      materiaIds: this.buscarMateriasEditalAtivo().pipe(catchError(() => of(new Set<number>()))),
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
      map(({ materiaIds, atrasadas, hoje }) => {
        this.materiasEditalAtivo = materiaIds;
        const atrasadasFiltradas = this.filtrarPorMateriaAtiva((atrasadas?.itens || []) as RevisaoDashboardItem[], materiaIds);
        const primeiroAtrasado = atrasadasFiltradas[0] || null;
        if (primeiroAtrasado?.materiaId) {
          return {
            materiaId: Number(primeiroAtrasado.materiaId),
            topicoId: Number(primeiroAtrasado.topicoId || 0),
            filtro: 'atrasadas'
          };
        }

        const hojeFiltradas = this.filtrarPorMateriaAtiva((hoje?.itens || []) as RevisaoDashboardItem[], materiaIds);
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
          this.iniciandoRevisao = false;
          return;
        }

        this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
          queryParams: {
            modo: 'revisar',
            filtro: alvo.filtro,
            topicoId: Number((alvo as any)?.topicoId || 0) || null
          }
        }).finally(() => {
          this.iniciandoRevisao = false;
        });
      },
      error: () => {
        this.iniciandoRevisao = false;
      }
    });
  }
}



