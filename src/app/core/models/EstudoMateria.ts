export interface EstudoMateria {
  id: number;
  alunoId: number;
  materiaId: number;
  conteudo: string;
  dataEstudo: string; // vem como ISO, pode formatar no template
}

export interface EstudoMateriaRequest {
  conteudo: string;
}

