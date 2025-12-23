export interface RevisaoDashboardItem {
  tipo: 'ANOTACAO' | 'FLASHCARD' | 'TOPICO';
  materiaId: number;
  topicoId: number;
  materiaNome: string;
  topicoDescricao: string;
  dataProximaRevisao: string; // vem como ISO string do back
  qtdPendentes?: number;
  status: 'VENCIDA' | 'EM_DIA' | 'FUTURA';
   // ⬇️ novos campos para o semáforo
  proximaRevisao?: string | null; 
  statusRevisao?: 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA' | string;

}
