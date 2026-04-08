import { EditalResumoRetencaoDTO, RetencaoAnalyticsSerieDTO } from 'src/app/core/models/retencao-analytics.models';

export type NivelPressao = 'ALTA' | 'MODERADA' | 'CONTROLADA';

export interface SnapshotResumo {
  data: string | null;
  totalTopicos: number;
  consolidados: number;
  criticos: number;
  emRisco: number;
  semDados: number;
}

export interface PressaoInsight {
  pressaoHoje: number;
  nivelPressao: NivelPressao;
  deltaPP: number | null;
  labelComparacao: string;
}

export interface EvolucaoInsight {
  principal: string;
  secundario: string;
  extra: string;
}

export interface VelocidadeInsight {
  valor: string;
  comparativoLabel: string;
}

export interface ProjecaoInsight {
  valor: string;
  subtitulo: string;
  sugestaoOpcional: string;
}

export function calcPercent(value: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const percent = (Number(value || 0) / total) * 100;
  return Number(percent.toFixed(1));
}

export function calcDelta(a: number, b: number): number {
  return Number(a || 0) - Number(b || 0);
}

export function normalizarSnapshot(s: RetencaoAnalyticsSerieDTO | null | undefined): SnapshotResumo | null {
  if (!s) return null;
  const consolidados = Number(s.consolidados || 0);
  const criticos = Number(s.criticos || 0);
  const emRisco = Number(s.emRisco || 0);
  const semDados = Number(s.semDados || 0);
  const totalTopicos = consolidados + criticos + emRisco + semDados;
  return {
    data: s.data || null,
    totalTopicos,
    consolidados,
    criticos,
    emRisco,
    semDados
  };
}

export function normalizarSummary(summary: EditalResumoRetencaoDTO | null | undefined): SnapshotResumo | null {
  if (!summary) return null;
  return {
    data: null,
    totalTopicos: Number(summary.totalTopicos || 0),
    consolidados: Number(summary.topicosConsolidados || 0),
    criticos: Number(summary.topicosCriticos || 0),
    emRisco: Number(summary.topicosEmRisco || 0),
    semDados: Number(summary.topicosSemDados || 0)
  };
}

export function getSnapshotHoje(snapshots: RetencaoAnalyticsSerieDTO[] | null | undefined): SnapshotResumo | null {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  return normalizarSnapshot(snapshots[snapshots.length - 1]);
}

export function getSnapshotComparacao(
  snapshots: RetencaoAnalyticsSerieDTO[] | null | undefined,
  _janelaDias: number
): SnapshotResumo | null {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  if (snapshots.length >= 8) return normalizarSnapshot(snapshots[snapshots.length - 8]);
  return normalizarSnapshot(snapshots[0]);
}

function formatDeltaPp(deltaPP: number | null): string {
  if (deltaPP == null || Number.isNaN(deltaPP)) return '— (historico insuficiente)';
  if (deltaPP === 0) return 'estavel vs 7 dias atras';
  const sinal = deltaPP > 0 ? '+' : '';
  return `${sinal}${deltaPP.toFixed(1)} p.p. vs 7 dias atras`;
}

export function insightPressao(hoje: SnapshotResumo | null, ref: SnapshotResumo | null): PressaoInsight {
  const pressaoHoje = calcPercent(Number(hoje?.criticos || 0), Number(hoje?.totalTopicos || 0));
  let nivelPressao: NivelPressao = 'CONTROLADA';
  if (pressaoHoje >= 60) nivelPressao = 'ALTA';
  else if (pressaoHoje >= 30) nivelPressao = 'MODERADA';

  let deltaPP: number | null = null;
  if (ref && ref.totalTopicos > 0) {
    const pressaoRef = calcPercent(ref.criticos, ref.totalTopicos);
    deltaPP = Number((pressaoHoje - pressaoRef).toFixed(1));
  }

  return {
    pressaoHoje,
    nivelPressao,
    deltaPP,
    labelComparacao: formatDeltaPp(deltaPP)
  };
}

export function insightEvolucao(hoje: SnapshotResumo | null, ref: SnapshotResumo | null): EvolucaoInsight {
  if (!hoje || !ref) {
    return {
      principal: '—',
      secundario: 'historico insuficiente',
      extra: '—'
    };
  }

  const deltaConsolidados = calcDelta(hoje.consolidados, ref.consolidados);
  const deltaCriticos = calcDelta(hoje.criticos, ref.criticos);
  const sinalCons = deltaConsolidados > 0 ? '+' : '';
  const topicoTexto = Math.abs(deltaConsolidados) === 1 ? 'topico consolidado' : 'topicos consolidados';

  let extra = 'criticos estaveis';
  if (deltaCriticos < 0) extra = `e ${deltaCriticos} critico`;
  else if (deltaCriticos > 0) extra = `e +${deltaCriticos} critico`;

  return {
    principal: `${sinalCons}${deltaConsolidados} ${topicoTexto}`,
    secundario: 'nos ultimos 7 dias',
    extra
  };
}

export function insightVelocidade(
  velocidadeHoje: number | null,
  snapshotsHoje: SnapshotResumo | null,
  snapshotsRef: SnapshotResumo | null
): VelocidadeInsight {
  if (velocidadeHoje == null || Number.isNaN(velocidadeHoje)) {
    return { valor: '—', comparativoLabel: '— (sem historico de velocidade)' };
  }

  let comparativoLabel = '— (sem historico de velocidade)';
  if (snapshotsHoje && snapshotsRef) {
    const deltaConsolidado = calcDelta(snapshotsHoje.consolidados, snapshotsRef.consolidados);
    const ritmo = deltaConsolidado / 7;
    if (Number.isFinite(ritmo) && ritmo > 0) {
      const velocidadeRef = Number((1 / ritmo).toFixed(1));
      const deltaDias = Number((velocidadeHoje - velocidadeRef).toFixed(1));
      if (deltaDias < 0) comparativoLabel = `↓ ${Math.abs(deltaDias).toFixed(1)} dias vs periodo anterior`;
      else if (deltaDias > 0) comparativoLabel = `↑ ${deltaDias.toFixed(1)} dia vs periodo anterior`;
      else comparativoLabel = 'estavel vs periodo anterior';
    }
  }

  return { valor: `${velocidadeHoje.toFixed(1)} dias`, comparativoLabel };
}

export function insightProjecao(hoje: SnapshotResumo | null, ref: SnapshotResumo | null): ProjecaoInsight {
  if (!hoje || !ref || !hoje.data || !ref.data) {
    return { valor: '—', subtitulo: 'precisamos de mais historico', sugestaoOpcional: '' };
  }

  const hojeDate = new Date(hoje.data);
  const refDate = new Date(ref.data);
  const diffMs = hojeDate.getTime() - refDate.getTime();
  const diasEntre = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
  const ritmoPorDia = calcDelta(hoje.consolidados, ref.consolidados) / diasEntre;

  if (!Number.isFinite(ritmoPorDia) || ritmoPorDia <= 0) {
    return { valor: '—', subtitulo: 'precisamos de mais historico', sugestaoOpcional: '' };
  }

  const faltam = Math.max(0, hoje.totalTopicos - hoje.consolidados);
  const diasEstimados = Math.ceil(faltam / ritmoPorDia);
  const diasComMaisUm = Math.ceil(faltam / (ritmoPorDia + 1));

  return {
    valor: `~${diasEstimados} dias`,
    subtitulo: 'mantendo seu ritmo recente',
    sugestaoOpcional: `+1 topico/dia -> ~${diasComMaisUm} dias`
  };
}

