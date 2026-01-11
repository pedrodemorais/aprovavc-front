export interface EditalMateriaResumo {
  materiaId: number;
  materiaNome: string;
  percentualEstudado: number;
  nivelDominio: number;
  ativo?: boolean;
  topicos?: any[];
}
