export interface TopicoEdital {
  id?: number;
  codigo: string;
  descricao: string;
  ativo: boolean;
  
  provaId: number;
  materiaId?: number | null;

  nivel: string;
  nivelTopico: string;
    subtopicos?: TopicoEdital[];  // <<--- ADICIONE ISSO
    filhos?: TopicoEdital[];     // se o backend mandar assim
}
