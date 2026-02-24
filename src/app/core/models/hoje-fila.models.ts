export enum PrioridadeFilaHoje {
  ATRASADA = 'ATRASADA',
  CRITICO = 'CRITICO',
  EM_RISCO = 'EM_RISCO',
  ERRO_REINCIDENTE = 'ERRO_REINCIDENTE',
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BAIXA = 'BAIXA'
}

export enum TipoFilaHoje {
  TOPICO = 'TOPICO',
  FLASHCARD = 'FLASHCARD',
  ERRO = 'ERRO'
}

export interface HojeFilaItemDTO {
  topicoId: number;
  materiaId: number | null;
  materiaNome: string | null;
  topicoNome: string | null;
  prioridade: PrioridadeFilaHoje;
  motivo: string | null;
  tempoEstimadoMinutos: number | null;
  deepLink: string;
  tipo: TipoFilaHoje;
}

export interface HojeFilaResponseDTO {
  totalItens: number;
  tempoEstimadoMinutos: number;
  itens: HojeFilaItemDTO[];
  insights?: HojeFilaInsightsDTO | null;
}

export interface HojeFilaInsightsDTO {
  streakDias?: number | null;
  consolidadosSemana?: number | null;
  tendencia7dPercent?: number | null;
  tendencia7dLabel?: string | null;
  consolidadosSemanaLabel?: string | null;
}

export interface HojeResumoDTO {
  dataReferencia: string;
  timezone: string;
  streakDias: number | null;
  estudouHoje: boolean;
  diasAtivosUltimos7: number;
  diasAtivosUltimos30: number;
  itensConcluidosHoje: number;
  tempoEstudoHojeMinutos: number;
  atualizadoEm: string | null;
}

export type StatusHojeStreak = 'NAO_INICIOU' | 'INICIOU' | 'CONCLUIU';

export interface DashboardStreakResumoDTO {
  streakAtual: number;
  melhorStreak: number;
  consistencia30DiasQtd: number;
  consistencia30DiasTotal: number;
  consistencia30DiasPercent: number;
  statusHoje: StatusHojeStreak;
  dataReferencia: string;
}
