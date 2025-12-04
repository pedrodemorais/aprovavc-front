export interface RevisaoDashboardItem {
  tipo: 'ANOTACAO' | 'FLASHCARD' | 'TOPICO';
  materiaId: number;
  topicoId: number;
  materiaNome: string;
  topicoDescricao: string;
  dataProximaRevisao: string; // vem como ISO string do back
  qtdPendentes?: number;
  status: 'VENCIDA' | 'EM_DIA' | 'FUTURA';
}
