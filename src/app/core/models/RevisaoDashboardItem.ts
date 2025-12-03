export interface RevisaoDashboardItem {
  tipo: 'ANOTACAO' | 'FLASHCARD';
  materiaId: number;
  materiaNome: string;
  topicoId: number;
  topicoDescricao: string;
  dataProximaRevisao: string; // ISO vinda do back
  qtdPendentes?: number;      // se o back mandar contagem
}
