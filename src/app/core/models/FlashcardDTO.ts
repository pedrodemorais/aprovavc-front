export interface FlashcardDTO {
  id?: number;
  materiaId: number;
  topicoId: number;
  frente: string;
  verso: string;
  tipo: 'PERGUNTA_RESPOSTA' | 'TEXTO_LIVRE';
  dificuldade: 'MUITO_FACIL' | 'FACIL' | 'MEDIA' | 'DIFICIL' | 'MUITO_DIFICIL';
  tags?: string;
  ativo?: boolean;
  dataCriacao?: string;
  dataAtualizacao?: string;
  totalRevisoes?: number;
  totalAcertos?: number;
}
