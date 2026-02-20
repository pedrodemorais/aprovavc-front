export interface RevisaoDashboardItem {
  tipo: 'ANOTACAO' | 'FLASHCARD' | 'TOPICO';
  materiaId: number;
  topicoId: number;
  materiaNome: string;
  topicoDescricao: string;
  dataProximaRevisao: string; // vem como ISO string do back
  qtdPendentes?: number;
  status: 'VENCIDA' | 'EM_DIA' | 'FUTURA';
  statusCanonico?: 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA' | string;
  // campos legados/auxiliares
  proximaRevisao?: string | null;
  statusRevisao?: 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA' | string;
}
