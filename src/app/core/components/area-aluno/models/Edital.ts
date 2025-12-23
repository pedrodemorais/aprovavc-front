import { EditalMateriaResumo } from "./EditalMateriaResumo";
export interface Edital {
  id?: number;
  nome: string;
  descricao?: string | null;
  dataProva?: string | null; // ISO (yyyy-MM-dd)
  ativo?: boolean;

  materias: EditalMateriaResumo[];

  percentualEstudadoGeral?: number;
  nivelDominioGeral?: number;
}
