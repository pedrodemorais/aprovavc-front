// src/app/core/models/usuario-update.dto.ts
import { AlunoDTO } from './AlunoParametroDTO';

export interface UsuarioUpdateDTO {
  nome: string;
  email: string;
  aluno: AlunoDTO;
}
