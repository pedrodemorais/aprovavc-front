// src/app/core/models/topico-edital-estudo.dto.ts
export interface TopicoEditalEstudoDTO {
  id?: number;
  nivel: string;       // ex: "1", "1.1", "1.1.1"
  descricao: string;   // ex: "Ortografia"
  ativo: boolean;
}
