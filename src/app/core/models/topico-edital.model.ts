export interface TopicoEdital {
  id?: number;
  empresaId?: number;
  provaId: number;
  provaNome?: string;
  materiaId: number;
  materiaNome?: string;
  descricao: string;
  ordem: number;
  ativo: boolean;
  codigo?: string; 
}
