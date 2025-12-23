// src/app/core/area-admin/dto/edital-admin.dto.ts

// ===== ADMIN (TEMPLATE) =====
export interface EditalTemplateDTO {
  id: number;
  nome: string;
  versao: number;
  publicado: boolean;
  dataCriacao: string;       // LocalDate -> "YYYY-MM-DD"
  dataPublicacao?: string | null;
}

export interface CriarEditalTemplateRequestDTO {
  nome: string;
}

export interface AtualizarEditalTemplateRequestDTO {
  nome: string;
}

// Se você expandir depois para incluir cargos no retorno do template
export interface CargoTemplateDTO {
  id: number;
  nome: string;
  editalTemplateId: number;
}

// ===== ALUNO (EDITAL REAL) =====
// (Use opcionalidade para não quebrar caso o backend não mande tudo)
export interface EditalDTO {
  id: number;
  nome: string;
  descricao?: string | null;
  dataProva?: string | null;       // LocalDate -> "YYYY-MM-DD"
  ativo: boolean;
  dataCriacao: string;             // LocalDateTime -> ISO
  dataAtualizacao: string;         // LocalDateTime -> ISO
  materias?: EditalMateriaDTO[];   // pode vir ou não
}

export interface EditalMateriaDTO {
  id: number;
  ordem?: number | null;
  materiaId?: number;              // caso backend mande só o id
  materia?: MateriaDTO;            // caso backend mande objeto
}

export interface MateriaDTO {
  id: number;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  dataCriacao?: string;
  dataAtualizacao?: string;
}

// ===== CLONE DO TEMPLATE PARA O ALUNO =====
// Ajustei para ser bem flexível e não te travar.
export interface ClonarEditalRequestDTO {
  // opcional: se você quiser permitir o aluno renomear na hora da clonagem
  nomeEdital?: string;

  // opcional
  descricao?: string | null;

  // opcional
  dataProva?: string | null; // "YYYY-MM-DD"

  // opcional: se você tiver cargo template na estrutura
  cargoTemplateId?: number | null;

  // opcional: caso queira decidir o comportamento
  criarSeNaoExistir?: boolean; // ex: true = cria, false = falha se já existir
}

export interface ClonarEditalResponseDTO {
  edital: EditalDTO;
}
