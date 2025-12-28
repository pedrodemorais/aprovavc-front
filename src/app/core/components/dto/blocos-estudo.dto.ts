export interface BlocoEstudoItemDTO {
  id?: number;
  materiaEstudoId: number;
  materiaNome?: string; // vem do backend (somente leitura)
  ordem: number;
  peso?: number;
}

export interface BlocoEstudoDTO {
  id: number;
  numero: number; // 1..7
  minutosDisponiveis: number;
  ativo: boolean;
  itens: BlocoEstudoItemDTO[];
}

export interface AtualizarBlocoEstudoRequestDTO {
  minutosDisponiveis: number;
  itens: BlocoEstudoItemDTO[]; // substitui a lista inteira
}

export interface PlanoDoDiaMateriaDTO {
  materiaId: number;
  nome: string;
  ordem: number;
}

export interface PlanoDoDiaDTO {
  blocoNumero: number;
  minutosDisponiveis: number;
  materiasDoBloco: PlanoDoDiaMateriaDTO[];
  revisoesAtrasadasQtd: number;
  revisoesHojeQtd: number;

  revisoesAtrasadas?: any[];
  revisoesHoje?: any[];
}

export interface AvancarCicloResponseDTO {
  blocoAtual: number;
}
