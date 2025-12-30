import { Component, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
    private blocosEstudoService: BlocosEstudoService
  ) {}

  ngOnInit(): void {
    this.carregarEditais();
    this.carregarTemposEstudo();
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

  get materiasConcluidas(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return materias
      .filter((m) => (m.percentualEstudado ?? 0) >= 100)
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
      constancia: this.salaEstudoService.listarConstanciaMensal().pipe(catchError(() => of([] as ConstanciaEstudoDiaDTO[]))),
      blocos: this.blocosEstudoService.listarBlocos().pipe(catchError(() => of([] as BlocoEstudoDTO[])))
    }).subscribe(({ materias, total, constancia, blocos }) => {
      this.temposMaterias = materias || [];
      this.tempoTotalLabel = this.formatarTempoTotal(total);
      this.tempoSemanalLabel = this.formatarTempoSemanal(total);
      this.constanciaLabel = this.formatarConstanciaMensal(constancia || []);
      this.constanciaDias = constancia || [];
      this.tempoMensalLabel = this.formatarTempoMensal(constancia || []);
      this.materiaDestaqueLabel = this.definirMateriaDestaque(this.temposMaterias);
      this.plannerMetricas = this.calcularPlannerMetricas(blocos || [], constancia || [], total);
    });
  }

  private formatarTempoTotal(dto: TempoEstudoTotalDTO | null): string {
    const totalSegundos = this.obterTempoEmSegundos(dto);
    return totalSegundos > 0 ? this.formatarDuracao(totalSegundos) : '--';
  }

  private formatarTempoSemanal(dto: TempoEstudoTotalDTO | null): string {
    if (!dto) return '--';
    const total = (dto as any).totalSegundosSemana ?? (dto as any).tempoTotalSemana ?? 0;
    const totalSegundos = Number(total) || 0;
    return totalSegundos > 0 ? this.formatarDuracao(totalSegundos) : '--';
  }

  private formatarTempoMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const totalSegundos = lista.reduce((acc, item) => acc + (item.totalSegundos ?? 0), 0);
    return totalSegundos > 0 ? this.formatarDuracao(totalSegundos) : '--';
  }

  private calcularPlannerMetricas(
    blocos: BlocoEstudoDTO[],
    constancia: ConstanciaEstudoDiaDTO[],
    total: TempoEstudoTotalDTO | null
  ): Array<{
    label: string;
    plannedLabel: string;
    actualLabel: string;
    percentLabel: string;
    percentBar: number;
    status: 'ok' | 'warn';
  }> {
    const planejadoSemanaSeg = this.calcularPlanejadoSemana(blocos);
    const planejadoDiaSeg = this.calcularPlanejadoDia(blocos);
    const planejadoMesSeg = this.calcularPlanejadoMes(blocos, constancia);

    const realizadoSemanaSeg = this.obterTempoSemanalSegundos(total);
    const realizadoMesSeg = this.somarConstanciaSegundos(constancia);
    const realizadoDiaSeg = this.obterConstanciaHojeSegundos(constancia);

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
    const plannedLabel = planejadoSeg > 0 ? this.formatarDuracao(planejadoSeg) : '--';
    const actualLabel = this.formatarDuracao(realizadoSeg);
    const percent = planejadoSeg > 0 ? (realizadoSeg / planejadoSeg) * 100 : 0;
    const percentBar = Math.min(100, Math.max(0, percent));
    const percentLabel = planejadoSeg > 0 ? `${Math.round(percent)}%` : '--';
    return {
      label,
      plannedLabel,
      actualLabel,
      percentLabel,
      percentBar,
      status: planejadoSeg > 0 && realizadoSeg >= planejadoSeg ? 'ok' : 'warn'
    };
  }

  private calcularPlanejadoSemana(blocos: BlocoEstudoDTO[]): number {
    if (!blocos?.length) return 0;
    const totalMin = blocos.reduce((acc, bloco) => acc + (bloco.minutosDisponiveis ?? 0), 0);
    return totalMin * 60;
  }

  private calcularPlanejadoDia(blocos: BlocoEstudoDTO[]): number {
    if (!blocos?.length) return 0;
    const hoje = new Date();
    const indiceDia = hoje.getDay() === 0 ? 7 : hoje.getDay();
    const bloco = blocos.find((b) => b.numero === indiceDia);
    return (bloco?.minutosDisponiveis ?? 0) * 60;
  }

  private calcularPlanejadoMes(blocos: BlocoEstudoDTO[], constancia: ConstanciaEstudoDiaDTO[]): number {
    if (!blocos?.length) return 0;
    const referencia = constancia?.length ? this.obterAnoMes(constancia[0].dia) : this.obterAnoMes(new Date());
    const diasNoMes = new Date(referencia.ano, referencia.mes + 1, 0).getDate();
    let totalMin = 0;
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const data = new Date(referencia.ano, referencia.mes, dia);
      const indiceDia = data.getDay() === 0 ? 7 : data.getDay();
      const bloco = blocos.find((b) => b.numero === indiceDia);
      totalMin += bloco?.minutosDisponiveis ?? 0;
    }
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
    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const referencia = this.obterAnoMes(lista[0].dia);
    if (referencia.ano !== hoje.getFullYear() || referencia.mes !== hoje.getMonth()) {
      return 0;
    }
    const item = lista.find((i) => this.obterDiaDoMes(i.dia) === diaHoje);
    return item?.totalSegundos ?? 0;
  }

  private formatarConstanciaMensal(lista: ConstanciaEstudoDiaDTO[]): string {
    if (!lista?.length) return '--';
    const hoje = new Date();
    const diasDecorridos = hoje.getDate();
    const diasComEstudo = lista.filter((item) => {
      const data = new Date(item.dia);
      return data.getDate() <= diasDecorridos && !!item.teveEstudo;
    }).length;
    if (!diasDecorridos) return '--';
    const percentual = Math.round((diasComEstudo / diasDecorridos) * 100);
    return `${percentual}%`;
  }

  get constanciaDiasVisiveis(): Array<{ dia: number; status: 'estudado' | 'faltou' | 'futuro' }> {
    if (!this.constanciaDias?.length) return [];
    const referencia = this.obterAnoMes(this.constanciaDias[0].dia);
    const diasNoMes = new Date(referencia.ano, referencia.mes + 1, 0).getDate();
    const mapa = new Map<number, boolean>();
    this.constanciaDias.forEach((item) => {
      const dia = this.obterDiaDoMes(item.dia);
      if (dia > 0) {
        mapa.set(dia, !!item.teveEstudo);
      }
    });
    const hoje = new Date();
    const mesAtual = hoje.getFullYear() === referencia.ano && hoje.getMonth() === referencia.mes;
    const diaHoje = mesAtual ? hoje.getDate() : diasNoMes;
    const resultado: Array<{ dia: number; status: 'estudado' | 'faltou' | 'futuro' }> = [];
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      if (mesAtual && dia > diaHoje) {
        resultado.push({ dia, status: 'futuro' });
      } else {
        resultado.push({ dia, status: mapa.get(dia) ? 'estudado' : 'faltou' });
      }
    }
    return resultado;
  }

  private obterDiaDoMes(valor: string | Date): number {
    if (valor instanceof Date) {
      return valor.getDate();
    }
    if (typeof valor === 'string') {
      const dataStr = valor.split('T')[0] || valor;
      const partes = dataStr.split('-');
      if (partes.length === 3) {
        return Number(partes[2]) || 0;
      }
    }
    const data = new Date(valor);
    return data.getDate();
  }

  private obterAnoMes(valor: string | Date): { ano: number; mes: number } {
    if (valor instanceof Date) {
      return { ano: valor.getFullYear(), mes: valor.getMonth() };
    }
    if (typeof valor === 'string') {
      const dataStr = valor.split('T')[0] || valor;
      const partes = dataStr.split('-');
      if (partes.length === 3) {
        const ano = Number(partes[0]);
        const mes = Number(partes[1]) - 1;
        if (!Number.isNaN(ano) && !Number.isNaN(mes)) {
          return { ano, mes };
        }
      }
    }
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  }

  private definirMateriaDestaque(materias: TempoEstudoMateriaDTO[]): string {
    if (!materias?.length) return '--';
    const ordenadas = [...materias].sort((a, b) => this.obterTempoEmSegundos(b) - this.obterTempoEmSegundos(a));
    const destaque = ordenadas[0];
    const tempo = this.formatarDuracao(this.obterTempoEmSegundos(destaque));
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

  private formatarDuracao(totalSegundos: number): string {
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    if (horas > 0) {
      return `${horas}h ${minutos}m`;
    }
    return `${minutos}m`;
  }
}
