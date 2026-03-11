export type PressaoJanelaDias = 1 | 7 | 15 | 30;

export interface PressaoDoDiaDTO {
  hoje?: PressaoHojeDTO | null;
  janela?: PressaoJanelaDTO | null;
  progresso?: PressaoProgressoDTO | null;
}

export interface PressaoHojeDTO {
  dataRef?: string | null;
  modoAtivoHoje?: string | null;
  headlineHoje?: string | null;
  contadores?: PressaoContadoresDTO | null;
  capAplicado?: number | null;
  totalDisponivelHoje?: number | null;
  exibindoHoje?: number | null;
  filaHoje?: PressaoFilaItemDTO[] | null;
}

export interface PressaoJanelaDTO {
  janelaDias?: PressaoJanelaDias | number | null;
  ate?: string | null;
  contadores?: PressaoContadoresDTO | null;
  agenda?: AgendaDiaDTO[] | null;
}

export interface PressaoContadoresDTO {
  criticos?: number | null;
  emRisco?: number | null;
  manutencaoVencida?: number | null;
  manutencaoHoje?: number | null;
  totalHoje?: number | null;
}

export interface AgendaDiaDTO {
  dia?: string | null;
  itens?: number | null;
}

export interface PressaoProgressoDTO {
  streakDias?: number | null;
  ultimoDiaEstudado?: string | null;
  melhorStreakDias?: number | null;
  cobertura?: CoberturaDTO | null;
}

export interface CoberturaDTO {
  topicosTotal?: number | null;
  topicosEstudados?: number | null;
  topicosNaoEstudados?: number | null;
}

export interface PressaoFilaItemDTO {
  topicoId?: number | null;
  materiaId?: number | null;
  materiaNome?: string | null;
  topicoNome?: string | null;
  categoria?: string | null;
  classificacao?: string | null;
  score?: number | null;
  proxRevisao?: string | null;
  proximaRevisao?: string | null;
  acaoLabel?: string | null;
  acaoCodigo?: string | null;
  deepLink?: string | null;
}


