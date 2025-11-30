import { EstudoMateria } from "./EstudoMateria";
import { RevisaoMateria } from "./RevisaoMateria";

export interface SalaEstudoMateria {
  materiaId: number;
  materiaNome: string;

  estudosRecentes: EstudoMateria[];
  revisoesPendentes: RevisaoMateria[];
}

