export type JanelaCognitiva = 7 | 14 | 30;
export type FiltroCognitivo = 'CRITICO' | 'EM_RISCO' | 'CONSOLIDADO' | 'SEM_DADOS' | string;

export interface RetencaoCognitivaResumoDTO {
  janelaDias: JanelaCognitiva | number;
  retencao14d: number | null;
  retencao7d?: number | null;
  retencao30d?: number | null;
  totalTopicos: number | null;
  consolidados: number | null;
}

export interface TopicoCognitivoDTO {
  topicoId: number;
  materiaId: number | null;
  nomeMateria: string | null;
  nomeTopico: string | null;
  score: number | null;
  risk: number | null;
  stability: number | null;
  diasDesdeUltimoEvento: number | null;
  classificacao: string | null;
  dataUltimoEvento?: string | null;
  ultimoEventoEm?: string | null;
  ultimaRevisao?: string | null;
  ultimaRevisaoEm?: string | null;
  dataUltimaRevisao?: string | null;
}
