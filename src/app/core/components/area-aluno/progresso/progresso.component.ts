import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { EditalService } from '../services/edital.service';
import { Edital } from '../models/Edital';
import { EditalMateriaResumo } from '../models/EditalMateriaResumo';
import {
  SalaEstudoService,
  TempoEstudoMateriaDTO,
  TempoEstudoTotalDTO,
  ConstanciaEstudoDiaDTO
} from '../services/sala-estudo.service';
import { BlocosEstudoService } from '../services/blocos-estudo.service';
import { BlocoEstudoDTO } from '../../dto/blocos-estudo.dto';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { DashboardResumoService } from '../services/dashboard-resumo.service';
import { BibliotecaResumoDTO, TopicoNodeDTO } from '../services/sala-estudo.service';
import { extrairStatusCanonicoRevisao } from '../utils/revisao-status.util';
import { AlunoParametroService } from 'src/app/core/services/aluno-parametro.service';
import { AlunoParametroDTO } from 'src/app/core/dto/aluno-parametro.dto';
import { RevisaoHojeService } from 'src/app/core/services/revisao-hoje.service';

@Component({
  selector: 'app-progresso',
  templateUrl: './progresso.component.html',
  styleUrls: ['./progresso.component.css']
})
export class ProgressoComponent implements OnInit {
  private readonly CHAVE_LIMITE_DIARIO_REVISOES = 'LIMITE_DIARIO_REVISOES';
  private readonly FALLBACK_LIMITE_REVISOES_DIARIAS = 40;
  carregando = false;
  erro?: string;
  editais: Edital[] = [];
  editalAtivo?: Edital;
  temposMaterias: TempoEstudoMateriaDTO[] = [];
  tempoTotalDto: TempoEstudoTotalDTO | null = null;
  tempoTotalLabel = '--';
  tempoMensalLabel = '--';
  tempoSemanalLabel = '--';
  constanciaLabel = '--';
  materiaDestaqueLabel = '--';
  constanciaDias: ConstanciaEstudoDiaDTO[] = [];
  constanciaDiasMes: ConstanciaEstudoDiaDTO[] = [];
  constanciaDiasPeriodo: ConstanciaEstudoDiaDTO[] = [];
  constanciaMaxSegundos = 0;
  calendarioMes = new Date().getMonth();
  calendarioAno = new Date().getFullYear();
  calendarioDias: Array<{
    day?: number;
    date?: Date;
    status?: 'estudado' | 'faltou';
    totalSegundos?: number;
    tooltip?: string;
    isEmpty?: boolean;
    isSelected?: boolean;
  }> = [];
  revisoesVencidasCount = 0;
  periodoSelecionado: '7d' | '30d' | '90d' | 'tudo' = '30d';
  modoSelecionado: 'estudo' | 'revisao' | 'ambos' = 'ambos';
  materiaDetalheAbertaId: number | null = null;
  readonly periodoOpcoes = [
    { label: '7d', value: '7d' as const },
    { label: '30d', value: '30d' as const },
    { label: '90d', value: '90d' as const },
    { label: 'Tudo', value: 'tudo' as const }
  ];
  readonly modoOpcoes = [
    { label: 'Estudo', value: 'estudo' as const },
    { label: 'Revisao', value: 'revisao' as const },
    { label: 'Ambos', value: 'ambos' as const }
  ];
  plannerMetricas: Array<{
    label: string;
    plannedLabel: string;
    actualLabel: string;
    percentLabel: string;
    percentBar: number;
    status: 'ok' | 'warn';
  }> = [];
  selectedDate: Date | null = null;
  selectedMaterias: string[] = [];
  revisoesResumo = {
    emDia: 0,
    hoje: 0,
    atrasadas: 0,
    total: 0,
    emDiaPct: 0,
    hojePct: 0,
    atrasadasPct: 0
  };
  sparklineSeries: Array<{ value: number; heightPct: number; label: string }> = [];
  tempoMateriasDistribuicao: Array<{ materiaId: number; nome: string; percent: number; label: string }> = [];
  planoAtaqueSemana: Array<{
    materiaId: number;
    materiaNome: string;
    atrasadas: number;
    hoje: number;
    minutosSugeridos: number;
    filtroPreferido: 'atrasadas' | 'hoje' | 'emdia';
  }> = [];
  private blocosCache: BlocoEstudoDTO[] = [];
  private constanciaMesCache: ConstanciaEstudoDiaDTO[] = [];
  private constanciaMensalMap = new Map<string, ConstanciaEstudoDiaDTO[]>();
  private constanciaMensalInFlight = new Map<string, Observable<ConstanciaEstudoDiaDTO[]>>();
  private revisoesDashboard: RevisaoDashboardItem[] = [];
  private revisoesFilaHoje: Array<{
    topicoId: number;
    materiaId: number | null;
    statusCanonico: 'ATRASADA' | 'HOJE';
    proximaRevisao: string | null;
  }> = [];
  private weakColors = [
    '#ef4444',
    '#f59e0b',
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#f97316'
  ];

  constructor(
    private editalService: EditalService,
    private salaEstudoService: SalaEstudoService,
    private blocosEstudoService: BlocosEstudoService,
    private dashboardResumoService: DashboardResumoService,
    private revisaoHojeService: RevisaoHojeService,
    private alunoParametroService: AlunoParametroService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarDadosIniciais();
    this.carregarFilaRevisoesAtual();
  }

