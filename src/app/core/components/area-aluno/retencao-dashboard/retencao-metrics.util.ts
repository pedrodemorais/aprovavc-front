import { EditalResumoRetencaoDTO, RetencaoAnalyticsSerieDTO } from 'src/app/core/models/retencao-analytics.models';

export type NivelPressao = 'ALTA' | 'MODERADA' | 'CONTROLADA';

export interface PressaoEditalResult {
  pressaoPercent: number;
  nivelPressao: NivelPressao;
}

export interface Evolucao7DiasResult {
  deltaPontosPercentuais: number;
  deltaConsolidados: number;
}

function totalNoSnapshot(snapshot: RetencaoAnalyticsSerieDTO): number {
  const total =
    Number(snapshot.consolidados || 0) +
    Number(snapshot.emRisco || 0) +
    Number(snapshot.criticos || 0) +
    Number(snapshot.semDados || 0);
  return Number.isFinite(total) ? total : 0;
}

export function calcularPressaoEdital(
  summary: Pick<EditalResumoRetencaoDTO, 'totalTopicos' | 'topicosCriticos'> | null | undefined
): PressaoEditalResult {
  const totalTopicos = Number(summary?.totalTopicos || 0);
  const criticos = Number(summary?.topicosCriticos || 0);
  const pressaoPercent = totalTopicos > 0 ? (criticos / totalTopicos) * 100 : 0;

  let nivelPressao: NivelPressao = 'CONTROLADA';
  if (pressaoPercent >= 60) nivelPressao = 'ALTA';
  else if (pressaoPercent >= 30) nivelPressao = 'MODERADA';

  return { pressaoPercent, nivelPressao };
}

export function calcularEvolucao7Dias(
  snapshots: RetencaoAnalyticsSerieDTO[] | null | undefined
): Evolucao7DiasResult | null {
  if (!Array.isArray(snapshots) || snapshots.length < 8) return null;

  const hoje = snapshots[snapshots.length - 1];
  const seteDiasAtras = snapshots[snapshots.length - 8];
  if (!hoje || !seteDiasAtras) return null;

  const totalHoje = totalNoSnapshot(hoje);
  const total7d = totalNoSnapshot(seteDiasAtras);
  if (totalHoje <= 0 || total7d <= 0) return null;

  const consolidadosHoje = Number(hoje.consolidados || 0);
  const consolidados7d = Number(seteDiasAtras.consolidados || 0);

  const consolidacaoHoje = (consolidadosHoje / totalHoje) * 100;
  const consolidacao7d = (consolidados7d / total7d) * 100;

  return {
    deltaPontosPercentuais: consolidacaoHoje - consolidacao7d,
    deltaConsolidados: consolidadosHoje - consolidados7d
  };
}

export function calcularProjecaoConclusao(
  summary: Pick<EditalResumoRetencaoDTO, 'totalTopicos' | 'topicosConsolidados'> | null | undefined,
  snapshots: RetencaoAnalyticsSerieDTO[] | null | undefined
): number | null {
  if (!summary || !Array.isArray(snapshots) || snapshots.length < 8) return null;

  const hoje = snapshots[snapshots.length - 1];
  const seteDiasAtras = snapshots[snapshots.length - 8];
  if (!hoje || !seteDiasAtras) return null;

  const ritmoPorDia = (Number(hoje.consolidados || 0) - Number(seteDiasAtras.consolidados || 0)) / 7;
  if (!Number.isFinite(ritmoPorDia) || ritmoPorDia <= 0) return null;

  const faltam = Number(summary.totalTopicos || 0) - Number(summary.topicosConsolidados || 0);
  if (!Number.isFinite(faltam) || faltam <= 0) return 0;

  return Math.ceil(faltam / ritmoPorDia);
}

export function calcularVelocidadeConsolidacao(mediaDiasParaConsolidar: number | null | undefined): number | null {
  const valor = Number(mediaDiasParaConsolidar);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Number(valor.toFixed(1));
}

