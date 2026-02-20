import { Component, HostListener, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, Subscription, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MateriaTopicosDTO, SalaEstudoService } from '../services/sala-estudo.service';
import { MateriaService } from '../services/materia.service';
import { EditalService  } from '../services/edital.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { Materia } from '../models/materia.model';
import { Edital } from '../models/Edital';
import { EditalTemplateDTO } from 'src/app/core/area-admin/dto/edital-admin.dto';
import { BlocosEstudoService } from '../services/blocos-estudo.service';
import { BlocoEstudoDTO, PlanoDoDiaDTO } from '../../dto/blocos-estudo.dto';
import { AuthService } from 'src/app/site/services/auth.service';
import { DashboardResumoService } from '../services/dashboard-resumo.service';
import {
  construirDataLocal,
  extrairStatusCanonicoRevisao,
  statusCanonicoParaDashboard
} from '../utils/revisao-status.util';
@Component({
  selector: 'app-dashboard-revisao',
  templateUrl: './dashboard-revisao.component.html',
  styleUrls: ['./dashboard-revisao.component.css']
})
export class DashboardRevisaoComponent implements OnInit, AfterViewInit, OnDestroy {

  carregando = false;
  erro?: string;

  revisoes: RevisaoDashboardItem[] = [];
  materias: Materia[] = [];
  materiasParaEstudoCount = 0;
  editais: Edital[] = [];
  activeEditais: Edital[] = [];
  mostrarGuia = false;

  templates: EditalTemplateDTO[] = [];
  templatesCarregando = false;
  templatesErro?: string;
  usandoTemplatesNaoPublicados = false;
  templateSelecionadoId: number | null = null;
  nomeEditalTemplate = '';
  nomeEditalPersonalizado = false;
  clonandoTemplate = false;
  mensagemTemplateOk?: string;
  templateImagemUrls: Record<number, string> = {};
  private templateImagemObjectUrls = new Map<number, string>();
  private materiaIdToEditalId = new Map<number, number>();

  usuarioNome = 'Usuário';
  editalAtivoNome = 'Nenhum edital selecionado';
  activeEditalImagemUrls: Record<number, string> = {};
  private activeEditalImagemObjectUrls = new Map<number, string>();
  modulosHoje = 1;
  revisoesHoje = 0;
  revisoesVencemHoje = 0;
  conteudoNovoSugerido = 'Direito Adm - Atos';
  sequenciaDias = 4;
  tempoSemana = '3h20';
  planoDisponivel = false;
  planoDoDia: PlanoDoDiaDTO | null = null;
  materiasDoDiaFallback: Array<{ materiaId: number; nome: string; ordem: number }> = [];
  private ordemTopicoPorId = new Map<number, number>();

  sugestaoCarregando = false;
  sugestaoEstudo: {
    origem: 'REVISAO_VENCIDA' | 'REVISAO_HOJE' | 'BLOCO_DIA';
    materiaId?: number;
    topicoId?: number;
    materiaNome?: string;
    topicoDescricao?: string;
    blocoNumero?: number;
  } | null = null;

  // totais para o resumo superior
  totalVencidas = 0;
  totalHoje = 0;
  totalFuturas = 0;
  materiasConcluidasNoPlanner: Array<{ materiaId: number; nome: string }> = [];
  planoAtaqueSemana: Array<{
    materiaId: number;
    materiaNome: string;
    nivelDominio: number;
    atrasadas: number;
    hoje: number;
    minutosSugeridos: number;
    filtroPreferido: 'atrasadas' | 'hoje' | 'emdia';
  }> = [];
  mostrarDialogDataProva = false;
  dataProvaInput = '';
  salvandoDataProva = false;
  private editalDataProvaAtual: Edital | null = null;
  private blocosSubscription?: Subscription;
  private tentativaAutoAtivarPadrao = false;
  private readonly revisaoAtivaDiaKeyPrefix = 'dashboard:revisao-ativa-dia:';

  constructor(
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private blocosEstudoService: BlocosEstudoService,
    private dashboardResumoService: DashboardResumoService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.toggleDashboardScroll(true);
    this.carregarUsuarioNome();
    this.carregarDados();
    this.blocosSubscription = this.blocosEstudoService.blocosChanged$
      .subscribe(() => this.carregarDados());
  }

  ngAfterViewInit(): void {
    this.desbloquearOverlaysInvisiveis();
    setTimeout(() => this.desbloquearOverlaysInvisiveis(), 250);
  }

  ngOnDestroy(): void {
    this.toggleDashboardScroll(false);
    this.limparImagensTemplates();
    this.limparImagensEditaisAtivos();
    this.blocosSubscription?.unsubscribe();
  }

  private carregarDados(): void {
    this.carregando = true;
    this.erro = undefined;

    this.dashboardResumoService.buscarResumo({
      lite: false,
      include: ['usuario', 'revisoes', 'materias', 'editais', 'planoDoDia', 'blocosResumo']
    }).subscribe({
      next: (resumo) => {
        const revisoesRaw = this.extrairRevisoesResumo(resumo);
        const materiasRaw = this.extrairMateriasResumo(resumo);
        const editaisRaw = this.extrairEditaisResumo(resumo);
        const planoRaw = (resumo as any)?.planoDoDia ?? (resumo as any)?.plano ?? null;
        const blocosRaw = ((resumo as any)?.blocosResumo ?? (resumo as any)?.blocos ?? []) as BlocoEstudoDTO[];
        const materiasParaEstudo = this.extrairMateriasParaOrdenacao(resumo, materiasRaw, editaisRaw);
        const nomeUsuario = (resumo as any)?.usuario?.nome;

        if (nomeUsuario) {
          this.usuarioNome = this.primeiroNome(nomeUsuario) || this.usuarioNome;
        }

        this.aplicarDadosDashboard(
          revisoesRaw,
          materiasRaw,
          materiasParaEstudo,
          editaisRaw,
          planoRaw,
          blocosRaw
        );
      },
      error: (err) => {
        console.warn('[DASH-REVISAO] Falha no endpoint agregado. Usando fallback legado.', err);
        this.carregarDadosLegado();
      }
    });
  }

  private carregarDadosLegado(): void {
    this.salaEstudoService.limparCacheRevisoesDashboard();
    forkJoin({
      revisoes: this.salaEstudoService.listarRevisoesDashboard(),
      materias: this.materiaService.listarMaterias(),
      materiasParaEstudo: this.salaEstudoService.listarMateriasParaEstudo('todas')
        .pipe(catchError(() => of([] as MateriaTopicosDTO[]))),
      editais: this.editalService.listarComInclude(['materias', 'topicos']).pipe(
        switchMap((lista) => this.hidratarEditaisParaDashboard(lista || []))
      ),
      plano: this.blocosEstudoService.planoDoDia().pipe(catchError(() => of(null))),
      blocos: this.blocosEstudoService.listarBlocos().pipe(catchError(() => of([] as BlocoEstudoDTO[])))
    }).subscribe({
      next: ({ revisoes, materias, materiasParaEstudo, editais, plano, blocos }) =>
        this.aplicarDadosDashboard(revisoes, materias, materiasParaEstudo, editais, plano, blocos),
      error: (err) => {
        console.error('[DASH-REVISAO] Erro ao carregar dados:', err);
        this.erro = 'Erro ao carregar seus dados.';
        this.carregando = false;
      }
    });
  }