  private carregarDadosIniciais(): void {
    this.carregando = true;
    this.erro = undefined;

    this.dashboardResumoService.buscarResumo({
      lite: false,
      include: ['editais', 'revisoes', 'blocosResumo']
    }).subscribe({
      next: (resumo) => {
        const editais = this.extrairEditaisResumo(resumo);
        const revisoes = this.extrairRevisoesResumo(resumo);
        const blocos = this.extrairBlocosResumo(resumo);

        this.aplicarEditais(editais);
        this.aplicarRevisoes(revisoes);
        this.blocosCache = blocos || [];
        this.carregando = false;
        this.carregarTemposEstudo(this.blocosCache);
      },
      error: (err) => {
        console.warn('[PROGRESSO] Falha no endpoint agregado. Usando fallback legado.', err);
        this.carregarEditais();
        this.carregarRevisoes();
        this.carregarTemposEstudo();
      }
    });
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  get materiasPontoFraco(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return [...materias].sort((a, b) => (a.nivelDominio ?? 0) - (b.nivelDominio ?? 0));
  }

  get materiasPontoFracoTop5(): EditalMateriaResumo[] {
    return this.materiasPontoFraco.slice(0, 5);
  }

  get weakSlices(): Array<{ label: string; dominio: number; percent: number; color: string }> {
    const materias = this.materiasPontoFraco;
    if (!materias.length) {
      return [];
    }
    const weights = materias.map((m) => Math.max(1, 100 - (m.nivelDominio ?? 0)));
    const total = weights.reduce((acc, v) => acc + v, 0);
    return materias.map((m, index) => {
      const weight = weights[index];
      const percent = total > 0 ? (weight / total) * 100 : 0;
      return {
        label: m.materiaNome,
        dominio: m.nivelDominio ?? 0,
        percent,
        color: this.weakColors[index % this.weakColors.length]
      };
    });
  }

  get weakPieGradient(): string {
    const slices = this.weakSlices;
    if (!slices.length) {
      return 'conic-gradient(#e5e7eb 0 100%)';
    }
    let acc = 0;
    const parts = slices.map((slice) => {
      const start = acc;
      acc += slice.percent;
      const end = acc;
      return `${slice.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  get constanciaLegenda(): string {
    return 'Verde = estudou (mais forte = mais tempo) | Vermelho = nao estudou';
  }

  selecionarPeriodo(valor: '7d' | '30d' | '90d' | 'tudo'): void {
    if (this.periodoSelecionado === valor) return;
    this.periodoSelecionado = valor;
    this.carregarTemposEstudo();
  }

  selecionarModo(valor: 'estudo' | 'revisao' | 'ambos'): void {
    if (this.modoSelecionado === valor) return;
    this.modoSelecionado = valor;
    this.carregarTemposEstudo();
  }

  mesAnterior(): void {
    if (this.calendarioMes === 0) {
      this.calendarioMes = 11;
      this.calendarioAno -= 1;
    } else {
      this.calendarioMes -= 1;
    }
    this.carregarConstanciaMesSelecionado();
  }

  mesProximo(): void {
    if (this.calendarioMes === 11) {
      this.calendarioMes = 0;
      this.calendarioAno += 1;
    } else {
      this.calendarioMes += 1;
    }
    this.carregarConstanciaMesSelecionado();
  }

  get tituloCalendario(): string {
    const meses = [
      'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${meses[this.calendarioMes]} - ${this.calendarioAno}`;
  }

  toggleDetalheMateria(materiaId: number): void {
    this.materiaDetalheAbertaId = this.materiaDetalheAbertaId === materiaId ? null : materiaId;
  }

  irParaRevisoes(): void {
    const topicosPriorizados = this.obterTopicosPriorizadosFilaHoje();
    if (!topicosPriorizados.length) {
      const filtro = this.revisoesResumo.atrasadas > 0 ? 'atrasadas' : this.revisoesResumo.hoje > 0 ? 'hoje' : 'emdia';
      this.irParaFilaRevisoes(filtro);
      return;
    }

    const primeiroTopicoId = topicosPriorizados[0];
    const materiaId = Number(
      this.revisoesFilaHoje.find((item) => Number(item?.topicoId || 0) === primeiroTopicoId)?.materiaId || 0
    );

    this.router.navigate(['/area-restrita/biblioteca/resumo', primeiroTopicoId], {
      queryParams: {
        topicos: topicosPriorizados.join(','),
        origem: 'hoje',
        materiaId: materiaId > 0 ? materiaId : null
      }
    });
  }

  irParaFilaRevisoes(filtro: 'atrasadas' | 'hoje' | 'emdia', materiaId?: number): void {
    const queryParams: any = { modo: 'revisao', filtro };
    if (materiaId) {
      queryParams.materiaId = materiaId;
    }
    this.router.navigate(['/area-restrita/revisoes'], { queryParams });
  }

  private carregarEditais(): void {
    this.carregando = true;
    this.erro = undefined;

    this.editalService.listar().subscribe({
      next: (lista) => this.aplicarEditais(lista || []),
      error: () => {
        this.erro = 'Erro ao carregar seus editais.';
        this.carregando = false;
      }
    });
  }

  private carregarTemposEstudo(blocosOverride?: BlocoEstudoDTO[]): void {
    const blocosFonte = (blocosOverride && blocosOverride.length)
      ? blocosOverride
      : (this.blocosCache?.length ? this.blocosCache : null);
    const blocos$ = blocosFonte
      ? of(blocosFonte)
      : this.blocosEstudoService.listarBlocos().pipe(catchError(() => of([] as BlocoEstudoDTO[])));
    const anoMesAtual = this.anoMesSelecionado();

    forkJoin({
      materias: this.salaEstudoService.listarTempoEstudoPorMateria().pipe(catchError(() => of([]))),
      total: this.salaEstudoService.buscarTempoEstudoTotal().pipe(catchError(() => of(null))),
      constancia: this.carregarConstanciaPeriodo().pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[]))),
      constanciaMes: this.listarConstanciaMensalComCache(anoMesAtual.ano, anoMesAtual.mes),
      blocos: blocos$
    }).subscribe(({ materias, total, constancia, constanciaMes, blocos }) => {
      this.temposMaterias = materias || [];
      this.tempoTotalDto = total;
      this.atualizarTempoMateriasDistribuicao();
      this.tempoTotalLabel = this.formatarTempoTotal(total);
      this.tempoSemanalLabel = this.formatarTempoSemanal(total);
      this.constanciaLabel = this.formatarConstanciaMensal(constancia || []);
      this.constanciaDias = constanciaMes || [];
      this.constanciaDiasMes = constanciaMes || [];
      this.constanciaDiasPeriodo = constancia || [];
      this.constanciaMesCache = constanciaMes || [];
      this.blocosCache = blocos || [];
      this.constanciaMaxSegundos = this.definirMaxConstancia(constanciaMes || []);
      this.tempoMensalLabel = this.formatarTempoMensal(constanciaMes || []);
      this.materiaDestaqueLabel = this.definirMateriaDestaque(this.temposMaterias);
      if (!this.selectedDate) {
        this.selectedDate = this.inicioDia(new Date());
      }
      this.plannerMetricas = this.calcularPlannerMetricas(
        this.blocosCache,
        this.constanciaMesCache,
        this.selectedDate
      );
      if (this.selectedDate) {
        this.atualizarSelecaoDia(this.selectedDate);
        this.atualizarSparkline(this.selectedDate);
      }
      this.atualizarCalendario(constanciaMes || []);
    });
  }

