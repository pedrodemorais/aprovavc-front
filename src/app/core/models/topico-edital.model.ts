export interface TopicoEdital {
  id?: number;
  empresaId?: number;
  provaId: number;
  provaNome?: string;
  materiaId:  null;
  materiaNome?: string;
  descricao: string;
  
  ativo: boolean;
  codigo?: string; 
}
