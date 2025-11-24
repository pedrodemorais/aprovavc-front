export interface ProvaEstudo {
  id?: number;
  nome: string;
  descricao?: string;
  ativo?: boolean;
  materiasIds?: number[]; // IDs das matérias vinculadas à prova
}
