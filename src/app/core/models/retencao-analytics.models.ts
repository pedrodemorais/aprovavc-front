export enum ClassificacaoRetencaoTopico {
  CONSOLIDADO = 'CONSOLIDADO',
  EM_RISCO = 'EM_RISCO',
  CRITICO = 'CRITICO',
  SEM_DADOS = 'SEM_DADOS',
}

export enum TendenciaRetencaoTopico {
  SUBINDO = 'SUBINDO',
  CAINDO = 'CAINDO',
  ESTAVEL = 'ESTAVEL',
}

export enum AvaliacaoRevisao {
  ERREI = 'ERREI',
  DIFICIL = 'DIFICIL',
  BOM = 'BOM',
  FACIL = 'FACIL',
}

export enum TipoItem {
  TOPICO = 'TOPICO',
  FLASHCARD = 'FLASHCARD',
}

export interface EditalResumoRetencaoDTO {
  totalTopicos: number;
  topicosConsolidados: number;
  topicosEmRisco: number;
  topicosCriticos: number;
  topicosSemDados: number;
  percentualConsolidado: number;
  percentualEmRisco: number;
  percentualCritico: number;
  percentualSemDados: number;
  janelaDias?: number;
  escopoCalculo?: 'EDITAL_COMPLETO' | 'BASE_MONITORADA' | 'MISTO' | string;
  totalTopicosEdital?: number;
  totalTopicosMonitorados?: number;
  topicosConsolidadosEdital?: number;
  topicosConsolidadosMonitorados?: number;
  percentualConsolidadoEditalCompleto?: number;
  percentualConsolidadoBaseMonitorada?: number;
  faltamTopicosEdital?: number;
  faltamTopicosMonitorados?: number;
}

export interface TopicoRiscoDTO {
  topicoId: number;
  materiaId: number | null;
  nomeTopico: string | null;
  classificacao: ClassificacaoRetencaoTopico;
  score: number | null;
  diasDesdeUltimoEvento: number | null;
  proximaRevisao: string | null;
  totalErrosNaJanela: number | null;
  tendencia: TendenciaRetencaoTopico;
}

export interface ErroReincidenteDTO {
  topicoId: number;
  materiaId: number | null;
  nomeTopico: string | null;
  totalErros: number;
  totalTentativas: number;
  taxaErro: number;
  ultimaOcorrencia: string;
  caixinhaAtual: number | null;
  sugestaoAcao: string;
}

export interface RetencaoPontoDTO {
  data: string;
  scoreDia: number | null;
  eventosNoDia: number;
  errosNoDia: number;
}

export interface RevisaoEventoHistoricoDTO {
  respondidoEm: string;
  avaliacao: AvaliacaoRevisao;
  tipoItem: TipoItem;
  caixinhaAntes: number | null;
  caixinhaDepois: number | null;
  proximaRevisaoAntes: string | null;
  proximaRevisaoDepois: string | null;
}

export interface RetencaoAnalyticsSerieDTO {
  data: string;
  consolidados: number;
  emRisco: number;
  criticos: number;
  semDados: number;
  consolidacaoPercent: number;
  criticosCount: number;
}

export interface RetencaoAnalyticsResponseDTO {
  janelaDias: number;
  totalTopicos: number;
  dominioScore: number;
  tempoMedioDiasAteConsolidar: number | null;
  serie: RetencaoAnalyticsSerieDTO[];
}

export interface RetencaoSemDadosItemDTO {
  topicoId: number;
  nomeTopico: string | null;
  materiaId: number | null;
  nomeMateria: string | null;
  score: number | null;
  classificacao: string;
  diasDesdeUltimoEvento: number | null;
  proximaRevisao: string | null;
}

export interface RetencaoSemDadosResumoDTO {
  totalSemDados: number;
  janelaDias: number;
  asOf: string;
}

export interface RetencaoSemDadosMetaDTO {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface RetencaoSemDadosResponseDTO {
  resumo: RetencaoSemDadosResumoDTO;
  itens: RetencaoSemDadosItemDTO[];
  meta: RetencaoSemDadosMetaDTO;
}

export interface EvolucaoMateriaPontoDTO {
  data: string;
  score: number;
}

export interface EvolucaoMateriaDTO {
  materiaId: number;
  materiaNome: string;
  pontos: EvolucaoMateriaPontoDTO[];
}
