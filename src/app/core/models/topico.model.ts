export interface Topico {
  id?: number;
  descricao: string;
  nivel: number;
  ativo: boolean;
  filhos: Topico[];
   proximaRevisao?: string | null; // '2025-12-05', ISO etc.
  // opcional: status pronto vindo do back
  statusRevisao?: 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';
}
