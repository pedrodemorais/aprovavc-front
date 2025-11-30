export interface Materia {
  id?: number;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
  dataCriacao?: string;
  dataAtualizacao?: string;
}