  private aplicarDadosDashboard(
    revisoes: RevisaoDashboardItem[],
    materias: Materia[],
    materiasParaEstudo: MateriaTopicosDTO[],
    editais: Edital[],
    plano: PlanoDoDiaDTO | null,
    blocos: BlocoEstudoDTO[]
  ): void {
    console.log('[DASH-REVISAO] Editais recebidos:', editais);
    this.atualizarOrdemTopicos(materiasParaEstudo);
    const revisoesAtivas = this.filtrarRevisoesPorTopicosAtivos(revisoes || [], editais || []);
    this.revisoes = this.normalizarRevisoesDashboard(revisoesAtivas);
    this.materias = materias || [];
    this.materiasParaEstudoCount = this.contarMateriasParaEstudo(materiasParaEstudo);
    this.editais = editais || [];
    if (!this.tentativaAutoAtivarPadrao) {
      this.editalService.garantirEditalPadraoAtivo(this.editais).subscribe({
        next: (ativouPadrao) => {
          this.tentativaAutoAtivarPadrao = true;
          if (ativouPadrao) {
            this.carregarDados();
          }
        },
        error: () => {
          this.tentativaAutoAtivarPadrao = true;
        }
      });
    }
    console.log('[DASH-REVISAO] Editais ativos:', this.editais.filter(e => e?.ativo));
    this.rebuildMateriaEditalMap(this.editais);
    this.planoDoDia = plano;
    this.atualizarTotais();
    this.modulosHoje = plano?.blocoNumero ?? 1;
    this.atualizarEditalAtivoNome();
    this.atualizarMateriasConcluidasNoPlanner(blocos || []);
    this.atualizarPlanoAtaque();
    this.carregando = false;

    if (!this.editais.length || !this.materias.length) {
      this.carregarTemplates();
    }

    this.definirSugestaoEstudo();
    this.marcarHistoricoRevisoesDoDia();
    if (!plano?.materiasDoBloco?.length) {
      this.carregarMateriasDoBloco(plano?.blocoNumero ?? null, blocos);
    } else {
      this.materiasDoDiaFallback = [];
    }

    // Garante que o dashboard use a mesma fonte "fresca" da tela /revisoes.
    // O endpoint agregado pode chegar levemente defasado em alguns cenarios.
    this.reconciliarRevisoesDoDashboard();
  }

