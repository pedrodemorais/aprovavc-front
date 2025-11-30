export interface ProvaMateria {
  id?: number;
  provaId?: number;
  materiaId: number;
  materiaNome?: string;
  ordem?: number | null;
  ativo?: boolean;
  dataCriacao?: string;
  dataAtualizacao?: string;
}
