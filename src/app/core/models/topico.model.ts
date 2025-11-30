export interface Topico {
  id?: number;
  descricao: string;
  nivel: number;
  ativo: boolean;
  filhos: Topico[];
}
