import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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

@Component({
  selector: 'app-progresso',
  templateUrl: './progresso.component.html',
  styleUrls: ['./progresso.component.css']
})
export class ProgressoComponent implements OnInit {
  carregando = false;
  erro?: string;
  editais: Edital[] = [];
  editalAtivo?: Edital;
  temposMaterias: TempoEstudoMateriaDTO[] = [];
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
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarEditais();
    this.carregarTemposEstudo();
    this.carregarRevisoes();
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  formatarTendencia(v?: number | null): string {
    if (v == null || !Number.isFinite(v)) return '';
    const abs = Math.abs(v);
    const valor = abs > 0 && abs < 1 ? abs.toFixed(1) : Math.round(abs).toString();
    const sinal = v > 0 ? '+' : v < 0 ? '-' : '';
    return `${sinal}${valor}%`;
  }

  get materiasPontoFraco(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return [...materias].sort((a, b) => (a.nivelDominio ?? 0) - (b.nivelDominio ?? 0));
  }

  get materiasPontoFracoTop5(): EditalMateriaResumo[] {
    return this.materiasPontoFraco.slice(0, 5);
  }

  get materiasConcluidas(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return materias
      .filter((m) => this.isMateriaConcluida(m))
      .sort((a, b) => a.materiaNome.localeCompare(b.materiaNome));
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

  get coberturaFracao(): string | null {
    const edital: any = this.editalAtivo || {};
    const estudados =
      edital.topicosEstudados ??
      edital.topicosEstudadosGeral ??
      edital.totalTopicosEstudados ??
      edital.topicosConcluidos ??
      null;
    const total =
      edital.topicosTotal ??
      edital.totalTopicos ??
      edital.topicosTotalGeral ??
      edital.totalTopicosGeral ??
      null;
    if (Number.isFinite(estudados) && Number.isFinite(total)) {
      return `${estudados}/${total} topicos`;
    }
    return null;
  }

  get tendenciaCobertura(): number | null {
    return this.extrairTendencia('cobertura');
  }

  get tendenciaDominio(): number | null {
    return this.extrairTendencia('dominio');
  }

  get constanciaLegenda(): string {
    return 'Verde = estudou (mais forte = mais tempo) | Vermelho = nao estudou';
  }

  getPercentualConcluido(materia: EditalMateriaResumo): number {
    return Number((materia as any)?.percentualConcluido ?? materia.percentualEstudado ?? 0) || 0;
  }

  isMateriaConcluida(materia: EditalMateriaResumo): boolean {
    if ((materia as any)?.concluida != null) {
      return !!(materia as any).concluida;
    }
    return this.getPercentualConcluido(materia) >= 100;
  }

  isMateriaDominada(materia: EditalMateriaResumo): boolean {
    if ((materia as any)?.dominada != null) {
      return !!(materia as any).dominada;
    }
    const valor = Number((materia as any)?.percentualDominado ?? materia.nivelDominio ?? 0) || 0;
    return valor >= 100;
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
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    const ano = String(this.calendarioAno).slice(-2);
    return `${meses[this.calendarioMes]}/${ano}`;
  }

  toggleDetalheMateria(materiaId: number): void {
    this.materiaDetalheAbertaId = this.materiaDetalheAbertaId === materiaId ? null : materiaId;
  }

  irParaRevisoes(): void {
    this.router.navigate(['/area-restrita/revisoes']);
  }

  getDominioClasse(valor?: number | null): string {
    const pct = valor ?? 0;
    if (pct <= 50) {
      return 'progress-bar--low';
    }
    if (pct <= 70) {
      return 'progress-bar--mid';
    }
    return 'progress-bar--high';
  }

  private carregarEditais(): void {
    this.carregando = true;
    this.erro = undefined;

    this.editalService.listar().subscribe({
      next: (lista) => {
        this.editais = lista || [];
        this.editalAtivo = this.editais.find(e => e.ativo) || this.editais[0];
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar seus editais.';
        this.carregando = false;
      }
    });
  }

  private carregarTemposEstudo(): void {
    forkJoin({
      materias: this.salaEstudoService.listarTempoEstudoPorMateria().pipe(catchError(() => of([]))),
      total: this.salaEstudoService.buscarTempoEstudoTotal().pipe(catchError(() => of(null))),
      constancia: this.carregarConstanciaPeriodo().pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[]))),
      constanciaMes: this.salaEstudoService.listarConstanciaMensal().pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[]))),
      blocos: this.blocosEstudoService.listarBlocos().pipe(catchError(() => of([] as BlocoEstudoDTO[])))
    }).subscribe(({ materias, total, constancia, constanciaMes, blocos }) => {
      this.temposMaterias = materias || [];
      this.tempoTotalLabel = this.formatarTempoTotal(total);
      this.tempoSemanalLabel = this.formatarTempoSemanal(total);
      this.constanciaLabel = this.formatarConstanciaMensal(constancia || []);
      this.constanciaDias = constanciaMes || [];
      this.constanciaDiasMes = constanciaMes || [];
      this.constanciaDiasPeriodo = constancia || [];
      this.constanciaMaxSegundos = this.definirMaxConstancia(constanciaMes || []);
      this.tempoMensalLabel = this.formatarTempoMensal(constanciaMes || []);
      this.materiaDestaqueLabel = this.definirMateriaDestaque(this.temposMaterias);
      this.plannerMetricas = this.calcularPlannerMetricas(blocos || [], constanciaMes || [], total);
      this.atualizarCalendario(constanciaMes || []);
    });
  }

  private carregarRevisoes(): void {
    this.salaEstudoService.listarRevisoesDashboard()
      .pipe(catchError(() => of([])))
      .subscribe((itens) => {
        this.revisoesVencidasCount = (itens || []).filter((item) => item.status === 'VENCIDA').length;
      });
  }

  private carregarConstanciaMesSelecionado(): void {
    this.salaEstudoService
      .listarConstanciaMensal(this.calendarioAno, this.calendarioMes + 1)
      .pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[])))
      .subscribe((lista) => {
        this.constanciaDiasMes = lista || [];
        this.constanciaMaxSegundos = this.definirMaxConstancia(this.constanciaDiasMes);
        this.tempoMensalLabel = this.formatarTempoMensal(this.constanciaDiasMes);
        this.atualizarCalendario(this.constanciaDiasMes);
      });
  }

  private formatarTempoTotal(dto: TempoEstudoTotalDTO | null): string {
    const totalSegundos = this.obterTempoEmSegundos(dto);
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private formatarTempoSemanal(dto: TempoEstudoTotalDTO | null): string {
    if (!dto) return '--';
    const total = (dto as any).totalSegundosSemana ?? (dto as any).tempoTotalSemana ?? 0;
    const totalSegundos = Number(total) || 0;
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private formatarTempoMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const totalSegundos = lista.reduce((acc, item) => acc + (item.totalSegundos ?? 0), 0);
    return totalSegundos > 0 ? this.formatarDuracaoSegundos(totalSegundos) : '--';
  }

  private calcularPlannerMetricas(
    blocos: BlocoEstudoDTO[],
    constanciaMes: ConstanciaEstudoDiaDTO[],
    total: TempoEstudoTotalDTO | null
  ): Array<{
    label: string;
    plannedLabel: string;
    actualLabel: string;
    percentLabel: string;
    percentBar: number;
    status: 'ok' | 'warn';
  }> {
    const hoje = this.inicioDia(new Date());
    const periodoSemana = this.obterPeriodoSemanaAtual(hoje);
    const periodoMes = this.obterPeriodoMesAtual(hoje);
    const planejadoDiaSeg = this.calcularPlanejadoDia(blocos, hoje);
    const planejadoSemanaSeg = this.calcularPlanejadoPeriodo(blocos, periodoSemana);
    const planejadoMesSeg = this.calcularPlanejadoPeriodo(blocos, periodoMes);

    const realizadoSemanaSeg = this.obterTempoSemanalSegundos(total);
    const realizadoMesSeg = this.somarConstanciaSegundos(constanciaMes);
    const realizadoDiaSeg = this.obterConstanciaHojeSegundos(constanciaMes);

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

  private obterTempoSemanalSegundos(dto: TempoEstudoTotalDTO | null): number {
    if (!dto) return 0;
    const total = (dto as any).totalSegundosSemana ?? (dto as any).tempoTotalSemana ?? 0;
    return Number(total) || 0;
  }

  private somarConstanciaSegundos(lista: ConstanciaEstudoDiaDTO[]): number {
    return (lista || []).reduce((acc, item) => acc + (item.totalSegundos ?? 0), 0);
  }

  private obterConstanciaHojeSegundos(lista: ConstanciaEstudoDiaDTO[]): number {
    if (!lista?.length) return 0;
    const hoje = this.inicioDia(new Date());
    const chaveHoje = this.formatarDataChave(hoje);
    const item = lista.find((i) => this.formatarDataChave(this.parseDia(i.dia)) === chaveHoje);
    return item?.totalSegundos ?? 0;
  }

  private formatarConstanciaMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const periodo = this.obterPeriodoAtual();
    const diasPeriodo = this.diasNoPeriodo(periodo).length;
    if (!diasPeriodo) return '--';
    const diasComEstudo = lista.filter((item) => (item.totalSegundos ?? 0) > 0 || item.teveEstudo).length;
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
    const total = (dto as any).tempoTotalSegundos
      ?? (dto as any).tempoTotal
      ?? (dto as any).totalSegundos
      ?? (dto as any).totalSegundosSemana
      ?? (dto as any).segundos
      ?? 0;
    return Number(total) || 0;
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

  private extrairTendencia(tipo: 'cobertura' | 'dominio'): number | null {
    const edital: any = this.editalAtivo || {};
    const mapa: Record<string, any[]> = {
      cobertura: [
        edital.tendenciaCobertura,
        edital.variacaoCobertura,
        edital.deltaCobertura,
        edital.coberturaTrend,
        edital.coberturaDelta
      ],
      dominio: [
        edital.tendenciaDominio,
        edital.variacaoDominio,
        edital.deltaDominio,
        edital.dominioTrend,
        edital.dominioDelta
      ]
    };
    const lista = mapa[tipo].find((valor) => valor != null);
    const num = Number(lista);
    return Number.isFinite(num) ? num : null;
  }

  private definirMaxConstancia(lista: ConstanciaEstudoDiaDTO[]): number {
    return Math.max(0, ...(lista || []).map((item) => item.totalSegundos ?? 0));
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
      this.salaEstudoService
        .listarConstanciaMensal(mes.ano, mes.mes + 1)
        .pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[])))
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

  private formatarDataCurta(data: Date): string {
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
    }> = [];
    for (let i = 0; i < offset; i += 1) {
      dias.push({ isEmpty: true });
    }
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const data = new Date(this.calendarioAno, this.calendarioMes, dia);
      const chave = this.formatarDataChave(data);
      const item = mapa.get(chave);
      const totalSegundos = item?.totalSegundos ?? 0;
      const status = totalSegundos > 0 || item?.teveEstudo ? 'estudado' : 'faltou';
      dias.push({
        day: dia,
        date: data,
        status,
        totalSegundos,
        tooltip: this.formatarTooltipConstancia(data, totalSegundos, item?.materias || [])
      });
    }
    this.calendarioDias = dias;
  }
}
