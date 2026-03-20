import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { PressaoFilaItemDTO } from 'src/app/core/api/dto/pressao-do-dia.dto';
import { FocoDistribuicaoMateriaDTO, FocoExecucaoPlanoDTO, FocoPlanoDiarioDTO, FocoProgressoHojeDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { Edital } from '../models/Edital';
import { EditalService } from '../services/edital.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { ExecutionQueueService } from 'src/app/core/services/execution-queue.service';
import { FocoPlanoDiarioService, FocoPremiumMetrics } from 'src/app/core/services/foco-plano-diario.service';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { AuthService } from 'src/app/site/services/auth.service';
import { PressaoCognitivaDTO, SalaEstudoService, TreinarFraquezaMateriaDTO } from '../services/sala-estudo.service';

type FiltroFila = 'todos' | 'criticos' | 'emRisco';
type FiltroPremium = 'CRITICO' | 'EM_RISCO' | 'MANUTENCAO';

interface FocoAcaoHoje {
  total: number;
  criticos: number;
  emRisco: number;
  manutencaoHoje: number;
}

interface FocoSaudeConhecimento {
  riscoMedio: number;
  retencao14d: number;
  estabilidadeMedia: number;
  percentualEmRisco: number;
}

@Component({
  selector: 'app-foco',
  templateUrl: './foco.component.view.html',
  styleUrls: ['./foco.component.scss']
})
export class FocoComponent implements OnInit, OnDestroy {
  loadingPlano = false;
  error: string | null = null;
  planoDiario: FocoPlanoDiarioDTO | null = null;

  modoHojeLabel = '-';
  headlineHoje = 'Sem headline no momento.';

  criticos = 0;
  emRisco = 0;
  manutencaoVencida = 0;
  manutencaoHoje = 0;
  totalHoje = 0;
  nomeAluno = 'Aluno(a)';
  diasAtivo = 1;

  filaHoje: PressaoFilaItemDTO[] = [];
  filaPreventiva: PressaoFilaItemDTO[] = [];
  preventivosSugeridos = 0;
  isPreventivoAberto = false;
  filtroFila: FiltroFila = 'todos';
  readonly filtrosFilaOptions: Array<{ label: string; value: FiltroPremium }> = [
    { label: 'Críticos', value: 'CRITICO' },
    { label: 'Em risco', value: 'EM_RISCO' },
    { label: 'Manutenção', value: 'MANUTENCAO' }
  ];
  filtrosSelecionados: FiltroPremium[] = ['CRITICO', 'EM_RISCO', 'MANUTENCAO'];
  donutData: any = null;
  donutOptions: any = {
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          boxWidth: 8
        }
      }
    }
  };
  pressaoLinhaData: any = null;
  pressaoLinhaOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 11, weight: '600' } }
      },
      y: {
        beginAtZero: true,
        suggestedMax: 1,
        grid: { color: '#e2e8f0' },
        ticks: {
          color: '#64748b',
          font: { size: 11, weight: '600' },
          callback: (value: any) => `${Math.round(Number(value) * 100)}%`
        }
      }
    }
  };
  premiumMetrics: FocoPremiumMetrics = {
    dadosConsolidados: false,
    estabilidadeMedia: null,
    riscoMedio: null,
    retencao14d: null,
    percentualTopicosEmRisco: null
  };
  execucaoPlano: FocoExecucaoPlanoDTO | null = null;
  progressoHoje: FocoProgressoHojeDTO | null = null;
  streakDias: number | null = null;
  streakCarregando = false;
  showRevisaoObrigatoriaDialog = false;
  treinoFraquezasLoading = false;
  treinoFraquezasMaterias: Array<{ materiaId: number; materiaNome: string; topicos: number[] }> = [];
  private materiasPlanoExpandidas = new Set<number>();
  pressaoCognitiva?: PressaoCognitivaDTO;
  private editaisCache: Edital[] = [];
  private editalAtivoImagemUrlResolved: string | null = null;
  private editalAtivoImagemObjectUrl: string | null = null;
  private editalAtivoImagemTemplateId: number | null = null;
  private readonly enableKpiDebugLogs = true;
  acaoHoje: FocoAcaoHoje = {
    total: 0,
    criticos: 0,
    emRisco: 0,
    manutencaoHoje: 0
  };
  saude: FocoSaudeConhecimento = {
    riscoMedio: 0,
    retencao14d: 0,
    estabilidadeMedia: 0,
    percentualEmRisco: 0
  };

  constructor(
    private focoPlanoDiarioService: FocoPlanoDiarioService,
    private router: Router,
    private executionQueueService: ExecutionQueueService,
    private hojeFilaService: HojeFilaService,
    private authService: AuthService,
    private salaEstudoService: SalaEstudoService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService
  ) {}

  ngOnInit(): void {
    this.carregarNomeAluno();
    this.carregarDiasAtivo();
    this.carregarPlanoDiario();
    this.carregarStreak();
    this.carregarTreinoFraquezas();
    this.carregarPressaoCognitiva();
  }

  ngOnDestroy(): void {
    this.removerImagemEditalAtivo();
  }

  get isModoRevisao(): boolean {
    return String(this.planoDiario?.modo || '').toUpperCase() === 'REVISAO';
  }

  get editalAtivoNome(): string {
    const nome = String(this.planoDiario?.editalNome || '').trim();
    return nome || 'Edital não informado';
  }

  get editalAtivoImagemUrl(): string | null {
    if (this.editalAtivoImagemUrlResolved) return this.editalAtivoImagemUrlResolved;
    const planoAny = this.planoDiario as any;
    const candidatos = [
      planoAny?.editalImagemUrl,
      planoAny?.editalLogoUrl,
      planoAny?.imagemEditalUrl,
      planoAny?.logoEditalUrl,
      planoAny?.editalImagemBase64,
      planoAny?.imagemEditalBase64,
      planoAny?.edital?.imagemUrl,
      planoAny?.edital?.logoUrl,
      planoAny?.edital?.imagem,
      planoAny?.edital?.logo
    ];

    for (const candidato of candidatos) {
      const url = String(candidato || '').trim();
      if (url) return url;
    }

    return null;
  }

  get editalAtivoSigla(): string {
    const nome = this.editalAtivoNome;
    const partes = nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '');
    const sigla = partes.join('');
    return sigla || 'ED';
  }

  private carregarNomeAluno(): void {
    const nome = String(this.authService.getUserNameFromToken() || '').trim();
    this.nomeAluno = nome || 'Aluno(a)';
  }

  private carregarDiasAtivo(): void {
    const localKey = 'revizo:first_seen_at';
    const now = new Date();
    let dataBase: Date | null = null;

    const rawLocal = String(localStorage.getItem(localKey) || '').trim();
    if (rawLocal) {
      const parsed = this.parseDateLocal(rawLocal);
      if (parsed) dataBase = parsed;
    }

    if (!dataBase) {
      localStorage.setItem(localKey, now.toISOString());
      dataBase = now;
    }

    this.diasAtivo = this.diffDiasInclusivo(dataBase, now);

    this.authService.getUserData().subscribe({
      next: (user) => {
        const dataCadastroRaw = this.extrairDataCadastro(user);
        const dataCadastro = dataCadastroRaw ? this.parseDateLocal(dataCadastroRaw) : null;
        if (!dataCadastro) return;
        this.diasAtivo = this.diffDiasInclusivo(dataCadastro, new Date());
      },
      error: () => {
        // mantém fallback local
      }
    });
  }

  private extrairDataCadastro(user: any): string | null {
    const candidato =
      user?.dataCadastro ??
      user?.createdAt ??
      user?.dataCriacao ??
      user?.cadastroEm ??
      user?.aluno?.dataCadastro ??
      user?.aluno?.createdAt ??
      user?.aluno?.dataCriacao ??
      null;
    const txt = String(candidato || '').trim();
    return txt || null;
  }

  private diffDiasInclusivo(dataInicio: Date, dataFim: Date): number {
    const inicio = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), dataInicio.getDate()).getTime();
    const fim = new Date(dataFim.getFullYear(), dataFim.getMonth(), dataFim.getDate()).getTime();
    const diff = Math.floor((fim - inicio) / 86400000) + 1;
    return Math.max(1, diff);
  }

  get isModoExecucaoPlano(): boolean {
    return String(this.planoDiario?.modo || '').toUpperCase() === 'EXECUCAO_PLANO';
  }

  get isModoConsolidacao(): boolean {
    return String(this.planoDiario?.modo || '').toUpperCase() === 'CONSOLIDACAO';
  }

  get isExecucaoPlanoMateriaConcluida(): boolean {
    return !!this.execucaoPlano?.materiaConcluida;
  }

  get hasReview(): boolean {
    return this.acaoHoje.total > 0;
  }

  get hasPreventivo(): boolean {
    return (this.filaPreventiva?.length ?? 0) > 0;
  }

  get hasCritical(): boolean {
    return this.acaoHoje.criticos > 0;
  }

  get obrigatoriedadeRevisao(): boolean {
    const flagBack = (this.planoDiario as any)?.temRevisaoObrigatoria;
    if (typeof flagBack === 'boolean') return flagBack && this.exibidosHoje > 0;
    return this.exibidosHoje > 0;
  }

  get contadorCriticos(): number {
    if (this.deveZerarContadoresHoje) return 0;
    const daFila = this.itensHoje.filter((item) => this.getCategoriaNorm(item) === 'CRITICO').length;
    return daFila > 0 ? daFila : this.acaoHoje.criticos;
  }

  get contadorEmRisco(): number {
    if (this.deveZerarContadoresHoje) return 0;
    const daFila = this.itensHoje.filter((item) => this.getCategoriaNorm(item) === 'EM_RISCO').length;
    return daFila > 0 ? daFila : this.acaoHoje.emRisco;
  }

  get contadorManutencao(): number {
    if (this.deveZerarContadoresHoje) return 0;
    const daFila = this.itensHoje.filter((item) => this.getCategoriaNorm(item).includes('MANUT')).length;
    return daFila > 0 ? daFila : this.acaoHoje.manutencaoHoje;
  }

  get totalTopicosFraquezas(): number {
    return (this.treinoFraquezasMaterias || []).reduce((acc, item) => acc + Number(item?.topicos?.length || 0), 0);
  }

  get primeiraMateriaFraquezaId(): number | null {
    const id = Number(this.treinoFraquezasMaterias?.[0]?.materiaId || 0);
    return id > 0 ? id : null;
  }

  get contadorTotal(): number {
    return this.acaoHoje.total;
  }

  get execucaoMateriaNome(): string {
    const materiaId = Number(this.execucaoPlano?.materiaId || 0);
    if (materiaId > 0) {
      const item = this.distribuicaoPlano.find((d) => Number(d?.materiaId || 0) === materiaId);
      const nome = String(item?.materiaNome || '').trim();
      if (nome) return nome;
    }
    const fallback = this.distribuicaoPlano[0];
    return String(fallback?.materiaNome || '').trim() || 'Matéria do ciclo atual';
  }

  get firstDistribuicao(): FocoDistribuicaoMateriaDTO | null {
    return this.distribuicaoPlano.length ? this.distribuicaoPlano[0] : null;
  }

  get distribuicaoExecucaoAtual(): FocoDistribuicaoMateriaDTO | null {
    const materiaId = Number(this.execucaoPlano?.materiaId || 0);
    if (materiaId > 0) {
      const daExecucao = this.distribuicaoPlano.find((d) => Number(d?.materiaId || 0) === materiaId) || null;
      if (daExecucao) return daExecucao;
    }
    return this.firstDistribuicao;
  }

  get proximoTopicoNomeUi(): string {
    const nomeExecucao = String(this.execucaoPlano?.proximoTopicoNome || '').trim();
    if (nomeExecucao) return nomeExecucao;
    const nomeDistribuicao = String(this.distribuicaoExecucaoAtual?.proximoConteudo?.topicoNome || '').trim();
    return nomeDistribuicao || 'Não informado';
  }

  get topicoPaiNomeUi(): string {
    const nomeExecucao =
      String(this.execucaoPlano?.proximoTopicoPaiNome || '').trim() ||
      String(this.execucaoPlano?.topicoPaiNome || '').trim();
    if (nomeExecucao) return nomeExecucao;

    const primeiro = this.distribuicaoExecucaoAtual;
    if (!primeiro) return 'Não informado';
    return this.getTopicoPaiExecucao(primeiro) || 'Não informado';
  }

  get capacidadeHojeUi(): string {
    return this.formatMinutos(this.planoDiario?.capacidadeMinutos ?? null);
  }

  getTopicoPaiExecucao(item: FocoDistribuicaoMateriaDTO): string | null {
    const proximo = (item?.proximoConteudo || {}) as any;
    const topicoId = Number(proximo?.topicoId || 0);
    const execucao = this.execucaoPlano as any;
    const execucaoTopicoId = Number(execucao?.proximoTopicoId || 0);

    const doItem =
      String(proximo?.topicoPaiNome || '').trim() ||
      String(proximo?.topicoPaiDescricao || '').trim() ||
      String(proximo?.nomeTopicoPai || '').trim() ||
      String(proximo?.parentName || '').trim() ||
      String(proximo?.paiNome || '').trim() ||
      String(proximo?.paiDescricao || '').trim() ||
      String(proximo?.topicoPai?.nome || '').trim() ||
      String(proximo?.pai?.nome || '').trim();
    if (doItem) return doItem;

    if (execucaoTopicoId > 0 && topicoId > 0 && execucaoTopicoId === topicoId) {
      const doExecucao =
        String(execucao?.proximoTopicoPaiNome || '').trim() ||
        String(execucao?.proximoTopicoPaiDescricao || '').trim() ||
        String(execucao?.nomeTopicoPai || '').trim() ||
        String(execucao?.topicoPaiNome || '').trim() ||
        String(execucao?.topicoPaiDescricao || '').trim() ||
        String(execucao?.paiNome || '').trim();
      if (doExecucao) return doExecucao;
    }

    return null;
  }

  get distribuicaoPlano(): FocoDistribuicaoMateriaDTO[] {
    const lista = this.planoDiario?.distribuicao;
    return Array.isArray(lista) ? lista : [];
  }

  get heroStatusClass(): string {
    if (this.criticosHoje > 0) return 'hero hero--danger';
    if (this.criticosHoje === 0 && this.emRiscoHoje > 0) return 'hero hero--warn';
    return 'hero hero--success';
  }

  get heroFrasePrincipal(): string {
    return 'Hoje';
  }

  get heroSubtituloMissao(): string {
    if (this.exibidosHoje <= 0) return 'Sem topicos para revisar.';
    return `${this.exibidosHoje} topicos para revisar`;
  }

  get heroNotaPrioridade(): string {
    return 'Prioridade: score -> data';
  }

  get mostrarHeroKpis(): boolean {
    return this.totalAcionavel > 0 || this.exibidosHoje > 0;
  }

  get podeExecutarHeroCta(): boolean {
    return this.filaHoje.length > 0;
  }

  get totalAcionavel(): number {
    return this.acaoHoje.total;
  }

  get itensHoje(): PressaoFilaItemDTO[] {
    return Array.isArray(this.filaHoje) ? this.filaHoje : [];
  }

  get exibidosHoje(): number {
    return this.itensHoje.length;
  }

  get existeCorte(): boolean {
    return this.totalAcionavel > this.exibidosHoje;
  }

  get restanteHoje(): number | null {
    const planoAny = this.planoDiario as any;
    const candidatos = [
      planoAny?.restanteHoje,
      planoAny?.remainingToday,
      planoAny?.resumoAcionavel?.restanteHoje,
      planoAny?.resumoAcionavel?.remainingToday
    ];

    for (const candidato of candidatos) {
      const n = Number(candidato);
      if (Number.isFinite(n)) {
        return Math.max(0, Math.round(n));
      }
    }

    const totalDisponivelHoje = Number(planoAny?.totalDisponivelHoje);
    const exibindoHoje = Number(planoAny?.exibindoHoje ?? this.exibidosHoje);
    if (Number.isFinite(totalDisponivelHoje) && Number.isFinite(exibindoHoje)) {
      return Math.max(0, Math.round(totalDisponivelHoje - exibindoHoje));
    }

    return null;
  }

  get limiteAtingido(): boolean {
    const planoAny = this.planoDiario as any;
    const candidatos = [
      planoAny?.limiteAtingido,
      planoAny?.dailyLimitReached,
      planoAny?.resumoAcionavel?.limiteAtingido,
      planoAny?.resumoAcionavel?.dailyLimitReached
    ];
    if (candidatos.some((valor) => valor === true)) return true;

    if (this.restanteHoje !== null) {
      return this.restanteHoje <= 0;
    }

    return this.filaHoje.length === 0 && this.existeCorte && this.totalAcionavel > 0;
  }

  get deveZerarContadoresHoje(): boolean {
    if (this.limiteAtingido) return true;
    if (this.restanteHoje !== null && this.restanteHoje <= 0) return true;
    return this.filaHoje.length === 0 && this.existeCorte;
  }

  get criticosHoje(): number {
    return this.itensHoje.filter((i) => this.getCategoriaNorm(i) === 'CRITICO').length;
  }

  get emRiscoHoje(): number {
    return this.itensHoje.filter((i) => this.getCategoriaNorm(i) === 'EM_RISCO').length;
  }

  get backlogCriticos(): number {
    return this.toInt(this.planoDiario?.resumoAcionavel?.criticos);
  }

  get backlogEmRisco(): number {
    return this.toInt(this.planoDiario?.resumoAcionavel?.emRisco);
  }

  get manutencaoTotal(): number {
    return this.toInt(this.manutencaoHoje) + this.toInt(this.manutencaoVencida);
  }

  get filaHojeFiltrada(): any[] {
    const lista = Array.isArray(this.filaHoje) ? this.filaHoje : [];
    if (this.filtroFila === 'todos') return lista;
    if (this.filtroFila === 'criticos') return lista.filter((i) => this.isCritico(i));
    return lista.filter((i) => this.isEmRisco(i));
  }

  get itensFiltrados(): PressaoFilaItemDTO[] {
    const lista = Array.isArray(this.filaHoje) ? this.filaHoje : [];
    if (!this.filtrosSelecionados.length) return [];
    return lista.filter((item) => this.matchFiltroSelecionado(item));
  }

  get dadosConsolidados(): boolean {
    return true;
  }

  get riscoMedioHoje(): number | null {
    return this.saude.riscoMedio;
  }

  get estabilidadeMediaHoje(): number | null {
    return this.saude.estabilidadeMedia;
  }

  get tendenciaRiscoPercent(): number | null {
    const serie = this.extrairSeriePressao7d(this.planoDiario);
    if (serie.length < 2) return null;
    const atual = serie[serie.length - 1].value;
    const anterior = serie[serie.length - 2].value;
    if (anterior <= 0) return atual > 0 ? 100 : 0;
    return Number((((atual - anterior) / anterior) * 100).toFixed(1));
  }

  get tendenciaRiscoLabel(): string {
    const valor = this.tendenciaRiscoPercent;
    if (valor === null) return '';
    if (valor > 0) return `+${valor.toFixed(1)}% vs ontem`;
    return `${valor.toFixed(1)}% vs ontem`;
  }

  get textoStatusCognitivo(): string {
    if (!this.dadosConsolidados || this.riscoMedioHoje === null) return 'Em consolidação';
    if (this.riscoMedioHoje > 0.5) return 'Você está esquecendo rápido. Revise hoje.';
    if (this.riscoMedioHoje >= 0.3) return 'Parte do conteúdo pode começar a ser esquecido.';
    return 'Sua memória está estável.';
  }

  get totalRevisoesHoje(): number {
    return this.acaoHoje.total;
  }

  get classeCargaMissao(): string {
    const total = this.totalRevisoesHoje;
    if (total <= 5) return 'Baixo';
    if (total <= 12) return 'Moderado';
    return 'Alto';
  }

  get tempoEstimadoMissao(): string {
    return this.formatMinutos(this.totalRevisoesHoje * 4);
  }

  get retencao14DiasRatio(): number {
    return this.saude.retencao14d;
  }

  get dominioMedioRatio(): number | null {
    const estabilidade = this.estabilidadeMediaHoje;
    return estabilidade === null ? null : estabilidade;
  }

  get percentualTopicosRisco(): number | null {
    return this.saude.percentualEmRisco;
  }

  get saudeEditalMensagem(): string {
    if (!this.dadosConsolidados) return 'Em consolidação';
    const retPct = this.retencao14DiasPercent ?? 0;
    if (retPct > 75) return 'Base sólida.';
    if (retPct >= 60) return 'Base estável, mas exige manutenção.';
    return 'Parte importante do conteúdo pode cair.';
  }

  get retencao14DiasPercent(): number | null {
    return Math.round(this.retencao14DiasRatio * 100);
  }

  get dominioMedioPercent(): number | null {
    const dominio = this.dominioMedioRatio;
    if (dominio === null) return null;
    return Math.round(dominio * 100);
  }

  get gaugeSaudeStyle(): Record<string, string> {
    const valor = this.retencao14DiasPercent ?? 0;
    return { '--gauge-value': `${valor}` };
  }

  get manutencaoProgramadaCount(): number {
    return this.acaoHoje.manutencaoHoje;
  }

  get riscoElevadoCount(): number {
    return this.acaoHoje.criticos + this.acaoHoje.emRisco;
  }

  get revisoesResumoHero(): string {
    if (this.totalRevisoesHoje <= 0 && this.revisoesFeitasHoje > 0) {
      return `Nenhuma pendente • ${this.revisoesFeitasHoje} tópicos revisados hoje ✅`;
    }
    if (this.totalRevisoesHoje <= 0) return 'Sem revisões hoje';
    return `${this.riscoElevadoCount} urgentes • ${this.tempoEstimadoMissao}`;
  }

  get revisoesResumoCard(): string {
    if (this.totalRevisoesHoje <= 0 && this.revisoesFeitasHoje > 0) {
      return `Nenhuma pendente • ${this.revisoesFeitasHoje} tópicos revisados hoje ✅`;
    }
    if (this.totalRevisoesHoje <= 0) return 'Sem revisões hoje';
    return `${this.riscoElevadoCount} revisões são urgentes hoje`;
  }

  get revisoesFeitasHoje(): number {
    return Number(this.progressoHoje?.revisoesTopicoConcluidas ?? 0);
  }

  get estudosFeitosHoje(): number {
    return Number(this.progressoHoje?.estudosConcluidos ?? 0);
  }

  get flashcardsFeitosHoje(): number {
    return Number(this.progressoHoje?.revisoesFlashcardConcluidas ?? 0);
  }

  get reforcosFeitosHoje(): number {
    return Number(this.progressoHoje?.reforcosResolvidos ?? 0);
  }

  get pressaoCognitivaPercentual(): number {
    const valor = Number(this.pressaoCognitiva?.pressaoPercentual ?? 0);
    if (!Number.isFinite(valor)) return 0;
    return Math.max(0, Math.min(100, valor));
  }

  get pressaoCognitivaFaixa(): 'estavel' | 'moderada' | 'risco' | 'alta' {
    const p = this.pressaoCognitivaPercentual;
    if (p <= 25) return 'estavel';
    if (p <= 50) return 'moderada';
    if (p <= 75) return 'risco';
    return 'alta';
  }

  get progressoPlanoPercent(): number | null {
    const cap = Number(this.planoDiario?.capacidadeMinutos ?? 0);
    if (!cap) return null;

    const progressoAny = this.progressoHoje as any;
    const minutosReais = Number(
      progressoAny?.minutosExecutados ??
      progressoAny?.minutosConcluidos ??
      progressoAny?.tempoEstudoHojeMinutos ??
      NaN
    );
    const minutosEstimados = Number.isFinite(minutosReais) && minutosReais >= 0
      ? minutosReais
      : (this.revisoesFeitasHoje + this.estudosFeitosHoje + this.reforcosFeitosHoje) * 10;

    const p = Math.round(Math.min(100, (minutosEstimados / cap) * 100));
    return Math.max(0, p);
  }

  get revisoesConcluidasHoje(): number {
    return Number(this.progressoHoje?.revisoesTopicoConcluidas ?? 0);
  }

  get revisoesSubtexto(): string {
    return this.revisoesResumoHero;
  }

  get reclassificadosCount(): number {
    return this.itensHoje.filter((item) => {
      const acaoCodigo = String((item as any)?.acaoCodigo || '').toUpperCase();
      const origem = String((item as any)?.fonte || '').toUpperCase();
      const categoria = this.getCategoriaNorm(item);
      return acaoCodigo.includes('RECLASS') || origem.includes('RECLASS') || categoria.includes('RECLASS');
    }).length;
  }

  get hasHistoricoPressao7d(): boolean {
    return this.extrairSeriePressao7d(this.planoDiario).length >= 2;
  }

  get textoProjecaoPressao(): string {
    const totalAgora = this.totalRevisoesHoje;
    if (totalAgora > 20) {
      return 'Nos próximos 3 dias você ainda terá bastante revisão para fazer.';
    }
    if (totalAgora >= 10) {
      return 'O ritmo de revisões deve se manter estável nos próximos dias.';
    }
    return 'O volume de revisões deve diminuir nos próximos dias.';
  }

  get percentualRiscoHoje(): number | null {
    if (this.riscoMedioHoje === null) return null;
    return Math.round(this.riscoMedioHoje * 100);
  }

  get mediaRecenteAcertosPercent(): number | null {
    const estabilidade = this.estabilidadeMediaHoje;
    if (estabilidade === null) return null;
    return Math.round(estabilidade * 100);
  }

  get riscoClassificacaoTexto(): string {
    const risco = this.percentualRiscoHoje;
    if (risco === null) return 'Em consolidação';
    if (risco < 25) return 'Risco baixo';
    if (risco <= 45) return 'Risco moderado';
    if (risco <= 70) return 'Risco alto';
    return 'Risco crítico';
  }

  get riscoClassificacaoClasse(): string {
    const risco = this.percentualRiscoHoje;
    if (risco === null) return 'risk--na';
    if (risco < 25) return 'risk--low';
    if (risco <= 45) return 'risk--moderate';
    if (risco <= 70) return 'risk--high';
    return 'risk--critical';
  }

  get riscoPercentualStyle(): Record<string, string> {
    const risco = this.percentualRiscoHoje ?? 0;
    return { '--risk-value': `${risco}%` };
  }

  formatPremiumRatio(value: number | null): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  formatPremiumPercent(value: number | null): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${Math.round(Number(value))}%`;
  }

  get ordenacaoAtualLabel(): string {
    return 'Prioridade por risco, desempate por proximidade';
  }

  get textoSequenciaSessao(): string {
    return '25min na 1ª matéria → 25min na 2ª matéria → repetir';
  }

  setFiltroFila(filtro: FiltroFila): void {
    this.filtroFila = filtro;
    // TODO(remover): log de filtro
    console.debug('[Foco] filtro=', filtro, 'filtrada=', this.filaHojeFiltrada?.length ?? 0);
  }

  onFiltrosFilaChange(values: FiltroPremium[] | null | undefined): void {
    this.filtrosSelecionados = Array.isArray(values) ? values : [];
  }

  isFiltroSelecionado(filtro: FiltroPremium): boolean {
    return this.filtrosSelecionados.includes(filtro);
  }

  toggleFiltroSelecionado(filtro: FiltroPremium): void {
    if (this.isFiltroSelecionado(filtro)) {
      this.filtrosSelecionados = this.filtrosSelecionados.filter((item) => item !== filtro);
      return;
    }
    this.filtrosSelecionados = [...this.filtrosSelecionados, filtro];
  }

  tentarNovamente(): void {
    this.carregarPlanoDiario();
  }

  executarHeroCta(): void {
    this.iniciarRevisaoDoDia();
  }

  iniciarRevisao(): void {
    this.iniciarRevisaoDoDia();
  }

  irParaConfiguracoes(): void {
    this.router.navigate(['/area-restrita/configuracoes']);
  }

  iniciarRevisaoDoDia(): void {
    const filaCompleta = this.buildExecutionQueue(this.filaHoje || []);

    if (!filaCompleta.length) return;

    const topicosSerializados = filaCompleta.map((item) => item.topicoId).join(',');
    const primeiraMateriaIdFila = Number(filaCompleta[0]?.materiaId || 0);
    if (primeiraMateriaIdFila <= 0) {
      this.executionQueueService.setFila(filaCompleta);
      this.router.navigate(['/area-restrita/sala-estudo/executar'], {
        queryParams: { topicos: topicosSerializados, origem: 'foco' },
        state: { executionQueue: filaCompleta }
      });
      return;
    }

    const primeiro = filaCompleta[0];
    const primeiraMateriaId = Number(primeiro?.materiaId || 0);
    const primeiroTopicoId = Number(primeiro?.topicoId || 0);
    this.executionQueueService.setFila(filaCompleta);

    if (primeiraMateriaId > 0 && primeiroTopicoId > 0) {
      this.router.navigate(['/area-restrita/sala-estudo', primeiraMateriaId], {
        queryParams: {
          modo: 'revisar',
          topicoId: primeiroTopicoId,
          filaExecucao: '1',
          topicos: topicosSerializados,
          origem: 'foco'
        },
        state: { executionQueue: filaCompleta }
      });
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo/executar'], {
      queryParams: { topicos: topicosSerializados, origem: 'foco' },
      state: { executionQueue: filaCompleta }
    });
  }

  private buildExecutionQueue(
    filaRevisao: PressaoFilaItemDTO[]
  ): Array<{ topicoId: number; materiaId: number | null }> {
    type ExecutionItem = {
      topicoId: number;
      materiaId: number | null;
      priorityValue: number | null;
      apiIndex: number;
    };
    type ExecutionGroup = {
      materiaId: number | null;
      items: ExecutionItem[];
      maxPriority: number | null;
      firstApiIndex: number;
    };

    const grupos = new Map<string, ExecutionGroup>();

    (filaRevisao || []).forEach((item, apiIndex) => {
      const topicoId = Number(item?.topicoId || 0);
      if (topicoId <= 0) return;

      const materiaIdRaw = Number(item?.materiaId || 0);
      const materiaId = materiaIdRaw > 0 ? materiaIdRaw : null;
      const groupKey = materiaId === null ? `sem-materia:${topicoId}` : String(materiaId);
      const executionItem: ExecutionItem = {
        topicoId,
        materiaId,
        priorityValue: this.getExecutionPriority(item),
        apiIndex
      };

      if (!grupos.has(groupKey)) {
        grupos.set(groupKey, {
          materiaId,
          items: [executionItem],
          maxPriority: executionItem.priorityValue,
          firstApiIndex: apiIndex
        });
        return;
      }

      const grupo = grupos.get(groupKey)!;
      grupo.items.push(executionItem);
      grupo.firstApiIndex = Math.min(grupo.firstApiIndex, apiIndex);
      grupo.maxPriority = this.maxExecutionPriority(grupo.maxPriority, executionItem.priorityValue);
    });

    return Array.from(grupos.values())
      .sort((a, b) => this.compareExecutionGroups(a, b))
      .flatMap((grupo) =>
        grupo.items
          .sort((a, b) => this.compareExecutionItems(a, b))
          .map((item) => ({
            topicoId: item.topicoId,
            materiaId: item.materiaId
          }))
      );
  }

  private getExecutionPriority(item: PressaoFilaItemDTO | null | undefined): number | null {
    const raw = item as any;
    const candidatos = [
      raw?.risk,
      raw?.risco,
      raw?.riskScore,
      raw?.scoreRisco
    ];
    for (const candidato of candidatos) {
      const valor = this.parseNumeric(candidato);
      if (valor !== null) return valor;
    }

    const score = this.parseNumeric(raw?.score);
    if (score === null) return null;
    return score <= 1 ? 1 - score : -score;
  }

  private maxExecutionPriority(current: number | null, candidate: number | null): number | null {
    if (current === null) return candidate;
    if (candidate === null) return current;
    return Math.max(current, candidate);
  }

  private compareExecutionGroups(
    a: { maxPriority: number | null; firstApiIndex: number },
    b: { maxPriority: number | null; firstApiIndex: number }
  ): number {
    const prioridade = this.comparePriorityValues(a.maxPriority, b.maxPriority);
    if (prioridade !== 0) return prioridade;
    return a.firstApiIndex - b.firstApiIndex;
  }

  private compareExecutionItems(
    a: { priorityValue: number | null; apiIndex: number },
    b: { priorityValue: number | null; apiIndex: number }
  ): number {
    const prioridade = this.comparePriorityValues(a.priorityValue, b.priorityValue);
    if (prioridade !== 0) return prioridade;
    return a.apiIndex - b.apiIndex;
  }

  private comparePriorityValues(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  }

  iniciarTreinoFraquezas(materiaId: number): void {
    if (this.treinoFraquezasLoading) return;
    this.treinoFraquezasLoading = true;
    const materia = this.treinoFraquezasMaterias.find((item) => item.materiaId === materiaId) || null;
    if (!materia || !materia.topicos.length) {
      this.treinoFraquezasLoading = false;
      alert('Nenhum tópico crítico disponível para esta matéria.');
      return;
    }

    const fila = materia.topicos.map((topicoId) => ({ topicoId, materiaId: materia.materiaId }));
    const topicosSerializados = materia.topicos.join(',');
    const primeiroTopicoId = Number(materia.topicos[0] || 0);

    this.executionQueueService.setFila(fila);
    const queryParams: Record<string, string> = {
      topicos: topicosSerializados,
      filaExecucao: '1',
      modo: 'revisar',
      origem: 'foco'
    };
    if (primeiroTopicoId > 0) {
      queryParams['topicoId'] = String(primeiroTopicoId);
    }

    this.router.navigate(['/area-restrita/sala-estudo', materia.materiaId], {
      queryParams,
      state: { executionQueue: fila }
    }).finally(() => {
      this.treinoFraquezasLoading = false;
    });
  }

  private carregarTreinoFraquezas(): void {
    this.salaEstudoService.listarTreinarFraquezas().subscribe({
      next: (materias) => {
        this.treinoFraquezasMaterias = this.normalizarTreinoFraquezas(materias || []);
      },
      error: (err) => {
        console.error('[FOCO] erro ao carregar treino de fraquezas:', err);
        this.treinoFraquezasMaterias = [];
      }
    });
  }

  private carregarPressaoCognitiva(): void {
    this.salaEstudoService.getPressaoCognitiva().subscribe({
      next: (res) => {
        this.pressaoCognitiva = res;
      },
      error: () => {
        this.pressaoCognitiva = undefined;
      }
    });
  }

  private normalizarTreinoFraquezas(
    materias: TreinarFraquezaMateriaDTO[]
  ): Array<{ materiaId: number; materiaNome: string; topicos: number[] }> {
    return (materias || [])
      .map((item) => {
        const materiaId = Number(item?.materiaId || 0);
        const materiaNome = String(item?.materiaNome || '').trim() || `Matéria ${materiaId}`;
        const topicos = (item?.topicos || [])
          .map((topico: any) => Number(typeof topico === 'number' ? topico : topico?.topicoId))
          .filter((topicoId: number) => Number.isFinite(topicoId) && topicoId > 0);
        return {
          materiaId,
          materiaNome,
          topicos: Array.from(new Set(topicos))
        };
      })
      .filter((item) => item.materiaId > 0 && item.topicos.length > 0);
  }

  iniciarSessaoInteligente(): void {
    const execucao = this.execucaoPlano;
    if (execucao) {
      console.info('[FOCO] execucaoPlano recebido', {
        materiaId: Number(execucao?.materiaId || 0) || null,
        proximoTopicoId: Number(execucao?.proximoTopicoId || 0) || null,
        materiaConcluida: !!execucao?.materiaConcluida,
        criterio: String(execucao?.criterio || '') || null
      });
    }

    const materiaConcluida = !!execucao?.materiaConcluida;
    const materiaIdExecucao = Number(execucao?.materiaId || 0);
    const proximoTopicoIdExecucao = Number(execucao?.proximoTopicoId || 0);
    if (execucao && !materiaConcluida && materiaIdExecucao > 0 && proximoTopicoIdExecucao > 0) {
      console.info('[FOCO] navegar sala-estudo com topicoId/origem', {
        materiaId: materiaIdExecucao,
        topicoId: proximoTopicoIdExecucao,
        origem: 'execucao_plano'
      });
      this.router.navigate(['/area-restrita/sala-estudo', materiaIdExecucao], {
        queryParams: {
          modo: 'estudar',
          origem: 'execucao_plano',
          topicoId: proximoTopicoIdExecucao
        }
      });
      return;
    }

    if (execucao && materiaConcluida) return;

    const primeiroExecutavel = this.distribuicaoPlano.find((item) => {
      const status = String(item?.status || '').toUpperCase();
      return status === 'OK' && Number(item?.materiaId || 0) > 0;
    });

    if (!primeiroExecutavel) {
      this.router.navigate(['/area-restrita/sala-estudo/executar']);
      return;
    }

    const materiaId = Number(primeiroExecutavel.materiaId || 0);
    console.info('[FOCO] navegar sala-estudo com topicoId/origem', {
      materiaId: materiaId > 0 ? materiaId : null,
      topicoId: null,
      origem: 'execucao_plano'
    });
    this.router.navigate(['/area-restrita/sala-estudo', primeiroExecutavel.materiaId], {
      queryParams: {
        modo: 'estudar',
        origem: 'execucao_plano'
      }
    });
  }

  onEstudarAgora(): void {
    if (this.obrigatoriedadeRevisao) {
      this.showRevisaoObrigatoriaDialog = true;
      return;
    }
    this.iniciarSessaoInteligente();
  }

  fecharDialogRevisaoObrigatoria(): void {
    this.showRevisaoObrigatoriaDialog = false;
  }

  confirmarIrParaRevisao(): void {
    this.showRevisaoObrigatoriaDialog = false;
    if (!this.exibidosHoje) return;
    this.iniciarRevisao();
  }

  abrirListaPreventivo(): void {
    this.isPreventivoAberto = !this.isPreventivoAberto;
  }

  abrirPreventivo(item: PressaoFilaItemDTO): void {
    const materiaId = Number((item as any)?.materiaId || 0);
    const topicoId = Number((item as any)?.topicoId || 0);
    if (materiaId <= 0 || topicoId <= 0) return;
    this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
      queryParams: {
        topicoId,
        origem: 'preventivo'
      }
    });
  }

  irParaBlocosEstudo(): void {
    this.router.navigate(['/area-restrita/blocos-estudo']);
  }

  irParaSalaEstudo(): void {
    this.router.navigate(['/area-restrita/sala-estudo/executar']);
  }

  executarItem(item: PressaoFilaItemDTO): void {
    const deepLink = String(item?.deepLink || '').trim();
    if (deepLink) {
      this.router.navigateByUrl(deepLink);
      return;
    }

    const materiaId = Number(item?.materiaId || 0);
    const topicoId = Number(item?.topicoId || 0);

    if (materiaId > 0 && topicoId > 0) {
      this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
        queryParams: { topicoId, modo: 'revisar', origem: 'foco' }
      });
      return;
    }

    this.router.navigate(['/area-restrita/revisoes']);
  }

  revisar(item: PressaoFilaItemDTO): void {
    this.executarItem(item);
  }

  acaoItemLabel(item: PressaoFilaItemDTO): string {
    const label = String(item?.acaoLabel || '').trim();
    if (label) return label;
    const classificacao = String(item?.classificacao || '').toUpperCase();
    return classificacao === 'ESTUDO' ? 'Estudar' : 'Revisar';
  }

  formatScore(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(Number(score))) return '-';
    return Number(score).toFixed(2);
  }

  scoreRatio(score: number | null | undefined): number | null {
    return this.toNullableRatio(score);
  }

  getItemScore(item: PressaoFilaItemDTO | null | undefined): number | null {
    const raw = item as any;
    const candidatos = [
      raw?.score,
      raw?.pontuacao,
      raw?.scorePrioridade,
      raw?.prioridadeScore,
      raw?.risco
    ];
    for (const candidato of candidatos) {
      const valor = this.parseNumeric(candidato);
      if (valor !== null) return valor;
    }
    return null;
  }

  formatLocalDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return String(dateStr);
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  formatCategoria(categoria: string | null | undefined): string {
    const itemMock = { categoria };
    return this.getCategoriaLabel(itemMock);
  }

  formatProxima(isoDate: string | null | undefined): string {
    return this.formatProximaRevisao(isoDate);
  }

  formatMinutos(minutos: number | null | undefined): string {
    if (minutos == null || !Number.isFinite(Number(minutos))) return '-';
    const total = Math.max(0, Math.round(Number(minutos)));
    const horas = Math.floor(total / 60);
    const resto = total % 60;
    if (horas <= 0) return `${resto}min`;
    if (resto === 0) return `${horas}h`;
    return `${horas}h ${resto}min`;
  }

  trackByFila(index: number, item: { topicoId?: number | null }): string {
    const topicoId = Number(item?.topicoId || 0);
    if (topicoId > 0) return String(topicoId);
    return `fila-${index}`;
  }

  isPrimeiraLinhaMateria(index: number): boolean {
    if (index <= 0) return true;
    const atual = this.normalizarMateriaNome(this.itensFiltrados[index]?.materiaNome);
    const anterior = this.normalizarMateriaNome(this.itensFiltrados[index - 1]?.materiaNome);
    return atual !== anterior;
  }

  trackByDistribuicao(index: number, item: FocoDistribuicaoMateriaDTO): string {
    const materiaId = Number(item?.materiaId || 0);
    return materiaId > 0 ? String(materiaId) : `dist-${index}`;
  }

  trackByTreinoFraquezas(index: number, item: { materiaId: number }): string {
    const materiaId = Number(item?.materiaId || 0);
    return materiaId > 0 ? String(materiaId) : `fraqueza-${index}`;
  }

  trackByPlanoMateria(index: number, item: FocoDistribuicaoMateriaDTO): string {
    const materiaId = Number(item?.materiaId || 0);
    return materiaId > 0 ? String(materiaId) : `plano-materia-${index}`;
  }

  isMateriaPlanoExpandida(item: FocoDistribuicaoMateriaDTO): boolean {
    const materiaId = Number(item?.materiaId || 0);
    return materiaId > 0 ? this.materiasPlanoExpandidas.has(materiaId) : false;
  }

  alternarMateriaPlano(item: FocoDistribuicaoMateriaDTO): void {
    const materiaId = Number(item?.materiaId || 0);
    if (materiaId <= 0) return;
    if (this.materiasPlanoExpandidas.has(materiaId)) {
      this.materiasPlanoExpandidas.delete(materiaId);
      return;
    }
    this.materiasPlanoExpandidas.add(materiaId);
  }

  private carregarPlanoDiario(): void {
    this.loadingPlano = true;
    this.error = null;
    const paramsLog = { editalId: null };
    console.log('[FOCO] load start', paramsLog);

    this.focoPlanoDiarioService
      .obterPlanoDiario()
      .pipe(finalize(() => (this.loadingPlano = false)))
      .subscribe({
        next: (dto) => {
          console.log('[FOCO] load ok', dto);
          this.aplicarPlanoDiario(dto);
        },
        error: (err: HttpErrorResponse) => {
          console.warn('[FOCO] load error', err);
          this.planoDiario = null;
          this.removerImagemEditalAtivo();
          this.filaHoje = [];
          this.filaPreventiva = [];
          this.preventivosSugeridos = 0;
          this.isPreventivoAberto = false;
          this.execucaoPlano = null;
          this.progressoHoje = null;
          this.acaoHoje = { total: 0, criticos: 0, emRisco: 0, manutencaoHoje: 0 };
          this.saude = { riscoMedio: 0, retencao14d: 0, estabilidadeMedia: 0, percentualEmRisco: 0 };
          this.premiumMetrics = {
            dadosConsolidados: false,
            estabilidadeMedia: null,
            riscoMedio: null,
            retencao14d: null,
            percentualTopicosEmRisco: null
          };
          this.pressaoLinhaData = null;
          this.error = this.resolverMensagemErro(err);
        }
      });
  }

  private carregarStreak(): void {
    this.streakCarregando = true;
    this.hojeFilaService.getDashboardStreak()
      .pipe(finalize(() => (this.streakCarregando = false)))
      .subscribe({
        next: (resumo) => {
          this.streakDias = Number(resumo?.streakAtual ?? 0) || null;
        },
        error: () => {
          this.streakDias = null;
        }
      });
  }

  private aplicarPlanoDiario(dto: FocoPlanoDiarioDTO): void {
    this.planoDiario = dto || null;
    this.error = null;

    this.modoHojeLabel = this.labelModo(dto?.modoAtivo || dto?.modo);

    const resumo = ((dto as any)?.resumoAcionavel || {}) as any;
    this.criticos = this.toInt(resumo.criticos);
    this.emRisco = this.toInt(resumo.emRisco);
    this.totalHoje = this.toInt(resumo.totalAgora);
    this.manutencaoVencida = this.toInt((resumo as any).manutencaoVencida);
    this.manutencaoHoje = this.toInt((resumo as any).manutencaoHoje);

    this.acaoHoje = {
      total: this.toInt(resumo?.totalAgora),
      criticos: this.toInt(resumo?.criticos),
      emRisco: this.toInt(resumo?.emRisco),
      manutencaoHoje: this.toInt(resumo?.manutencaoHoje)
    };

    this.saude = {
      riscoMedio: this.toNullableRatio(resumo?.riscoMedio) ?? 0,
      retencao14d: this.toNullableRatio(resumo?.retencao14d) ?? 0,
      estabilidadeMedia: this.toNullableRatio(resumo?.estabilidadeMedia) ?? 0,
      percentualEmRisco: this.toPercent(resumo?.percentualTopicosEmRisco)
    };

    this.filaHoje = Array.isArray(dto?.filaRevisao) ? dto.filaRevisao : [];
    this.filaPreventiva = Array.isArray((dto as any)?.filaPreventiva) ? (dto as any).filaPreventiva : [];
    this.preventivosSugeridos = this.toInt((dto as any)?.resumoAcionavel?.preventivosSugeridos ?? this.filaPreventiva.length);
    this.isPreventivoAberto = false;
    this.execucaoPlano = this.normalizarExecucaoPlano((dto as any)?.execucaoPlano);
    const progressoHojeRaw = (dto as any)?.progressoHoje;
    this.progressoHoje = progressoHojeRaw
      ? {
          ...progressoHojeRaw,
          revisoesTopicoConcluidas: this.toInt((progressoHojeRaw as any)?.revisoesTopicoConcluidas)
        }
      : null;
    this.premiumMetrics = this.focoPlanoDiarioService.mapearMetricasPremium(dto);
    this.filtroFila = 'todos';
    this.filtrosSelecionados = ['CRITICO', 'EM_RISCO', 'MANUTENCAO'];
    this.prepararDonut(dto);
    this.prepararPressaoLinha(dto);
    // TODO(remover): logs de validação do filtro
    console.debug('[Foco] filaHoje size=', this.filaHoje?.length ?? 0);
    console.debug(
      '[Foco] categorias distinct=',
      Array.from(new Set((this.filaHoje ?? []).map((i) => this.getCategoriaNorm(i))))
    );
    if (this.enableKpiDebugLogs) {
      console.log('[FOCO] KPIs resolved', {
        modo: dto?.modo || null,
        filaLen: this.itensHoje?.length ?? 0,
        acaoHoje: this.acaoHoje,
        saude: this.saude
      });
      console.log('[FOCO] preventivo', {
        filaRevisao: this.filaHoje?.length ?? 0,
        filaPreventiva: this.filaPreventiva?.length ?? 0,
        preventivosSugeridos: this.preventivosSugeridos
      });
    }

    this.atualizarImagemEditalAtivo(dto);

    if (this.isModoRevisao) {
      this.headlineHoje = this.heroFrasePrincipal;
      return;
    }

    if (this.isModoExecucaoPlano) {
      this.headlineHoje = 'Execucao do plano recomendada para hoje.';
      return;
    }

    this.headlineHoje = 'Tudo em dia e sem conteudo novo no plano.';
  }

  private atualizarImagemEditalAtivo(dto: FocoPlanoDiarioDTO | null): void {
    this.removerImagemEditalAtivo();
    if (!dto) return;
    if (this.definirImagemEditalPorPlano(dto as any)) return;

    const templateIdDoPlano = this.obterTemplateIdDoEdital(dto as any);
    if (templateIdDoPlano) {
      this.carregarImagemEditalAtivoPorTemplate(templateIdDoPlano);
      return;
    }

    const editalId = Number((dto as any)?.editalId || 0);
    const editalNome = String((dto as any)?.editalNome || '').trim();
    if (!(editalId > 0) && !editalNome) return;

    this.obterEditalPorIdOuNome(editalId, editalNome).then((edital) => {
      if (!edital) return;
      if (this.definirImagemEditalPorUrl(edital as any)) return;
      if (this.definirImagemEditalPorBytes(edital as any)) return;
      const templateId = this.obterTemplateIdDoEdital(edital as any);
      if (!templateId) return;
      this.carregarImagemEditalAtivoPorTemplate(templateId);
    }).catch(() => {
      // sem imagem; mantém fallback da sigla
    });
  }

  private definirImagemEditalPorPlano(planoAny: any): boolean {
    if (!planoAny || typeof planoAny !== 'object') return false;
    if (this.definirImagemEditalPorUrl(planoAny)) return true;
    if (this.definirImagemEditalPorBytes(planoAny)) return true;
    const editalObj = planoAny?.edital;
    if (editalObj && typeof editalObj === 'object') {
      if (this.definirImagemEditalPorUrl(editalObj)) return true;
      if (this.definirImagemEditalPorBytes(editalObj)) return true;
    }
    return false;
  }

  private definirImagemEditalPorUrl(anyObj: any): boolean {
    const urlBruta =
      anyObj?.editalImagemUrl ??
      anyObj?.editalLogoUrl ??
      anyObj?.imagemEditalUrl ??
      anyObj?.logoEditalUrl ??
      anyObj?.imagemUrl ??
      anyObj?.urlImagem ??
      anyObj?.urlLogo ??
      anyObj?.logoUrl ??
      anyObj?.imagem ??
      anyObj?.logo ??
      anyObj?.capa ??
      anyObj?.brasao ??
      null;

    if (typeof urlBruta !== 'string') return false;
    const valor = urlBruta.trim();
    if (!valor) return false;

    if (valor.startsWith('data:image')) {
      this.editalAtivoImagemUrlResolved = valor;
      return true;
    }

    if (/^https?:\/\//i.test(valor) || valor.startsWith('/')) {
      this.editalAtivoImagemUrlResolved = valor;
      return true;
    }

    this.editalAtivoImagemUrlResolved = `/${valor.replace(/^\/+/, '')}`;
    return true;
  }

  private definirImagemEditalPorBytes(anyObj: any): boolean {
    const bytes =
      anyObj?.editalImagemBytes ??
      anyObj?.imagemBytes ??
      anyObj?.imagem_bytes ??
      anyObj?.editalImagemBase64 ??
      anyObj?.imagemBase64 ??
      null;
    if (!bytes) return false;

    let base64: string | null = null;
    if (typeof bytes === 'string') {
      base64 = bytes.trim();
    } else if (Array.isArray(bytes)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes));
    } else if (Array.isArray(bytes?.data)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes.data));
    }
    if (!base64) return false;

    if (base64.startsWith('data:image')) {
      this.editalAtivoImagemUrlResolved = base64;
      return true;
    }

    const contentType = this.inferirContentTypeImagem(
      anyObj?.imagem ??
      anyObj?.logo ??
      anyObj?.editalImagemUrl ??
      anyObj?.imagemUrl
    );
    this.editalAtivoImagemUrlResolved = `data:${contentType};base64,${base64}`;
    return true;
  }

  private inferirContentTypeImagem(caminho?: string | null): string {
    const nome = String(caminho || '').toLowerCase();
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    if (nome.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private obterTemplateIdDoEdital(anyEdital: any): number | null {
    const templateId =
      anyEdital?.templateId ??
      anyEdital?.editalTemplateId ??
      anyEdital?.template?.id ??
      null;
    const idNum = Number(templateId);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }

  private carregarImagemEditalAtivoPorTemplate(templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.editalAtivoImagemObjectUrl = objectUrl;
          this.editalAtivoImagemUrlResolved = objectUrl;
          this.editalAtivoImagemTemplateId = templateId;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.editalAtivoImagemUrlResolved = `data:${tipo};base64,${payload.dados}`;
            this.editalAtivoImagemTemplateId = templateId;
          })
          .catch(() => {
            // mantém fallback da sigla
          });
      },
      error: () => {
        // mantém fallback da sigla
      }
    });
  }

  private async obterEditalPorIdOuNome(editalId: number, editalNome: string): Promise<Edital | null> {
    if (!this.editaisCache.length) {
      this.editaisCache = await new Promise<Edital[]>((resolve) => {
        this.editalService.listar().subscribe({
          next: (lista) => resolve(Array.isArray(lista) ? lista : []),
          error: () => resolve([])
        });
      });
    }

    if (editalId > 0) {
      const porId = this.editaisCache.find((e) => Number((e as any)?.id || 0) === editalId) || null;
      if (porId) return porId;
    }

    const nomeNormalizado = this.normalizarTexto(editalNome);
    if (!nomeNormalizado) return null;

    return this.editaisCache.find((e) => this.normalizarTexto((e as any)?.nome) === nomeNormalizado) || null;
  }

  private normalizarTexto(valor: unknown): string {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private lerBlobComoTexto(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  private parseImagemResponse(texto: string): { dados?: string; contentType?: any } | null {
    const raw = String(texto || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizarContentType(contentType: any): string {
    if (!contentType) return 'image/png';
    if (typeof contentType === 'string') return contentType;
    const type = contentType.type || contentType.mainType || 'image';
    const subtype = contentType.subtype || contentType.subType || 'png';
    return `${type}/${subtype}`;
  }

  private removerImagemEditalAtivo(): void {
    if (this.editalAtivoImagemObjectUrl) {
      URL.revokeObjectURL(this.editalAtivoImagemObjectUrl);
      this.editalAtivoImagemObjectUrl = null;
    }
    this.editalAtivoImagemUrlResolved = null;
    this.editalAtivoImagemTemplateId = null;
  }

  private labelModo(modo: string | null | undefined): string {
    const raw = String(modo || '').trim();
    if (!raw) return '-';
    if (raw.toUpperCase() === 'EXECUCAO_PLANO') return 'Execucao do plano';
    return raw;
  }

  private toInt(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  private resolverMensagemErro(err: HttpErrorResponse): string {
    const serverMessage = String(err?.error?.message || '').trim();
    if (serverMessage) return serverMessage;
    return 'Nao foi possivel carregar o plano diario.';
  }

  private getCategoriaNorm(item: any): string {
    return String(item?.categoria ?? item?.classificacao ?? '').trim().toUpperCase();
  }

  private isCritico(item: any): boolean {
    return this.getCategoriaNorm(item).includes('CRITICO');
  }

  private isEmRisco(item: any): boolean {
    const c = this.getCategoriaNorm(item);
    return c.includes('RISCO') && !c.includes('CRITICO');
  }

  private isManutencao(item: any): boolean {
    return this.getCategoriaNorm(item).includes('MANUT');
  }

  private isFraqueza(item: any): boolean {
    const c = this.getCategoriaNorm(item);
    return c.includes('ERRO') || c.includes('REINCIDENTE') || c.includes('FRAQUEZA') || c.includes('FRACO');
  }

  private matchFiltroSelecionado(item: PressaoFilaItemDTO): boolean {
    for (const filtro of this.filtrosSelecionados) {
      if (filtro === 'CRITICO' && this.isCritico(item)) return true;
      if (filtro === 'EM_RISCO' && this.isEmRisco(item)) return true;
      if (filtro === 'MANUTENCAO' && this.isManutencao(item)) return true;
    }
    return false;
  }

  getCategoriaLabel(item: any): string {
    if (this.isCritico(item)) return 'Crítico';
    if (this.isEmRisco(item)) return 'Em risco';
    if (this.getCategoriaNorm(item).includes('MANUTENCAO')) return 'Manutenção';
    return '—';
  }

  getClassificacaoBadgeClass(item: any): string {
    if (this.isCritico(item)) return 'classificacao-badge classificacao-badge--critico';
    if (this.isEmRisco(item)) return 'classificacao-badge classificacao-badge--risco';
    if (this.getCategoriaNorm(item).includes('MANUTENCAO')) return 'classificacao-badge classificacao-badge--manutencao';
    return 'classificacao-badge classificacao-badge--neutro';
  }

  formatProximaRevisao(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';

    const parsed = this.parseDateLocal(dateStr);
    if (!parsed) return String(dateStr);

    const now = new Date();
    const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTarget = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    const diffDays = Math.round((startTarget.getTime() - startNow.getTime()) / 86400000);

    if (diffDays === 0) {
      const hh = String(parsed.getHours()).padStart(2, '0');
      const mm = String(parsed.getMinutes()).padStart(2, '0');
      return `hoje ${hh}:${mm}`;
    }

    if (diffDays === 1) return 'amanhã';

    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const min = String(parsed.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
  }

  private parseDateLocal(raw: string): Date | null {
    const text = String(raw).trim();
    if (!text) return null;

    const direct = new Date(text);
    if (!Number.isNaN(direct.getTime())) return direct;

    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (dateOnly) {
      const y = Number(dateOnly[1]);
      const m = Number(dateOnly[2]) - 1;
      const d = Number(dateOnly[3]);
      return new Date(y, m, d, 0, 0, 0, 0);
    }

    return null;
  }

  private prepararPressaoLinha(dto: FocoPlanoDiarioDTO | null): void {
    const serie = this.extrairSeriePressao7d(dto);
    if (!serie.length) {
      this.pressaoLinhaData = null;
      return;
    }

    this.pressaoLinhaData = {
      labels: serie.map((ponto) => ponto.label),
      datasets: [
        {
          label: 'Pressão cognitiva',
          data: serie.map((ponto) => ponto.value),
          borderColor: '#334155',
          backgroundColor: 'rgba(51, 65, 85, 0.16)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 4,
          tension: 0.35,
          fill: true
        }
      ]
    };
  }

  private prepararDonut(dto: FocoPlanoDiarioDTO): void {
    const resumo = dto?.resumoAcionavel || {};
    const criticosMacro = this.toInt((resumo as any).criticos);
    const emRiscoMacro = this.toInt((resumo as any).emRisco);
    const manutencaoMacro =
      this.toInt((resumo as any).manutencaoHoje) + this.toInt((resumo as any).manutencaoVencida);

    this.donutData = {
      labels: ['Críticos', 'Em risco', 'Manutenção'],
      datasets: [
        {
          data: [criticosMacro, emRiscoMacro, manutencaoMacro],
          backgroundColor: ['#93c5fd', '#86efac', '#cbd5e1'],
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    };
  }

  private extrairSeriePressao7d(dto: FocoPlanoDiarioDTO | null | undefined): Array<{ label: string; value: number }> {
    const planoAny = dto as any;
    const fontes = [
      planoAny?.historicoPressao7d,
      planoAny?.focoOperacional?.historicoPressao7d,
      planoAny?.resumoAcionavel?.historicoPressao7d,
      planoAny?.focoOperacional?.pressao?.historico7d,
      planoAny?.resumoAcionavel?.pressaoHistorico7d
    ];
    const serieRaw = fontes.find((fonte) => Array.isArray(fonte));
    if (!Array.isArray(serieRaw) || !serieRaw.length) return [];

    return serieRaw
      .map((item: any, index: number) => {
        const label = String(item?.label ?? item?.dia ?? item?.data ?? `D${index + 1}`).trim();
        const rawValor =
          item?.value ??
          item?.risco ??
          item?.score ??
          item?.pressao ??
          item?.percentual ??
          item?.itens ??
          null;
        const value = this.toNullableRatio(rawValor);
        if (value === null) return null;
        return {
          label: label || `D${index + 1}`,
          value
        };
      })
      .filter((item): item is { label: string; value: number } => !!item)
      .slice(-7);
  }

  private get mediaDosScoresFila(): number | null {
    const scores = this.itensHoje
      .map((item) => this.toNullableRatio(item?.score))
      .filter((item): item is number => item !== null);
    if (!scores.length) return null;
    const media = scores.reduce((acc, valor) => acc + valor, 0) / scores.length;
    return this.clamp01(media);
  }

  private toNullableRatio(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return this.clamp01(n);
    if (n <= 100) return this.clamp01(n / 100);
    return null;
  }

  private parseNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (!text) return null;
    const normalized = text.replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  private toPercent(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n <= 1) return Math.round(this.clamp01(n) * 100);
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private normalizarExecucaoPlano(raw: any): FocoExecucaoPlanoDTO | null {
    if (!raw || typeof raw !== 'object') return null;
    return {
      materiaId: Number.isFinite(Number(raw?.materiaId)) ? Number(raw?.materiaId) : null,
      proximoTopicoId: Number.isFinite(Number(raw?.proximoTopicoId)) ? Number(raw?.proximoTopicoId) : null,
      proximoTopicoNome: String(raw?.proximoTopicoNome || '').trim() || null,
      proximoTopicoPaiNome: String(raw?.proximoTopicoPaiNome || '').trim() || null,
      topicoPaiNome: String(raw?.topicoPaiNome || '').trim() || null,
      criterio: String(raw?.criterio || '').trim() || null,
      materiaConcluida: raw?.materiaConcluida === true
    };
  }

  private normalizarMateriaNome(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }
}