  private carregarRevisoes(): void {
    this.salaEstudoService.listarRevisoesDashboard()
      .pipe(catchError(() => of([])))
      .subscribe((itens) => this.aplicarRevisoes((itens || []) as RevisaoDashboardItem[]));
  }

  private aplicarEditais(lista: Edital[]): void {
    console.log('[PROGRESSO] Editais recebidos:', lista);
    this.editais = lista || [];
    this.editalAtivo = this.editais.find(e => e.ativo) || this.editais[0];
    console.log('[PROGRESSO] Edital ativo:', this.editalAtivo);
    this.atualizarPlanoAtaque();
    this.carregando = false;
  }

  private aplicarRevisoes(itens: RevisaoDashboardItem[]): void {
    this.revisoesDashboard = itens || [];
    this.revisoesVencidasCount = this.revisoesFilaHoje.length
      ? this.revisoesFilaHoje.filter((item) => item.statusCanonico === 'ATRASADA').length
      : (itens || []).filter((item) => item.status === 'VENCIDA').length;
    this.atualizarResumoRevisoes(itens || []);
    this.atualizarPlanoAtaque();
  }

  private carregarFilaRevisoesAtual(): void {
    this.revisaoHojeService.getFilaHoje({ origem: 'progresso' }).subscribe({
      next: (resp) => {
        this.revisoesFilaHoje = (resp?.itens || [])
          .map((item) => {
            const topicoId = Number(item?.topicoId || 0);
            if (!Number.isFinite(topicoId) || topicoId <= 0) return null;
            const materiaIdNum = Number(item?.materiaId || 0);
            const materiaId = Number.isFinite(materiaIdNum) && materiaIdNum > 0 ? materiaIdNum : null;
            const status = String(item?.statusCanonico || '').toUpperCase() === 'ATRASADA' ? 'ATRASADA' : 'HOJE';
            return {
              topicoId,
              materiaId,
              statusCanonico: status as 'ATRASADA' | 'HOJE',
              proximaRevisao: String(item?.proximaRevisao || '').trim() || null
            };
          })
          .filter((item): item is { topicoId: number; materiaId: number | null; statusCanonico: 'ATRASADA' | 'HOJE'; proximaRevisao: string | null } => !!item);
        this.revisoesVencidasCount = this.revisoesFilaHoje.filter((item) => item.statusCanonico === 'ATRASADA').length;
      },
      error: () => {
        this.revisoesFilaHoje = [];
      }
    });
  }

  private mapBibliotecaResumoParaFilaHoje(
    item: BibliotecaResumoDTO | null | undefined,
    topicoInfo: { statusRevisao: string | null; proximaRevisao: string | null } | null
  ): { topicoId: number; materiaId: number | null; statusCanonico: 'ATRASADA' | 'HOJE'; proximaRevisao: string | null } | null {
    const topicoId = Number((item as any)?.topicoId || 0);
    if (!Number.isFinite(topicoId) || topicoId <= 0) return null;

    const materiaIdRaw = Number((item as any)?.materiaId || 0);
    const materiaId = Number.isFinite(materiaIdRaw) && materiaIdRaw > 0 ? materiaIdRaw : null;

    const status = this.normalizarStatusCanonicoFilaHoje(item, topicoInfo);
    if (status !== 'ATRASADA' && status !== 'HOJE') return null;

    const proximaRevisao = String(
      topicoInfo?.proximaRevisao ??
      (item as any)?.proximaRevisao ??
      (item as any)?.dataProximaRevisao ??
      ''
    ).trim() || null;

    return { topicoId, materiaId, statusCanonico: status, proximaRevisao };
  }

