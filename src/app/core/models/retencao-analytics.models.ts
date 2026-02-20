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
