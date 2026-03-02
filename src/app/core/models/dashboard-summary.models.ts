export type DashboardModoAtivo = 'score' | 'manutencao' | string;

export interface DashboardSummary {
  asOf: string;
  janelaDias: number;
  edital?: {
    id?: number | null;
    nome?: string | null;
  } | null;
  modoAtivo: DashboardModoAtivo;
  modoLabel?: string | null;
  resumoAcionavel: ResumoAcionavel;
  filaAtiva: FilaAtiva;
  focoOperacional?: DashboardFocoOperacional | null;
  informativo?: DashboardInformativo | null;
}

export interface DashboardFocoOperacional {
  estado?: {
    codigo?: 'ESTAVEL' | 'SOB_PRESSAO' | 'ALTA_PRESSAO' | string | null;
    label?: string | null;
    descricao?: string | null;
    classeCss?: string | null;
  } | null;
  pressao?: {
    risco24h?: number | null;
    risco48h?: number | null;
    risco7d?: number | null;
  } | null;
  projecao?: {
    evolucao7dPp?: number | null;
    evolucao7dTopicos?: number | null;
    evolucao7dCriticos?: number | null;
    projecaoDiasRitmoAtual?: number | null;
    projecaoDiasMais3PorDia?: number | null;
  } | null;
  acao?: {
    ctaCodigo?: 'REVISAR_AGORA' | 'REFORCAR_24H' | 'MANTER_RITMO' | string | null;
    ctaLabel?: string | null;
    motivo?: string | null;
  } | null;
}

export interface ResumoAcionavel {
  totalAgora: number;
  criticos: number;
  emRisco: number;
  manutencaoVencida?: number;
  manutencaoHoje?: number;
}

export interface FilaAtiva {
  criterioOrdenacao?: string | null;
  itens: FilaItem[];
}

export interface FilaItem {
  topicoId: number;
  topicoNome?: string | null;
  materiaId?: number | null;
  categoria?: string | null;
  score?: number | null;
  diasSemEvento?: number | null;
  proxRevisao?: string | null;
  errosJanela?: number | null;
  fonte?: 'score' | 'manutencao' | string | null;
}

export interface DashboardInformativo {
  baseMonitorada?: {
    total: number;
    consolidados: number;
    emRisco: number;
    criticos: number;
    semDados: number;
  } | null;
  editalCompleto?: {
    total: number;
    cobertos?: number;
    consolidados: number;
  } | null;
}