  private normalizarStatusCanonicoFilaHoje(
    item: BibliotecaResumoDTO | null | undefined,
    topicoInfo: { statusRevisao: string | null; proximaRevisao: string | null } | null
  ): 'ATRASADA' | 'HOJE' | 'FUTURA' {
    const canonico = extrairStatusCanonicoRevisao({
      statusCanonico: (item as any)?.statusCanonico,
      statusRevisao: topicoInfo?.statusRevisao ?? (item as any)?.statusRevisao,
      status: (item as any)?.status,
      proximaRevisao:
        topicoInfo?.proximaRevisao ??
        (item as any)?.proximaRevisao ??
        (item as any)?.dataProximaRevisao
    });

    if (canonico === 'ATRASADA') return 'ATRASADA';
    if (canonico === 'HOJE') return 'HOJE';
    return 'FUTURA';
  }

  private indexarTopicosFilaHoje(
    materias: any[]
  ): Map<number, { statusRevisao: string | null; proximaRevisao: string | null }> {
    const index = new Map<number, { statusRevisao: string | null; proximaRevisao: string | null }>();
    (materias || []).forEach((m) => {
      const topicos = Array.isArray((m as any)?.topicos) ? ((m as any)?.topicos as TopicoNodeDTO[]) : [];
      this.walkTopicosFilaHoje(topicos, index);
    });
    return index;
  }

  private walkTopicosFilaHoje(
    topicos: TopicoNodeDTO[],
    index: Map<number, { statusRevisao: string | null; proximaRevisao: string | null }>
  ): void {
    (topicos || []).forEach((topico) => {
      const topicoId = Number((topico as any)?.id ?? (topico as any)?.topicoId ?? (topico as any)?.subtopicoId ?? 0);
      if (Number.isFinite(topicoId) && topicoId > 0) {
        index.set(topicoId, {
          statusRevisao: String((topico as any)?.statusRevisao || '').trim() || null,
          proximaRevisao: String((topico as any)?.proximaRevisao || '').trim() || null
        });
      }

      const filhos = Array.isArray((topico as any)?.subtopicos)
        ? ((topico as any)?.subtopicos as TopicoNodeDTO[])
        : (Array.isArray((topico as any)?.filhos) ? ((topico as any)?.filhos as TopicoNodeDTO[]) : []);

      if (filhos.length) {
        this.walkTopicosFilaHoje(filhos, index);
      }
    });
  }

  private ordenarFilaHoje(
    fila: Array<{ topicoId: number; materiaId: number | null; statusCanonico: 'ATRASADA' | 'HOJE'; proximaRevisao: string | null }>
  ): Array<{ topicoId: number; materiaId: number | null; statusCanonico: 'ATRASADA' | 'HOJE'; proximaRevisao: string | null }> {
    const peso = (status: 'ATRASADA' | 'HOJE'): number => (status === 'ATRASADA' ? 0 : 1);
    const toTime = (valor: string | null): number => {
      const texto = String(valor || '').trim();
      if (!texto) return Number.POSITIVE_INFINITY;
      const time = new Date(texto).getTime();
      return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    };
    return [...(fila || [])].sort((a, b) => {
      const p = peso(a.statusCanonico) - peso(b.statusCanonico);
      if (p !== 0) return p;
      return toTime(a.proximaRevisao) - toTime(b.proximaRevisao);
    });
  }

  private obterLimiteDiarioRevisoes(): Observable<number> {
    return this.alunoParametroService.listarParametros().pipe(
      map((parametros) => this.extrairLimiteDiarioRevisoes(parametros))
    );
  }

  private extrairLimiteDiarioRevisoes(parametros: AlunoParametroDTO[]): number {
    const parametro = (parametros || []).find((p) => p?.chave === this.CHAVE_LIMITE_DIARIO_REVISOES);
    const valor = Number(parametro?.valor);
    if (Number.isInteger(valor) && valor > 0) {
      return valor;
    }
    return this.FALLBACK_LIMITE_REVISOES_DIARIAS;
  }

  private obterTopicosPriorizadosFilaHoje(): number[] {
    const vistos = new Set<number>();
    const saida: number[] = [];
    (this.revisoesFilaHoje || []).forEach((item) => {
      const id = Number(item?.topicoId || 0);
      if (id > 0 && !vistos.has(id)) {
        vistos.add(id);
        saida.push(id);
      }
    });
    return saida;
  }

  private extrairEditaisResumo(resumo: any): Edital[] {
    const editais = resumo?.editais;
    if (Array.isArray(editais)) return editais as Edital[];
    if (Array.isArray(editais?.itens)) return editais.itens as Edital[];
    if (Array.isArray(editais?.lista)) return editais.lista as Edital[];
    return [];
  }

  private extrairRevisoesResumo(resumo: any): RevisaoDashboardItem[] {
    const revisoes = resumo?.revisoes;
    if (Array.isArray(revisoes)) return revisoes as RevisaoDashboardItem[];
    if (Array.isArray(revisoes?.itens)) return revisoes.itens as RevisaoDashboardItem[];
    if (Array.isArray(revisoes?.lista)) return revisoes.lista as RevisaoDashboardItem[];
    return [];
  }

  private extrairBlocosResumo(resumo: any): BlocoEstudoDTO[] {
    const blocos = resumo?.blocosResumo ?? resumo?.blocos;
    if (Array.isArray(blocos)) return blocos as BlocoEstudoDTO[];
    if (Array.isArray(blocos?.itens)) return blocos.itens as BlocoEstudoDTO[];
    if (Array.isArray(blocos?.lista)) return blocos.lista as BlocoEstudoDTO[];
    return [];
  }