  private reconciliarRevisoesDoDashboard(): void {
    this.salaEstudoService.limparCacheRevisoesDashboard();
    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (revisoesDiretas) => {
        const revisoesAtivas = this.filtrarRevisoesPorTopicosAtivos(revisoesDiretas || [], this.editais || []);
        this.revisoes = this.normalizarRevisoesDashboard(revisoesAtivas);
        this.atualizarTotais();
        this.atualizarPlanoAtaque();
        this.definirSugestaoEstudo();
        this.marcarHistoricoRevisoesDoDia();
      },
      error: (err) => {
        console.warn('[DASH-REVISAO] Falha ao reconciliar revisoes do dashboard.', err);
      }
    });
  }

  private extrairRevisoesResumo(resumo: any): RevisaoDashboardItem[] {
    const revisoes = resumo?.revisoes;
    if (Array.isArray(revisoes)) return revisoes as RevisaoDashboardItem[];
    if (Array.isArray(revisoes?.itens)) return revisoes.itens as RevisaoDashboardItem[];
    if (Array.isArray(revisoes?.lista)) return revisoes.lista as RevisaoDashboardItem[];
    return [];
  }

  private extrairMateriasResumo(resumo: any): Materia[] {
    const materias = resumo?.materias;
    if (Array.isArray(materias)) return materias as Materia[];
    if (Array.isArray(materias?.itens)) return materias.itens as Materia[];
    if (Array.isArray(materias?.lista)) return materias.lista as Materia[];
    return [];
  }

  private extrairEditaisResumo(resumo: any): Edital[] {
    const editais = resumo?.editais;
    if (Array.isArray(editais)) return editais as Edital[];
    if (Array.isArray(editais?.itens)) return editais.itens as Edital[];
    if (Array.isArray(editais?.lista)) return editais.lista as Edital[];
    return [];
  }

  private extrairMateriasParaOrdenacao(
    resumo: any,
    materias: Materia[],
    editais: Edital[]
  ): MateriaTopicosDTO[] {
    const materiasResumo = resumo?.materias;
    const listaDireta =
      materiasResumo?.materiasParaEstudo ||
      materiasResumo?.paraEstudo ||
      materiasResumo?.materiasComTopicos;

    if (Array.isArray(listaDireta) && listaDireta.length) {
      return listaDireta as MateriaTopicosDTO[];
    }

    const materiasComTopicos = (materias || [])
      .map((m: any) => ({
        materiaId: Number(m?.id ?? m?.materiaId) || 0,
        materiaNome: m?.nome ?? m?.materiaNome ?? '',
        topicos: m?.topicos || []
      }))
      .filter((m: MateriaTopicosDTO) => m.materiaId > 0);

    if (materiasComTopicos.length) {
      return materiasComTopicos;
    }

    const mapa = new Map<number, MateriaTopicosDTO>();
    for (const edital of editais || []) {
      for (const materia of (edital as any)?.materias || []) {
        const materiaId = Number((materia as any)?.materiaId ?? (materia as any)?.id);
        if (!Number.isFinite(materiaId) || materiaId <= 0 || mapa.has(materiaId)) {
          continue;
        }
        mapa.set(materiaId, {
          materiaId,
          materiaNome: (materia as any)?.materiaNome ?? (materia as any)?.nome ?? `Materia ${materiaId}`,
          topicos: (materia as any)?.topicos || []
        });
      }
    }
    return Array.from(mapa.values());
  }

  private toggleDashboardScroll(ativo: boolean): void {
    if (typeof document === 'undefined') return;
    const className = 'dashboard-scroll';
    document.body.classList.toggle(className, ativo);
    document.documentElement.classList.toggle(className, ativo);
  }

  private desbloquearOverlaysInvisiveis(): void {
    if (typeof document === 'undefined') return;
    const selectors = [
      '.p-dialog-mask',
      '.p-overlaypanel',
      '.p-tooltip',
      '.p-sidebar-mask',
      '.p-dropdown-panel',
      '.p-multiselect-panel',
      '.p-datepicker',
      '.p-overlay',
      '[class*="overlay"]',
      '[class*="modal"]',
      '[class*="backdrop"]'
    ];
    const nodes = document.querySelectorAll<HTMLElement>(selectors.join(','));
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    nodes.forEach((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const invisivel =
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) < 0.2 ||
        rect.width <= 0 ||
        rect.height <= 0;
      const cobreTela =
        rect.width >= vw * 0.9 &&
        rect.height >= vh * 0.9 &&
        (style.position === 'fixed' || style.position === 'absolute');
      if (invisivel || cobreTela) {
        el.style.pointerEvents = 'none';
      }
    });
  }


  private contarMateriasParaEstudo(lista: MateriaTopicosDTO[] | null | undefined): number {
    const ids = new Set<number>();
    (lista || []).forEach((item) => {
      const id = Number(item?.materiaId);
      if (Number.isFinite(id) && id > 0) {
        ids.add(id);
      }
    });
    return ids.size;
  }

  get editalPrincipal(): Edital | null {
    return this.obterEditalPlano();
  }

  get kpiProgresso(): number {
    return Number(this.editalPrincipal?.percentualEstudadoGeral ?? 0) || 0;
  }

  get kpiDominio(): number {
    const dominio = Number(this.editalPrincipal?.nivelDominioGeral ?? 0) || 0;
    const progresso = Number(this.editalPrincipal?.percentualEstudadoGeral ?? 0) || 0;
    return Math.min(dominio, progresso);
  }

  get dataProvaLabel(): string {
    const edital = this.editalPrincipal;
    const data = this.obterDataProva(edital);
    if (!data) {
      return 'Definir data da prova';
    }
    return `Data da prova: ${this.formatData(data)} (editar)`;
  }

  dataProvaLabelPorEdital(edital: Edital): string {
    const data = this.obterDataProva(edital);
    if (!data) {
      return 'Definir data da prova';
    }
    return `Data da prova: ${this.formatData(data)} (editar)`;
  }

  getEditalProgresso(edital: Edital): number {
    return Number(edital?.percentualEstudadoGeral ?? 0) || 0;
  }

  getEditalDominio(edital: Edital): number {
    const dominio = Number(edital?.nivelDominioGeral ?? 0) || 0;
    const progresso = Number(edital?.percentualEstudadoGeral ?? 0) || 0;
    return Math.min(dominio, progresso);
  }

  getRevisoesVencidasEdital(edital: Edital): number {
    return this.getRevisoesPorStatusEdital(edital, 'VENCIDA');
  }

  getRevisoesHojeEdital(edital: Edital): number {
    return this.getRevisoesPorStatusEdital(edital, 'EM_DIA');
  }

  get revisoesPrioritariasVisiveis(): RevisaoDashboardItem[] {
    const ordenadas = this.revisoesPrioritariasFiltradas;
    const visiveis: RevisaoDashboardItem[] = [];
    const editaisUsados = new Set<number>();
    const materiasUsadas = new Set<number>();
    const chavesUsadas = new Set<string>();

    for (const item of ordenadas) {
      if (visiveis.length >= 5) break;
      const editalId = this.getEditalIdForMateria(item.materiaId);
      if (editalId && !editaisUsados.has(editalId)) {
        visiveis.push(item);
        editaisUsados.add(editalId);
        materiasUsadas.add(item.materiaId);
        chavesUsadas.add(`${item.materiaId}-${item.topicoId}`);
      }
    }

    for (const item of ordenadas) {
      if (visiveis.length >= 5) break;
      if (!materiasUsadas.has(item.materiaId)) {
        visiveis.push(item);
        materiasUsadas.add(item.materiaId);
        chavesUsadas.add(`${item.materiaId}-${item.topicoId}`);
      }
    }

    if (visiveis.length < 5) {
      for (const item of ordenadas) {
        if (visiveis.length >= 5) break;
        const chave = `${item.materiaId}-${item.topicoId}`;
        if (chavesUsadas.has(chave)) continue;
        visiveis.push(item);
        chavesUsadas.add(chave);
      }
    }

    return visiveis;
  }

  get isPrimeiroAcesso(): boolean {
    return !this.revisoes.length && !(this.materiasParaEstudoCount && this.editais.length);
  }

  get mostrarPlanoAtaque(): boolean {
    return !!this.planoAtaqueSemana.length && !this.isPrimeiroAcesso;
  }

  get revisoesPrioritariasTotal(): number {
    return this.revisoesPrioritariasFiltradas.length;
  }

  get moduloHojeLabel(): number {
    const blocoNumero = Number(this.planoDoDia?.blocoNumero ?? this.modulosHoje ?? 1) || 1;
    return (blocoNumero % 7) + 1;
  }

  get tempoEstimadoRevisoesLabel(): string {
    const itens = this.revisoesPrioritariasFiltradas;
    if (!itens.length) return '--';
    const totalMin = itens.reduce((acc, item) => acc + this.getMinutosRevisao(item), 0);
    return this.formatarMinutos(totalMin);
  }

  get deveMostrarParabensRevisao(): boolean {
    return !this.revisoesPrioritariasTotal && this.jaTeveRevisaoPendenteHoje();
  }

  get mensagemSemRevisoesCard(): string {
    if (this.deveMostrarParabensRevisao) {
      return 'Parabéns! Revisões do dia concluídas. Excelente consistência.';
    }
    return 'Sem revisões hoje. Vamos avançar no estudo.';
  }

  get revisoesPrioritariasAgrupadas(): { materiaId: number; materiaNome: string; itens: RevisaoDashboardItem[] }[] {
    const itens = this.revisoesPrioritariasVisiveis;
    const grupos: { materiaId: number; materiaNome: string; itens: RevisaoDashboardItem[] }[] = [];
    const indicePorMateria = new Map<number, number>();

    for (const item of itens) {
      const index = indicePorMateria.get(item.materiaId);
      if (index === undefined) {
        indicePorMateria.set(item.materiaId, grupos.length);
        grupos.push({ materiaId: item.materiaId, materiaNome: item.materiaNome, itens: [item] });
      } else {
        grupos[index].itens.push(item);
      }
    }

    return grupos;
  }

  private get revisoesPrioritariasFiltradas(): RevisaoDashboardItem[] {
    return this.revisoesPrioritariasOrdenadas
      .filter((item) => item.status === 'VENCIDA' || item.status === 'EM_DIA');
  }

  get proximaMateriaEstudo(): { materiaId: number; nome: string; ordem: number } | null {
    return this.materiasDoDiaOrdenadas.length ? this.materiasDoDiaOrdenadas[0] : null;
  }

  private carregarUsuarioNome(): void {
    const nomeToken = this.authService.getUserNameFromToken() || '';
    this.usuarioNome = this.primeiroNome(nomeToken) || this.usuarioNome;
  }

  private primeiroNome(nomeCompleto: string): string {
    const nome = (nomeCompleto || '').trim();
    if (!nome) return '';
    return nome.split(/\s+/)[0] || '';
  }

  private atualizarTotais(): void {
    const vencidas = this.revisoes.filter(r => r.status === 'VENCIDA').length;
    const vencemHoje = this.revisoes.filter(r => r.status === 'EM_DIA').length;
    const futuras = this.revisoes.filter(r => r.status === 'FUTURA').length;

    this.totalVencidas = vencidas;
    this.totalHoje = vencemHoje;
    this.totalFuturas = futuras;

    this.revisoesHoje = vencidas + vencemHoje;
    this.revisoesVencemHoje = vencemHoje;

    console.log('[DASHBOARD] Totais revisoes:', {
      total: this.revisoes.length,
      vencidas,
      emDia: vencemHoje,
      futuras,
      revisoesHoje: this.revisoesHoje
    });
  }

  private getRevisoesPorStatusEdital(edital: Edital, status: RevisaoDashboardItem['status']): number {
    const materiaIds = this.getMateriaIdsEdital(edital);
    const materiaNomes = this.getMateriaNomesEdital(edital);
    if (!materiaIds.size && !materiaNomes.size) return 0;

    return this.revisoes.filter((r) => {
      if (r.status !== status) return false;
      const idMateriaRevisao = Number((r as any)?.materiaId);
      if (Number.isFinite(idMateriaRevisao) && idMateriaRevisao > 0 && materiaIds.has(idMateriaRevisao)) {
        return true;
      }
      const nomeMateriaRevisao = this.normalizarNomeMateria((r as any)?.materiaNome);
      return !!nomeMateriaRevisao && materiaNomes.has(nomeMateriaRevisao);
    }).length;
  }

  private getMateriaIdsEdital(edital: Edital): Set<number> {
    const ids = (edital?.materias || [])
      .map((m: any) => Number(m?.materiaId ?? m?.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    return new Set(ids);
  }

  private getMateriaNomesEdital(edital: Edital): Set<string> {
    const nomes = (edital?.materias || [])
      .map((m: any) => this.normalizarNomeMateria(m?.materiaNome ?? m?.nome))
      .filter((nome: string) => !!nome);
    return new Set(nomes);
  }

  private normalizarNomeMateria(nome: string | null | undefined): string {
    return String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private rebuildMateriaEditalMap(editais: Edital[]): void {
    this.materiaIdToEditalId.clear();
    const ativos = (editais || []).filter((e) => e?.ativo);
    for (const edital of ativos) {
      const editalId = Number((edital as any)?.id);
      if (!editalId) continue;
      for (const materia of (edital as any)?.materias || []) {
        const materiaId = Number((materia as any)?.materiaId ?? (materia as any)?.id);
        if (Number.isFinite(materiaId) && materiaId > 0 && !this.materiaIdToEditalId.has(materiaId)) {
          this.materiaIdToEditalId.set(materiaId, editalId);
        }
      }
    }
  }

  private getEditalIdForMateria(materiaId: number): number | null {
    return this.materiaIdToEditalId.get(materiaId) ?? null;
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  formatData(iso?: string | null): string {
    if (!iso) {
      return '-';
    }

    const partes = iso.split('-');
    if (partes.length !== 3) {
      return iso;
    }

    const ano = partes[0];
    const mes = partes[1];
    const dia = partes[2];

    return `${dia}/${mes}/${ano}`;
  }

  formatarMinutos(totalMinutos: number): string {
    const minutos = Math.max(0, Math.round(totalMinutos));
    if (minutos >= 60) {
      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;
      return resto ? `${horas}h ${resto}min` : `${horas}h`;
    }
    return `${minutos} min`;
  }

  formatDataOuIndefinida(iso?: string | null): string {
    const valor = this.formatData(iso);
    return valor && valor !== '-' ? valor : 'indefinida';
  }

  private atualizarEditalAtivoNome(): void {
    const ativos = (this.editais || []).filter(e => e?.ativo && e?.id);
    this.activeEditais = ativos;
    if (!ativos.length) {
      this.editalAtivoNome = 'Nenhum edital selecionado';
      this.limparImagensEditaisAtivos();
      return;
    }

    const nomes = ativos.map(e => e.nome).filter(Boolean);
    this.editalAtivoNome = nomes.length ? nomes.join(' / ') : 'Edital selecionado';
    console.log('[DASH-REVISAO] Editais ativos:', ativos.map(e => ({
      id: e.id,
      nome: e.nome,
      imagem: (e as any)?.imagem ?? null,
      imagemBytesTipo: typeof (e as any)?.imagemBytes,
      imagemBytesTamanho: Array.isArray((e as any)?.imagemBytes)
        ? (e as any).imagemBytes.length
        : ((e as any)?.imagemBytes?.length || null)
    })));
    this.carregarImagensEditaisAtivos();
  }

  get textoMateriasConcluidasNoPlanner(): string {
    const nomes = this.materiasConcluidasNoPlanner.map(m => m.nome).filter(Boolean);
    if (!nomes.length) return '';
    const primeiras = nomes.slice(0, 2);
    const restante = nomes.length - primeiras.length;
    const base = primeiras.join(', ');
    return restante > 0 ? `${base} e mais ${restante}` : base;
  }

  get editaisAtivosVisiveis(): Edital[] {
    return (this.activeEditais || []).slice(0, 3);
  }

  get editaisAtivosRestantes(): number {
    return Math.max(0, (this.activeEditais?.length || 0) - 3);
  }

  private carregarImagensEditaisAtivos(): void {
    this.removerImagensEditaisInativos();
    for (const edital of this.activeEditais || []) {
      if (!edital?.id) continue;
      if (this.activeEditalImagemUrls[edital.id]) {
        continue;
      }
      if (this.definirImagemEditalAtivoPorBytes(edital)) {
        continue;
      }

      const templateId = this.obterTemplateIdDoEdital(edital);
      if (!templateId) continue;
      this.carregarImagemEditalAtivo(edital.id, templateId);
    }
  }

  private removerImagensEditaisInativos(): void {
    const idsAtivos = new Set((this.activeEditais || []).map((e) => e?.id).filter((id): id is number => !!id));
    for (const [editalId, objectUrl] of this.activeEditalImagemObjectUrls.entries()) {
      if (!idsAtivos.has(editalId)) {
        URL.revokeObjectURL(objectUrl);
        this.activeEditalImagemObjectUrls.delete(editalId);
        delete this.activeEditalImagemUrls[editalId];
      }
    }
    Object.keys(this.activeEditalImagemUrls).forEach((idStr) => {
      const id = Number(idStr);
      if (!idsAtivos.has(id)) {
        delete this.activeEditalImagemUrls[id];
      }
    });
  }

  private obterTemplateIdDoEdital(edital: Edital): number | null {
    const anyEdital = edital as any;
    const templateId =
      anyEdital?.templateId ??
      anyEdital?.editalTemplateId ??
      anyEdital?.template?.id ??
      null;
    const idNum = Number(templateId);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }

  private carregarImagemEditalAtivo(editalId: number, templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        this.removerImagemEditalAtivo(editalId);

        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.activeEditalImagemObjectUrls.set(editalId, objectUrl);
          this.activeEditalImagemUrls[editalId] = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.activeEditalImagemUrls[editalId] = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.removerImagemEditalAtivo(editalId);
          });
      },
      error: () => {
        this.removerImagemEditalAtivo(editalId);
      }
    });
  }

  private definirImagemEditalAtivoPorBytes(edital: Edital): boolean {
    const anyEdital = edital as any;
    const bytes =
      anyEdital?.imagemBytes ??
      anyEdital?.imagem_bytes ??
      anyEdital?.imagemBase64 ??
      null;
    if (!bytes || !edital?.id) {
      return false;
    }

    let base64: string | null = null;
    if (typeof bytes === 'string') {
      base64 = bytes.trim();
    } else if (Array.isArray(bytes)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes));
    } else if (Array.isArray(bytes?.data)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes.data));
    }

    if (!base64) {
      return false;
    }

    if (base64.startsWith('data:image')) {
      this.activeEditalImagemUrls[edital.id] = base64;
      return true;
    }

    const contentType = this.inferirContentTypeImagem(anyEdital?.imagem);
    this.activeEditalImagemUrls[edital.id] = `data:${contentType};base64,${base64}`;
    return true;
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

  private inferirContentTypeImagem(caminho?: string | null): string {
    const nome = (caminho || '').toLowerCase();
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    if (nome.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
  }

  onEditalAtivoImagemErro(editalId: number): void {
    this.removerImagemEditalAtivo(editalId);
  }

  private removerImagemEditalAtivo(editalId: number): void {
    const objectUrl = this.activeEditalImagemObjectUrls.get(editalId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.activeEditalImagemObjectUrls.delete(editalId);
    }
    delete this.activeEditalImagemUrls[editalId];
  }

  private limparImagensEditaisAtivos(): void {
    for (const objectUrl of this.activeEditalImagemObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.activeEditalImagemObjectUrls.clear();
    this.activeEditalImagemUrls = {};
  }

  irParaSala(item: RevisaoDashboardItem): void {
    const queryParams: any = {};
    if (item?.topicoId) {
      queryParams.topicoId = item.topicoId;
    }
    if (item?.status === 'VENCIDA' || item?.status === 'EM_DIA') {
      queryParams.modo = 'revisao';
    }
    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams }
    );
  }

  irParaSalaRevisao(item: RevisaoDashboardItem): void {
    if (!item?.materiaId) return;
    const queryParams: any = { modo: 'revisao' };
    if (item.topicoId) {
      queryParams.topicoId = item.topicoId;
    }
    this.router.navigate(['/area-restrita/sala-estudo', item.materiaId], { queryParams });
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentoPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    const topic = target?.closest?.('.hero-next-topic');
    if (topic) {
      const materiaId = Number((topic as HTMLElement).dataset?.['materiaId']);
      const topicoId = Number((topic as HTMLElement).dataset?.['topicoId']);
      if (Number.isFinite(materiaId) && materiaId > 0) {
        const queryParams: any = { modo: 'revisao' };
        if (Number.isFinite(topicoId) && topicoId > 0) {
          queryParams.topicoId = topicoId;
        }
        this.router.navigate(['/area-restrita/sala-estudo', materiaId], { queryParams });
      }
    }
  }

  irParaFilaRevisoes(filtro: 'atrasadas' | 'hoje' | 'emdia', materiaId?: number): void {
    const queryParams: any = { modo: 'revisao', filtro };
    if (materiaId) {
      queryParams.materiaId = materiaId;
    }
    this.router.navigate(['/area-restrita/revisoes'], { queryParams });
  }

  irParaSalaSugestao(): void {
    if (!this.sugestaoEstudo?.materiaId) return;
    const queryParams: any = {};
    if (this.sugestaoEstudo.topicoId) {
      queryParams.topicoId = this.sugestaoEstudo.topicoId;
    }
    if (this.sugestaoEstudo.origem !== 'BLOCO_DIA') {
      queryParams.modo = 'revisao';
    }
    this.router.navigate(
      ['/area-restrita/sala-estudo', this.sugestaoEstudo.materiaId],
      { queryParams }
    );
  }
  irParaEditais(): void {
    this.router.navigate(['/area-restrita/editais']);
  }

  comecarAgora(): void {
    if (this.totalVencidas > 0) {
      this.irParaFilaRevisoes('atrasadas');
      return;
    }
    if (this.totalHoje > 0) {
      this.irParaFilaRevisoes('hoje');
      return;
    }
    this.comecarEstudoProximo();
  }

  iniciarRevisao(): void {
    const item = this.revisoesPrioritariasFiltradas[0];
    if (item) {
      this.irParaSala(item);
      return;
    }
    this.irParaFilaRevisoes('hoje');
  }

  verMaisRevisoes(): void {
    if (this.totalVencidas > 0) {
      this.irParaFilaRevisoes('atrasadas');
      return;
    }
    this.irParaFilaRevisoes('hoje');
  }

  comecarEstudoProximo(): void {
    const proxima = this.proximaMateriaEstudo;
    if (proxima?.materiaId) {
      this.irParaSalaMateriaProximo(proxima.materiaId);
      return;
    }
    const primeiroId = this.materias?.[0]?.id;
    if (primeiroId) {
      this.irParaSalaMateriaProximo(primeiroId);
      return;
    }
    this.router.navigate(['/area-restrita/cad-materias']);
  }

  irParaSalaMateria(materiaId: number): void {
    if (!materiaId) return;
    this.router.navigate(['/area-restrita/sala-estudo', materiaId]);
  }

  irParaSalaMateriaProximo(materiaId: number): void {
    if (!materiaId) return;
    this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
      queryParams: { modo: 'estudar' }
    });
  }

  private hidratarEditaisParaDashboard(editais: Edital[]): Observable<Edital[]> {
    const lista = editais || [];
    const consultas = lista.map((edital) => {
      const id = Number((edital as any)?.id);
      const materias = (edital as any)?.materias;
      const jaTemMaterias = Array.isArray(materias) && materias.length > 0;

      if (!id || jaTemMaterias) {
        return of(edital);
      }

      return this.editalService.buscarPorId(id).pipe(
        map((detalhe) => ({
          ...edital,
          ...detalhe,
          materias: Array.isArray((detalhe as any)?.materias) ? (detalhe as any).materias : (edital as any)?.materias || []
        })),
        catchError(() => of(edital))
      );
    });

    return consultas.length ? forkJoin(consultas) : of(lista);
  }

  private marcarHistoricoRevisoesDoDia(): void {
    if (typeof localStorage === 'undefined') return;
    if (this.revisoesPrioritariasTotal > 0) {
      localStorage.setItem(this.getRevisaoAtivaDiaKey(), '1');
    }
  }

  private jaTeveRevisaoPendenteHoje(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(this.getRevisaoAtivaDiaKey()) === '1';
  }

  private getRevisaoAtivaDiaKey(): string {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd = String(hoje.getDate()).padStart(2, '0');
    return `${this.revisaoAtivaDiaKeyPrefix}${yyyy}-${mm}-${dd}`;
  }

  irParaBlocosEstudo(): void {
    this.router.navigate(['/area-restrita/blocos-estudo']);
  }

  abrirModalDataProva(edital?: Edital): void {
    const alvo = edital ?? this.editalPrincipal;
    this.editalDataProvaAtual = alvo ?? null;
    const data = this.obterDataProva(alvo ?? null);
    this.dataProvaInput = data || '';
    this.mostrarDialogDataProva = true;
  }

  fecharModalDataProva(): void {
    this.mostrarDialogDataProva = false;
    this.editalDataProvaAtual = null;
  }

  salvarDataProva(): void {
    const edital = this.editalDataProvaAtual ?? this.editalPrincipal;
    if (!this.dataProvaInput) {
      if (edital) {
        this.salvarDataProvaLocal(edital, null);
      }
      this.mostrarDialogDataProva = false;
      this.editalDataProvaAtual = null;
      return;
    }
    if (!edital || !edital.id) {
      if (edital) {
        this.salvarDataProvaLocal(edital, this.dataProvaInput);
      }
      this.mostrarDialogDataProva = false;
      this.editalDataProvaAtual = null;
      return;
    }

    const materiasIds = (edital.materias || []).map((m) => m.materiaId).filter((id) => Number.isFinite(id));
    if (!edital.nome || !materiasIds.length) {
      this.salvarDataProvaLocal(edital, this.dataProvaInput);
      this.mostrarDialogDataProva = false;
      this.editalDataProvaAtual = null;
      return;
    }

    this.salvandoDataProva = true;
    this.editalService.atualizar(edital.id, {
      nome: edital.nome,
      descricao: edital.descricao ?? null,
      dataProva: this.dataProvaInput,
      materiasIds
    }).subscribe({
      next: (atualizado) => {
        edital.dataProva = atualizado?.dataProva ?? this.dataProvaInput;
        this.removerDataProvaLocal(edital);
        this.salvandoDataProva = false;
        this.mostrarDialogDataProva = false;
        this.editalDataProvaAtual = null;
      },
      error: () => {
        this.salvarDataProvaLocal(edital, this.dataProvaInput);
        this.salvandoDataProva = false;
        this.mostrarDialogDataProva = false;
        this.editalDataProvaAtual = null;
      }
    });
  }

  getMinutosRevisao(item: RevisaoDashboardItem): number {
    const qtd = Number(item.qtdPendentes ?? 0) || 0;
    const mediaSeg = this.getMediaRevisaoSegundos();
    const baseSeg = mediaSeg ?? 360;
    const totalSeg = qtd > 0 ? baseSeg * qtd : baseSeg;
    return Math.max(1, Math.round(totalSeg / 60));
  }

  getJustificativaPlano(item: { atrasadas: number; hoje: number; nivelDominio: number }): string {
    if (item.atrasadas > 0) {
      return 'Recuperação (revisões vencidas)';
    }
    if (item.hoje > 0) {
      return 'Manutenção (revisões hoje)';
    }
    if (item.nivelDominio <= 30) {
      return 'Ponto fraco (dominio baixo)';
    }
    return 'Progresso';
  }

  getEditalCargo(edital: Edital): string {
    return String((edital as any)?.cargo || '').trim();
  }

  getSiglaEdital(nome?: string | null): string {
    const texto = String(nome || '').trim();
    if (!texto) {
      return '-';
    }

    const ignorar = new Set([
      'de', 'da', 'do', 'das', 'dos',
      'e', 'em', 'no', 'na', 'nos', 'nas',
      'por', 'para', 'ao', 'a', 'o'
    ]);

    const partes = texto
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const sigla = partes
      .filter((p) => !ignorar.has(p.toLowerCase()))
      .map((p) => p[0])
      .join('');

    if (sigla) {
      return sigla.toUpperCase();
    }

    return texto[0].toUpperCase();
  }

  abrirGuia(): void {
    this.mostrarGuia = true;
  }

  fecharGuia(): void {
    this.mostrarGuia = false;
  }

  // =========================
  // TEMPLATES DE EDITAL (ONBOARDING)
  // =========================

  carregarTemplates(): void {
    if (this.templatesCarregando) return;

    this.templatesCarregando = true;
    this.templatesErro = undefined;
    this.mensagemTemplateOk = undefined;

    this.editalTemplateService.listarTemplates().subscribe({
      next: (lista) => {
        const all = lista || [];
        const publicados = all.filter(t => t.publicado);

        this.usandoTemplatesNaoPublicados = all.some(t => !t.publicado);
        this.templates = publicados;
        this.templatesCarregando = false;

        if (!this.templateSelecionadoId && this.templates.length) {
          const first = this.templates[0];
          this.templateSelecionadoId = first.id;
          this.nomeEditalTemplate = first.nome || '';
          this.nomeEditalPersonalizado = false;
        }

        this.limparImagensTemplates();
        this.carregarImagensTemplates(this.templates);
      },
      error: (err) => {
        console.error('[DASH-TEMPLATES] Erro ao carregar templates:', err);
        this.templatesErro = 'Não foi possível carregar os templates.';
        this.templatesCarregando = false;
      }
    });
  }

  selecionarTemplate(template: EditalTemplateDTO): void {
    this.templateSelecionadoId = template.id;

    if (!this.nomeEditalPersonalizado) {
      this.nomeEditalTemplate = template.nome || '';
    }
  }

  onNomeEditalTemplateChange(): void {
    this.nomeEditalPersonalizado = true;
  }

  clonarTemplateSelecionado(): void {
    if (!this.templateSelecionadoId) {
      this.templatesErro = 'Selecione um template antes de continuar.';
      return;
    }

    this.clonandoTemplate = true;
    this.templatesErro = undefined;
    this.mensagemTemplateOk = undefined;

    const nomeEdital = this.nomeEditalTemplate?.trim() || undefined;

    this.editalTemplateService.clonarTemplate(this.templateSelecionadoId, { nomeEdital }).subscribe({
      next: () => {
        this.clonandoTemplate = false;
        this.mensagemTemplateOk = 'Edital criado com sucesso.';
        this.nomeEditalTemplate = '';
        this.nomeEditalPersonalizado = false;
        this.templateSelecionadoId = null;
        this.materiaService.notificarMateriasAlteradas();
        this.carregarDados();
      },
      error: (err) => {
        console.error('[DASH-TEMPLATES] Erro ao clonar template:', err);
        this.templatesErro = 'Não foi possível criar o edital pelo template.';
        this.clonandoTemplate = false;
      }
    });
  }

  private carregarImagensTemplates(templates: EditalTemplateDTO[]): void {
    for (const t of templates || []) {
      if (!t?.id) continue;
      if (this.templateImagemUrls[t.id]) {
        continue;
      }
      this.carregarImagemTemplate(t.id);
    }
  }

  private carregarImagemTemplate(templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        this.removerImagemTemplate(templateId);

        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.templateImagemObjectUrls.set(templateId, objectUrl);
          this.templateImagemUrls[templateId] = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.templateImagemUrls[templateId] = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.removerImagemTemplate(templateId);
          });
      },
      error: () => {
        this.removerImagemTemplate(templateId);
      }
    });
  }

  onTemplateImagemErro(templateId: number): void {
    this.removerImagemTemplate(templateId);
  }

  private removerImagemTemplate(templateId: number): void {
    const objectUrl = this.templateImagemObjectUrls.get(templateId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.templateImagemObjectUrls.delete(templateId);
    }
    delete this.templateImagemUrls[templateId];
  }

  private limparImagensTemplates(): void {
    for (const objectUrl of this.templateImagemObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.templateImagemObjectUrls.clear();
    this.templateImagemUrls = {};
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
    const raw = (texto || '').trim();
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

  private definirSugestaoEstudo(): void {
    this.sugestaoCarregando = true;

    const revisaoVencida = this.obterRevisaoPrioritaria('VENCIDA');
    if (revisaoVencida) {
      this.sugestaoEstudo = {
        origem: 'REVISAO_VENCIDA',
        materiaId: revisaoVencida.materiaId,
        topicoId: revisaoVencida.topicoId,
        materiaNome: revisaoVencida.materiaNome,
        topicoDescricao: revisaoVencida.topicoDescricao
      };
      this.sugestaoCarregando = false;
      return;
    }

    const revisaoHoje = this.obterRevisaoPrioritaria('EM_DIA');
    if (revisaoHoje) {
      this.sugestaoEstudo = {
        origem: 'REVISAO_HOJE',
        materiaId: revisaoHoje.materiaId,
        topicoId: revisaoHoje.topicoId,
        materiaNome: revisaoHoje.materiaNome,
        topicoDescricao: revisaoHoje.topicoDescricao
      };
      this.sugestaoCarregando = false;
      return;
    }

    const materiasPlano = this.ordenarMateriasPlano(this.planoDoDia?.materiasDoBloco || []);
    if (!materiasPlano.length) {
      this.sugestaoEstudo = null;
      this.sugestaoCarregando = false;
      return;
    }

    const materiaDoDia = materiasPlano[0];
    this.materiaService.listarTopicos(materiaDoDia.materiaId).subscribe({
      next: (topicos) => {
        const todosTopicos = this.ordenarTopicosPorDataCriacao(
          this.flattenTopicos(topicos || [])
        );
        const revisados = new Set(
          (this.revisoes || [])
            .map(r => r.topicoId)
            .filter((id): id is number => Number.isFinite(id))
        );
        const topicoEscolhido =
          todosTopicos.find(t => t?.id && !revisados.has(t.id)) || todosTopicos[0];

        this.sugestaoEstudo = {
          origem: 'BLOCO_DIA',
          materiaId: materiaDoDia.materiaId,
          materiaNome: materiaDoDia.nome,
          topicoId: topicoEscolhido?.id,
          topicoDescricao: topicoEscolhido?.descricao,
          blocoNumero: this.planoDoDia?.blocoNumero
        };
        this.sugestaoCarregando = false;
      },
      error: () => {
        this.sugestaoEstudo = {
          origem: 'BLOCO_DIA',
          materiaId: materiaDoDia.materiaId,
          materiaNome: materiaDoDia.nome,
          blocoNumero: this.planoDoDia?.blocoNumero
        };
        this.sugestaoCarregando = false;
      }
    });
  }

  get materiasDoDiaOrdenadas(): Array<{ materiaId: number; nome: string; ordem: number }> {
    const planoOrdenado = this.ordenarMateriasPlano(this.planoDoDia?.materiasDoBloco || []);
    if (planoOrdenado.length) {
      return planoOrdenado;
    }
    return this.materiasDoDiaFallback;
  }

  get revisoesVencidasOrdenadas(): RevisaoDashboardItem[] {
    return [...(this.revisoes || [])]
      .filter(r => r.status === 'VENCIDA')
      .sort((a, b) => this.compararDatasIso(a.dataProximaRevisao, b.dataProximaRevisao));
  }

  get revisoesPrioritariasOrdenadas(): RevisaoDashboardItem[] {
    return [...(this.revisoes || [])]
      .filter(r => r.status === 'VENCIDA' || r.status === 'EM_DIA')
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'VENCIDA' ? -1 : 1;
        }
        const ordem = this.compararOrdemTopico(a, b);
        if (ordem !== 0) {
          return ordem;
        }
        return this.compararDatasIso(a.dataProximaRevisao, b.dataProximaRevisao);
      });
  }

  private carregarMateriasDoBloco(blocoNumero: number | null, blocos?: BlocoEstudoDTO[] | null): void {
    if (!blocoNumero) {
      this.materiasDoDiaFallback = [];
      return;
    }

    const listaBlocos = blocos || [];
    if (listaBlocos.length) {
      this.preencherMateriasDoBloco(listaBlocos, blocoNumero);
      return;
    }

    this.blocosEstudoService.listarBlocos().subscribe({
      next: (lista) => {
        this.preencherMateriasDoBloco(lista || [], blocoNumero);
      },
      error: () => {
        this.materiasDoDiaFallback = [];
      }
    });
  }

  private preencherMateriasDoBloco(blocos: BlocoEstudoDTO[], blocoNumero: number): void {
    const bloco = (blocos || []).find((b) => b.numero === blocoNumero);
    if (!bloco?.itens?.length) {
      this.materiasDoDiaFallback = [];
      return;
    }

    const nomePorId = new Map<number, string>(
      (this.materias || [])
        .filter((m): m is Materia & { id: number } => m?.id != null)
        .map((m) => [m.id, m.nome])
    );

    const itensOrdenados = [...bloco.itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    this.materiasDoDiaFallback = itensOrdenados.map((item, index) => ({
      materiaId: item.materiaEstudoId,
      nome: item.materiaNome || nomePorId.get(item.materiaEstudoId) || `Materia ${item.materiaEstudoId}`,
      ordem: item.ordem ?? index + 1
    }));
  }

  private atualizarMateriasConcluidasNoPlanner(blocos: BlocoEstudoDTO[]): void {
    const concluidas = new Map<number, string>();
    const editaisAtivos = (this.editais || []).filter(e => e?.ativo);

    for (const edital of editaisAtivos) {
      for (const m of edital.materias || []) {
        if ((m.percentualEstudado ?? 0) >= 100) {
          concluidas.set(m.materiaId, m.materiaNome || `Materia ${m.materiaId}`);
        }
      }
    }

    if (!concluidas.size) {
      this.materiasConcluidasNoPlanner = [];
      return;
    }

    const idsPlanner = new Set<number>();
    for (const bloco of blocos || []) {
      for (const item of bloco.itens || []) {
        if (item.materiaEstudoId != null) {
          idsPlanner.add(item.materiaEstudoId);
        }
      }
    }

    this.materiasConcluidasNoPlanner = Array.from(concluidas.entries())
      .filter(([id]) => idsPlanner.has(id))
      .map(([materiaId, nome]) => ({ materiaId, nome }));
  }

  private filtrarRevisoesPorTopicosAtivos(
    revisoes: RevisaoDashboardItem[],
    editais: Edital[]
  ): RevisaoDashboardItem[] {
    const editaisAtivos = (editais || []).filter((e) => e?.ativo);
    if (!editaisAtivos.length) return revisoes;

    const statusPorTopico = new Map<number, boolean>();
    for (const edital of editaisAtivos) {
      for (const materia of edital.materias || []) {
        const topicos = this.flattenTopicos(materia.topicos || []);
        for (const topico of topicos) {
          const id =
            Number(
              (topico as any).id ??
                (topico as any).topicoId ??
                (topico as any).idTopico ??
                (topico as any).subtopicoId ??
                (topico as any).idSubtopico
            ) || null;
          if (!id) continue;
          const ativo = (topico as any).ativo !== false;
          if (ativo) {
            statusPorTopico.set(id, true);
            continue;
          }
          if (!statusPorTopico.has(id)) {
            statusPorTopico.set(id, false);
          }
        }
      }
    }

    if (!statusPorTopico.size) return revisoes;

    return (revisoes || []).filter((item) => {
      const topicoId = item?.topicoId;
      if (!topicoId) return true;
      const status = statusPorTopico.get(topicoId);
      return status !== false;
    });
  }


  private atualizarOrdemTopicos(materiasParaEstudo: MateriaTopicosDTO[] | null | undefined): void {
    this.ordemTopicoPorId.clear();
    let ordem = 0;

    const walk = (topico: any) => {
      const id = this.obterIdTopico(topico);
      if (id && !this.ordemTopicoPorId.has(id)) {
        this.ordemTopicoPorId.set(id, ordem++);
      }
      const filhos = (topico?.filhos || topico?.subtopicos || []) as any[];
      if (filhos.length) {
        filhos.forEach((filho) => walk(filho));
      }
    };

    for (const materia of materiasParaEstudo || []) {
      (materia?.topicos || []).forEach((topico: any) => walk(topico));
    }
  }

  private compararOrdemTopico(a: RevisaoDashboardItem, b: RevisaoDashboardItem): number {
    const ordemA = this.ordemTopicoPorId.get(a.topicoId);
    const ordemB = this.ordemTopicoPorId.get(b.topicoId);
    const temA = ordemA != null;
    const temB = ordemB != null;
    if (temA && temB && ordemA !== ordemB) {
      return ordemA - ordemB;
    }
    if (temA && !temB) return -1;
    if (!temA && temB) return 1;
    return 0;
  }

  private normalizarRevisoesDashboard(revisoes: RevisaoDashboardItem[]): RevisaoDashboardItem[] {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const normalizadas = (revisoes || [])
      .map((item) => this.normalizarRevisaoItem(item, hoje))
      .filter((item): item is RevisaoDashboardItem => !!item);

    return this.consolidarRevisoesPorTopico(normalizadas);
  }

  private consolidarRevisoesPorTopico(revisoes: RevisaoDashboardItem[]): RevisaoDashboardItem[] {
    const porTopico = new Map<number, RevisaoDashboardItem>();
    const semTopico: RevisaoDashboardItem[] = [];

    for (const item of revisoes || []) {
      const topicoId = Number((item as any)?.topicoId);
      if (!Number.isFinite(topicoId) || topicoId <= 0) {
        semTopico.push(item);
        continue;
      }

      const atual = porTopico.get(topicoId);
      if (!atual) {
        porTopico.set(topicoId, item);
        continue;
      }

      porTopico.set(topicoId, this.escolherMelhorRevisaoTopico(atual, item));
    }

    return [...porTopico.values(), ...semTopico];
  }

  private escolherMelhorRevisaoTopico(a: RevisaoDashboardItem, b: RevisaoDashboardItem): RevisaoDashboardItem {
    const pa = this.prioridadeStatusDashboard(a?.status);
    const pb = this.prioridadeStatusDashboard(b?.status);
    if (pb > pa) return b;
    if (pb < pa) return a;

    const da = this.millisDataRevisao(a);
    const db = this.millisDataRevisao(b);
    if (db < da) return b;
    if (db > da) return a;

    const ta = this.prioridadeTipoRevisao((a as any)?.tipo);
    const tb = this.prioridadeTipoRevisao((b as any)?.tipo);
    if (tb > ta) return b;

    return a;
  }

  private prioridadeStatusDashboard(status: RevisaoDashboardItem['status'] | string | undefined): number {
    if (status === 'VENCIDA') return 3;
    if (status === 'EM_DIA') return 2;
    if (status === 'FUTURA') return 1;
    return 0;
  }

  private prioridadeTipoRevisao(tipo: string | undefined): number {
    if (tipo === 'TOPICO') return 3;
    if (tipo === 'ANOTACAO') return 2;
    if (tipo === 'FLASHCARD') return 1;
    return 0;
  }

  private millisDataRevisao(item: RevisaoDashboardItem): number {
    const raw = (item as any)?.dataProximaRevisao || (item as any)?.proximaRevisao || null;
    if (!raw) return Number.POSITIVE_INFINITY;
    const data = construirDataLocal(String(raw));
    const time = data.getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }

  private normalizarRevisaoItem(item: RevisaoDashboardItem, hoje: Date): RevisaoDashboardItem | null {
    const statusCanonico = extrairStatusCanonicoRevisao(item, hoje);
    const statusDashboard = statusCanonicoParaDashboard(statusCanonico);
    if (!statusDashboard) {
      return null;
    }

    const proxima = (item as any)?.proximaRevisao || (item as any)?.dataProximaRevisao || null;
    if (proxima) {
      const dataRev = construirDataLocal(proxima);
      if (Number.isNaN(dataRev.getTime())) {
        return null;
      }
    }

    return {
      ...item,
      statusCanonico,
      statusRevisao: statusCanonico,
      status: statusDashboard
    };
  }

  private obterIdTopico(topico: any): number | null {
    const id =
      Number(
        topico?.id ??
          topico?.topicoId ??
          topico?.idTopico ??
          topico?.subtopicoId ??
          topico?.idSubtopico
      ) || 0;
    return id > 0 ? id : null;
  }

  private obterFilhosAtivos(topico: any): any[] {
    const filhos = (topico?.filhos || topico?.subtopicos || []) as any[];
    return filhos.filter((filho) => filho?.ativo !== false);
  }

  private obterEditalPlano(): Edital | null {
    const ativo = (this.activeEditais || [])[0];
    if (ativo) return ativo;
    const alternativo = (this.editais || []).find(e => e?.ativo);
    return alternativo || (this.editais || [])[0] || null;
  }

  private obterDataProva(edital: Edital | null): string | null {
    if (!edital) return null;
    return edital.dataProva || localStorage.getItem(this.getDataProvaKey(edital));
  }

  private salvarDataProvaLocal(edital: Edital, data: string | null): void {
    const key = this.getDataProvaKey(edital);
    if (!data) {
      localStorage.removeItem(key);
      edital.dataProva = null;
      return;
    }
    localStorage.setItem(key, data);
    edital.dataProva = data;
  }

  private removerDataProvaLocal(edital: Edital): void {
    localStorage.removeItem(this.getDataProvaKey(edital));
  }

  private getDataProvaKey(edital: Edital): string {
    return `dashboard:data-prova:${edital.id ?? 'temp'}`;
  }

  private getMediaRevisaoSegundos(): number | null {
    const totalSegundos = Number(localStorage.getItem('revisao:tempoTotalSegundos')) || 0;
    const totalItens = Number(localStorage.getItem('revisao:itensTotais')) || 0;
    if (totalItens < 5 || totalSegundos <= 0) {
      return null;
    }
    return totalSegundos / totalItens;
  }

  private atualizarPlanoAtaque(): void {
    const editalBase = this.obterEditalPlano();
    const materias = editalBase?.materias || [];
    if (!materias.length) {
      this.planoAtaqueSemana = [];
      return;
    }

    const pior = [...materias].sort((a, b) => (a.nivelDominio ?? 0) - (b.nivelDominio ?? 0));
    const foco = pior.slice(0, 2);

    const revisoesMap = new Map<number, { atrasadas: number; hoje: number }>();
    (this.revisoes || []).forEach((item) => {
      const atual = revisoesMap.get(item.materiaId) || { atrasadas: 0, hoje: 0 };
      if (item.status === 'VENCIDA') atual.atrasadas += 1;
      if (item.status === 'EM_DIA') atual.hoje += 1;
      revisoesMap.set(item.materiaId, atual);
    });

    const candidatosManutencao = materias.filter((m) => {
      const revisao = revisoesMap.get(m.materiaId);
      return !!revisao && (revisao.atrasadas > 0 || revisao.hoje > 0);
    });
    const manutencao = candidatosManutencao.sort(
      (a, b) => (b.nivelDominio ?? 0) - (a.nivelDominio ?? 0)
    )[0];

    const lista = [...foco, ...(manutencao ? [manutencao] : [])];
    const unicos = Array.from(new Map(lista.map((m) => [m.materiaId, m])).values());
    this.planoAtaqueSemana = unicos.map((m) => {
      const revisao = revisoesMap.get(m.materiaId) || { atrasadas: 0, hoje: 0 };
      const dominio = Number(m.nivelDominio ?? 0) || 0;
      const minutos = dominio <= 50 ? 45 : dominio <= 70 ? 35 : 25;
      const filtroPreferido = revisao.atrasadas > 0 ? 'atrasadas' : revisao.hoje > 0 ? 'hoje' : 'emdia';
      return {
        materiaId: m.materiaId,
        materiaNome: m.materiaNome,
        nivelDominio: dominio,
        atrasadas: revisao.atrasadas,
        hoje: revisao.hoje,
        minutosSugeridos: minutos,
        filtroPreferido
      };
    });
  }

  private obterRevisaoPrioritaria(status: RevisaoDashboardItem['status']): RevisaoDashboardItem | null {
    const itens = (this.revisoes || []).filter(r => r.status === status);
    if (!itens.length) return null;
    return [...itens].sort((a, b) => this.compararDatasIso(a.dataProximaRevisao, b.dataProximaRevisao))[0];
  }

  private compararDatasIso(a?: string | null, b?: string | null): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (Number.isNaN(da) && Number.isNaN(db)) return 0;
    if (Number.isNaN(da)) return 1;
    if (Number.isNaN(db)) return -1;
    return da - db;
  }

  private ordenarMateriasPlano(lista: PlanoDoDiaDTO['materiasDoBloco']): PlanoDoDiaDTO['materiasDoBloco'] {
    return [...(lista || [])].sort((a, b) => a.ordem - b.ordem);
  }

  private flattenTopicos(topicos: any[]): any[] {
    const result: any[] = [];
    const stack = [...(topicos || [])];
    while (stack.length) {
      const atual = stack.shift();
      if (!atual) continue;
      result.push(atual);
      const filhos = (atual.filhos || atual.subtopicos || []) as any[];
      if (filhos.length) {
        stack.unshift(...filhos);
      }
    }
    return result;
  }

  private ordenarTopicosPorDataCriacao(topicos: any[]): any[] {
    return [...(topicos || [])].sort((a, b) => {
      const dataA = a?.dataCriacao || '';
      const dataB = b?.dataCriacao || '';
      if (dataA && dataB) {
        return this.compararDatasIso(dataA, dataB);
      }
      const idA = Number(a?.id ?? 0);
      const idB = Number(b?.id ?? 0);
      return idA - idB;
    });
  }

}