  private carregarConstanciaMesSelecionado(): void {
    this.listarConstanciaMensalComCache(this.calendarioAno, this.calendarioMes + 1)
      .subscribe((lista) => {
        this.constanciaDiasMes = lista || [];
        this.constanciaMesCache = lista || [];
        this.constanciaMaxSegundos = this.definirMaxConstancia(this.constanciaDiasMes);
        this.tempoMensalLabel = this.formatarTempoMensal(this.constanciaDiasMes);
        if (this.selectedDate) {
          const mesSelecionado = this.selectedDate.getMonth() === this.calendarioMes;
          const anoSelecionado = this.selectedDate.getFullYear() === this.calendarioAno;
          if (!mesSelecionado || !anoSelecionado) {
            this.selectedDate = new Date(this.calendarioAno, this.calendarioMes, 1);
          }
        } else {
          this.selectedDate = new Date(this.calendarioAno, this.calendarioMes, 1);
        }
        this.plannerMetricas = this.calcularPlannerMetricas(
          this.blocosCache,
          this.constanciaMesCache,
          this.selectedDate
        );
        if (this.selectedDate) {
          this.atualizarSelecaoDia(this.selectedDate);
          this.atualizarSparkline(this.selectedDate);
        }
        this.atualizarCalendario(this.constanciaDiasMes);
      });
  }

  private formatarTempoTotal(dto: TempoEstudoTotalDTO | null): string {
    const totalSegundos = this.obterTempoEmSegundos(dto);
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private formatarTempoSemanal(dto: TempoEstudoTotalDTO | null): string {
    if (!dto) return '--';
    const totalSegundos = this.obterTempoSemanaSegundos(dto);
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private formatarTempoMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const totalSegundos = lista.reduce((acc, item) => acc + this.obterTempoSegundosConstancia(item), 0);
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private calcularPlannerMetricas(
    blocos: BlocoEstudoDTO[],
    constanciaMes: ConstanciaEstudoDiaDTO[],
    baseDate: Date | null
  ): Array<{
    label: string;
    plannedLabel: string;
    actualLabel: string;
    percentLabel: string;
    percentBar: number;
    status: 'ok' | 'warn';
  }> {
    const dataBase = baseDate ? this.inicioDia(baseDate) : this.inicioDia(new Date());
    const periodoSemana = this.obterPeriodoSemanaAtual(dataBase);
    const periodoMes = this.obterPeriodoMesAtual(dataBase);
    const planejadoDiaSeg = this.calcularPlanejadoDia(blocos, dataBase);
    const planejadoSemanaSeg = this.calcularPlanejadoPeriodo(blocos, periodoSemana);
    const planejadoMesSeg = this.calcularPlanejadoPeriodo(blocos, periodoMes);

    const realizadoSemanaSeg = this.somarConstanciaPeriodo(constanciaMes, periodoSemana);
    const realizadoMesSeg = this.somarConstanciaPeriodo(constanciaMes, periodoMes);
    const realizadoDiaSeg = this.obterConstanciaDiaSegundos(constanciaMes, dataBase);

    return [
      this.criarMetricaPlanejado('Dia', planejadoDiaSeg, realizadoDiaSeg),
      this.criarMetricaPlanejado('Semana', planejadoSemanaSeg, realizadoSemanaSeg),
      this.criarMetricaPlanejado('Mes', planejadoMesSeg, realizadoMesSeg)
    ];
  }

  private criarMetricaPlanejado(label: string, planejadoSeg: number, realizadoSeg: number): {
    label: string;
    plannedLabel: string;
    actualLabel: string;
    percentLabel: string;
    percentBar: number;
    status: 'ok' | 'warn';
  } {
    const plannedLabel = planejadoSeg > 0 ? this.formatarDuracaoSegundos(planejadoSeg) : '--';
    const actualLabel = this.formatarDuracaoSegundos(realizadoSeg);
    const percent = planejadoSeg > 0 ? (realizadoSeg / planejadoSeg) * 100 : 0;
    const percentBar = Math.min(100, Math.max(0, percent));
    let percentLabel = 'Sem meta definida';
    if (planejadoSeg > 0) {
      if (percent > 0 && percent < 1) {
        percentLabel = `${percent.toFixed(1)}%`;
      } else {
        percentLabel = `${Math.round(percent)}%`;
      }
    }
    return {
      label,
      plannedLabel,
      actualLabel,
      percentLabel,
      percentBar,
      status: planejadoSeg > 0 && realizadoSeg >= planejadoSeg ? 'ok' : 'warn'
    };
  }

  private calcularPlanejadoDia(blocos: BlocoEstudoDTO[], data: Date): number {
    if (!blocos?.length) return 0;
    return this.obterMinutosPlanejadosDia(blocos, data) * 60;
  }

  private calcularPlanejadoPeriodo(blocos: BlocoEstudoDTO[], periodo: { inicio: Date; fim: Date }): number {
    if (!blocos?.length) return 0;
    const dias = this.diasNoPeriodo(periodo);
    let totalMin = 0;
    dias.forEach((data) => {
      totalMin += this.obterMinutosPlanejadosDia(blocos, data);
    });
    return totalMin * 60;
  }

  private somarConstanciaSegundos(lista: ConstanciaEstudoDiaDTO[]): number {
    return (lista || []).reduce((acc, item) => acc + this.obterTempoSegundosConstancia(item), 0);
  }

  private obterConstanciaDiaSegundos(lista: ConstanciaEstudoDiaDTO[], data: Date): number {
    if (!lista?.length) return 0;
    const dataBase = this.inicioDia(data);
    const chave = this.formatarDataChave(dataBase);
    const item = lista.find((i) => this.formatarDataChave(this.parseDia(i.dia)) === chave);
    return item ? this.obterTempoSegundosConstancia(item) : 0;
  }

  private formatarConstanciaMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const periodo = this.obterPeriodoAtual();
    const diasPeriodo = this.diasNoPeriodo(periodo).length;
    if (!diasPeriodo) return '--';
    const diasComEstudo = lista.filter((item) => this.obterTempoSegundosConstancia(item) > 0 || item.teveEstudo).length;
    const percentual = Math.round((diasComEstudo / diasPeriodo) * 100);
    return `${percentual}%`;
  }

  private definirMateriaDestaque(materias: TempoEstudoMateriaDTO[]): string {
    if (!materias?.length) return '--';
    const ordenadas = [...materias].sort((a, b) => this.obterTempoEmSegundos(b) - this.obterTempoEmSegundos(a));
    const destaque = ordenadas[0];
    const tempo = this.formatarDuracaoSegundos(this.obterTempoEmSegundos(destaque));
    return destaque?.materiaNome ? `${destaque.materiaNome} (${tempo})` : '--';
  }

  private obterTempoEmSegundos(dto?: TempoEstudoTotalDTO | TempoEstudoMateriaDTO | null): number {
    if (!dto) return 0;
    const estudo = this.obterTempoEstudoSegundos(dto);
    const revisao = this.obterTempoRevisaoSegundos(dto);
    if (this.modoSelecionado === 'estudo') return estudo;
    if (this.modoSelecionado === 'revisao') return revisao;
    return estudo + revisao;
  }

  private obterTempoEstudoSegundos(dto?: TempoEstudoTotalDTO | TempoEstudoMateriaDTO | null): number {
    if (!dto) return 0;
    const total = (dto as any).tempoEstudoSegundos
      ?? (dto as any).tempoTotalSegundos
      ?? (dto as any).tempoTotal
      ?? (dto as any).totalSegundos
      ?? (dto as any).segundos
      ?? 0;
    return Number(total) || 0;
  }

  private obterTempoRevisaoSegundos(dto?: TempoEstudoTotalDTO | TempoEstudoMateriaDTO | null): number {
    if (!dto) return 0;
    const total = (dto as any).tempoRevisaoSegundos ?? 0;
    return Number(total) || 0;
  }

  private obterTempoSemanaSegundos(dto?: TempoEstudoTotalDTO | TempoEstudoMateriaDTO | null): number {
    if (!dto) return 0;
    const estudo = Number((dto as any).tempoEstudoSemanaSegundos ?? (dto as any).totalSegundosSemana ?? 0) || 0;
    const revisao = Number((dto as any).tempoRevisaoSemanaSegundos ?? 0) || 0;
    if (this.modoSelecionado === 'estudo') return estudo;
    if (this.modoSelecionado === 'revisao') return revisao;
    return estudo + revisao;
  }

  private obterTempoSegundosConstancia(item: ConstanciaEstudoDiaDTO): number {
    const estudo = Number(item.tempoEstudoSegundos ?? item.totalSegundos ?? 0) || 0;
    const revisao = Number(item.tempoRevisaoSegundos ?? 0) || 0;
    if (this.modoSelecionado === 'estudo') return estudo;
    if (this.modoSelecionado === 'revisao') return revisao;
    return estudo + revisao;
  }

  private formatarDuracao(minutos: number): string {
    const total = Math.max(0, Math.round(minutos));
    const horas = Math.floor(total / 60);
    const resto = total % 60;
    if (horas > 0 && resto === 0) {
      return `${horas}h`;
    }
    if (horas > 0) {
      return `${horas}h ${resto}min`;
    }
    return `${resto} min`;
  }

  private formatarDuracaoSegundos(totalSegundos: number): string {
    if (!totalSegundos) return '0 min';
    const minutos = Math.max(1, Math.round(totalSegundos / 60));
    return this.formatarDuracao(minutos);
  }

  private definirMaxConstancia(lista: ConstanciaEstudoDiaDTO[]): number {
    return Math.max(0, ...(lista || []).map((item) => this.obterTempoSegundosConstancia(item)));
  }

  private obterPeriodoAtual(): { inicio: Date; fim: Date } {
    const hoje = this.inicioDia(new Date());
    const dias = this.diasDoFiltro();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - dias + 1);
    return { inicio, fim: hoje };
  }

  private obterPeriodoSemanaAtual(hoje: Date): { inicio: Date; fim: Date } {
    const diaSemana = hoje.getDay() === 0 ? 7 : hoje.getDay();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - (diaSemana - 1));
    return { inicio: this.inicioDia(inicio), fim: hoje };
  }

  private obterPeriodoMesAtual(hoje: Date): { inicio: Date; fim: Date } {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { inicio, fim: hoje };
  }

  private diasDoFiltro(): number {
    if (this.periodoSelecionado === '7d') return 7;
    if (this.periodoSelecionado === '30d') return 30;
    if (this.periodoSelecionado === '90d') return 90;
    return 365;
  }

  private diasNoPeriodo(periodo: { inicio: Date; fim: Date }): Date[] {
    const dias: Date[] = [];
    const atual = new Date(periodo.inicio);
    while (atual <= periodo.fim) {
      dias.push(new Date(atual));
      atual.setDate(atual.getDate() + 1);
    }
    return dias;
  }

  private obterMinutosPlanejadosDia(blocos: BlocoEstudoDTO[], data: Date): number {
    const indiceDia = data.getDay() === 0 ? 7 : data.getDay();
    const bloco = blocos.find((b) => b.numero === indiceDia);
    return bloco?.minutosDisponiveis ?? 0;
  }

  private filtrarConstanciaPorPeriodo(
    lista: ConstanciaEstudoDiaDTO[],
    periodo: { inicio: Date; fim: Date }
  ): ConstanciaEstudoDiaDTO[] {
    const inicio = this.inicioDia(periodo.inicio);
    const fim = this.inicioDia(periodo.fim);
    return (lista || []).filter((item) => {
      const data = this.parseDia(item.dia);
      return data >= inicio && data <= fim;
    });
  }

  private carregarConstanciaPeriodo() {
    const periodo = this.obterPeriodoAtual();
    const meses = this.listarMesesEntre(periodo.inicio, periodo.fim);
    const requests = meses.map((mes) =>
      this.listarConstanciaMensalComCache(mes.ano, mes.mes + 1)
    );
    if (!requests.length) {
      return of([] as ConstanciaEstudoDiaDTO[]);
    }
    return forkJoin(requests).pipe(
      map((listas) => listas.flat()),
      map((lista) => this.filtrarConstanciaPorPeriodo(lista, periodo))
    );
  }

  private listarMesesEntre(inicio: Date, fim: Date): Array<{ ano: number; mes: number }> {
    const meses: Array<{ ano: number; mes: number }> = [];
    const atual = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);
    while (atual <= limite) {
      meses.push({ ano: atual.getFullYear(), mes: atual.getMonth() });
      atual.setMonth(atual.getMonth() + 1);
    }
    return meses;
  }

  private anoMesSelecionado(): { ano: number; mes: number } {
    return { ano: this.calendarioAno, mes: this.calendarioMes + 1 };
  }

  private chaveMes(ano: number, mes: number): string {
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }

  private listarConstanciaMensalComCache(ano: number, mes: number): Observable<ConstanciaEstudoDiaDTO[]> {
    const chave = this.chaveMes(ano, mes);
    const emCache = this.constanciaMensalMap.get(chave);
    if (emCache) {
      return of(emCache);
    }

    const emVoo = this.constanciaMensalInFlight.get(chave);
    if (emVoo) {
      return emVoo;
    }

    const request$ = this.salaEstudoService
      .listarConstanciaMensal(ano, mes)
      .pipe(
        catchError(() => of([] as ConstanciaEstudoDiaDTO[])),
        map((lista) => lista || []),
        tap((lista) => this.constanciaMensalMap.set(chave, lista)),
        finalize(() => this.constanciaMensalInFlight.delete(chave)),
        shareReplay(1)
      );

    this.constanciaMensalInFlight.set(chave, request$);
    return request$;
  }

  private parseDia(valor: string | Date): Date {
    if (valor instanceof Date) {
      return this.inicioDia(valor);
    }
    if (typeof valor === 'string') {
      const dataStr = valor.split('T')[0] || valor;
      const partes = dataStr.split('-');
      if (partes.length === 3) {
        const ano = Number(partes[0]);
        const mes = Number(partes[1]) - 1;
        const dia = Number(partes[2]);
        return this.inicioDia(new Date(ano, mes, dia));
      }
    }
    return this.inicioDia(new Date(valor));
  }

  private inicioDia(data: Date): Date {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
  }

  private formatarDataChave(data: Date): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  formatarDataCurta(data: Date): string {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  }

  private formatarTooltipConstancia(
    data: Date,
    totalSegundos: number,
    materias: string[] = []
  ): string {
    const dataStr = this.formatarDataCurta(data);
    const tempo = totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '0 min';
    const materiasTexto = materias?.length ? materias.join(', ') : '-';
    return `${dataStr} - ${tempo} - Materias: ${materiasTexto}`;
  }

  getConstanciaDiaStyle(item: {
    status?: 'estudado' | 'faltou';
    totalSegundos?: number;
    isEmpty?: boolean;
  }): { [key: string]: string } {
    if ((item as any).isEmpty) {
      return { backgroundColor: 'transparent', color: 'transparent' };
    }
    if (item.status === 'estudado') {
      const intensidade = this.constanciaMaxSegundos > 0
        ? Math.min(1, (item.totalSegundos ?? 0) / this.constanciaMaxSegundos)
        : 1;
      const alpha = 0.35 + 0.65 * intensidade;
      return { backgroundColor: `rgba(22, 163, 74, ${alpha.toFixed(2)})`, color: '#ffffff' };
    }
    if (item.status === 'faltou') {
      return { backgroundColor: '#ef4444', color: '#ffffff' };
    }
    return { backgroundColor: '#f1f5f9', color: '#94a3b8' };
  }

  private atualizarCalendario(lista: ConstanciaEstudoDiaDTO[]): void {
    const inicioMes = new Date(this.calendarioAno, this.calendarioMes, 1);
    const diasNoMes = new Date(this.calendarioAno, this.calendarioMes + 1, 0).getDate();
    const primeiroDiaSemana = inicioMes.getDay();
    const offset = (primeiroDiaSemana + 6) % 7; // semana inicia na segunda
    const mapa = new Map<string, ConstanciaEstudoDiaDTO>();
    const selectedKey = this.selectedDate ? this.formatarDataChave(this.selectedDate) : null;
    (lista || []).forEach((item) => {
      const data = this.parseDia(item.dia);
      mapa.set(this.formatarDataChave(data), item);
    });
    const dias: Array<{
      day?: number;
      date?: Date;
      status?: 'estudado' | 'faltou';
      totalSegundos?: number;
      tooltip?: string;
      isEmpty?: boolean;
      isSelected?: boolean;
    }> = [];
    for (let i = 0; i < offset; i += 1) {
      dias.push({ isEmpty: true });
    }
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const data = new Date(this.calendarioAno, this.calendarioMes, dia);
      const chave = this.formatarDataChave(data);
      const item = mapa.get(chave);
    const totalSegundos = item ? this.obterTempoSegundosConstancia(item) : 0;
    const status = totalSegundos > 0 || item?.teveEstudo ? 'estudado' : 'faltou';
      dias.push({
        day: dia,
        date: data,
        status,
        totalSegundos,
        tooltip: this.formatarTooltipConstancia(data, totalSegundos, item?.materias || []),
        isSelected: selectedKey === chave
      });
    }
    this.calendarioDias = dias;
  }

  selecionarDia(dia: { isEmpty?: boolean; date?: Date }): void {
    if (!dia || dia.isEmpty || !dia.date) return;
    this.selectedDate = this.inicioDia(dia.date);
    this.atualizarSelecaoDia(this.selectedDate);
    this.atualizarSparkline(this.selectedDate);
    this.plannerMetricas = this.calcularPlannerMetricas(
      this.blocosCache,
      this.constanciaMesCache,
      this.selectedDate
    );
    this.atualizarCalendario(this.constanciaDiasMes);
  }

  private atualizarSelecaoDia(data: Date): void {
    const chave = this.formatarDataChave(this.inicioDia(data));
    const item = (this.constanciaMesCache || []).find(
      (i) => this.formatarDataChave(this.parseDia(i.dia)) === chave
    );
    this.selectedMaterias = item?.materias ? [...item.materias] : [];
  }

  private somarConstanciaPeriodo(
    lista: ConstanciaEstudoDiaDTO[],
    periodo: { inicio: Date; fim: Date }
  ): number {
    const filtrada = this.filtrarConstanciaPorPeriodo(lista || [], periodo);
    return this.somarConstanciaSegundos(filtrada);
  }

  get periodoTempoMateriasLabel(): string {
    if (this.periodoSelecionado === '7d') return 'Ultimos 7 dias';
    if (this.periodoSelecionado === '30d') return 'Ultimos 30 dias';
    if (this.periodoSelecionado === '90d') return 'Ultimos 90 dias';
    return 'Todo periodo';
  }

  private atualizarTempoMateriasDistribuicao(): void {
    const lista = this.temposMaterias || [];
    if (!lista.length) {
      this.tempoMateriasDistribuicao = [];
      return;
    }
    const ordenadas = [...lista].sort(
      (a, b) => this.obterTempoEmSegundos(b) - this.obterTempoEmSegundos(a)
    );
    const top = ordenadas.slice(0, 4);
    const max = Math.max(1, ...top.map((item) => this.obterTempoEmSegundos(item)));
    this.tempoMateriasDistribuicao = top.map((item) => {
      const tempo = this.obterTempoEmSegundos(item);
      return {
        materiaId: item.materiaId,
        nome: item.materiaNome || 'Materia',
        percent: Math.max(2, Math.round((tempo / max) * 100)),
        label: this.formatarDuracaoSegundos(tempo)
      };
    });
  }

  private atualizarResumoRevisoes(itens: RevisaoDashboardItem[]): void {
    const atrasadas = (itens || []).filter((item) => item.status === 'VENCIDA').length;
    const hoje = (itens || []).filter((item) => item.status === 'EM_DIA').length;
    const emDia = (itens || []).filter((item) => item.status === 'FUTURA').length;
    const total = atrasadas + hoje + emDia;
    const calcularPct = (valor: number) => (total > 0 ? (valor / total) * 100 : 0);
    this.revisoesResumo = {
      atrasadas,
      hoje,
      emDia,
      total,
      atrasadasPct: calcularPct(atrasadas),
      hojePct: calcularPct(hoje),
      emDiaPct: calcularPct(emDia)
    };
  }

  private atualizarPlanoAtaque(): void {
    const materias = this.editalAtivo?.materias || [];
    if (!materias.length) {
      this.planoAtaqueSemana = [];
      return;
    }
    const pior = [...materias].sort((a, b) => (a.nivelDominio ?? 0) - (b.nivelDominio ?? 0));
    const foco = pior.slice(0, 2);

    const revisoesMap = new Map<number, { atrasadas: number; hoje: number }>();
    (this.revisoesDashboard || []).forEach((item) => {
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
        atrasadas: revisao.atrasadas,
        hoje: revisao.hoje,
        minutosSugeridos: minutos,
        filtroPreferido
      };
    });
  }

  private atualizarSparkline(baseDate: Date | null): void {
    const dataBase = baseDate ? this.inicioDia(baseDate) : this.inicioDia(new Date());
    const inicio = new Date(dataBase);
    inicio.setDate(dataBase.getDate() - 13);
    const mapa = new Map<string, number>();
    (this.constanciaDiasPeriodo || []).forEach((item) => {
      const chave = this.formatarDataChave(this.parseDia(item.dia));
      mapa.set(chave, this.obterTempoSegundosConstancia(item));
    });
    const pontos: Array<{ value: number; heightPct: number; label: string }> = [];
    let max = 0;
    for (let i = 0; i < 14; i += 1) {
      const dia = new Date(inicio);
      dia.setDate(inicio.getDate() + i);
      const chave = this.formatarDataChave(dia);
      const segundos = mapa.get(chave) ?? 0;
      const minutos = Math.round(segundos / 60);
      max = Math.max(max, minutos);
      pontos.push({
        value: minutos,
        heightPct: 0,
        label: this.formatarDataCurta(dia)
      });
    }
    this.sparklineSeries = pontos.map((p) => ({
      ...p,
      heightPct: max > 0 ? (p.value / max) * 100 : 2
    }));
  }
}
