// src/app/core/area-admin/dto/edital-admin.dto.ts

// =========================
// TEMPLATES
// =========================

export interface EditalTemplateDTO {
  id: number;
  nome: string;
  orgaoId?: number;
  orgaoNome?: string;
  orgao?: string;
  areaId?: number;
  areaNome?: string;
  area?: string;
  abrangencia?: AbrangenciaEnum | string;
  cargoId?: number;
  cargoNome?: string;
  cargo?: string;

  publicado?: boolean;
  versao?: number;               // ✅ pra parar erro no template
  dataCriacao?: string;
  dataPublicacao?: string | null; // ✅ pra parar erro no template
}

export type AbrangenciaEnum = 'FEDERAL' | 'ESTADUAL' | 'MUNICIPAL';

export interface OrgaoDTO {
  id: number;
  nome: string;
}

export interface AreaDTO {
  id: number;
  nome: string;
}

export interface CargoDTO {
  id: number;
  nome: string;
}

export interface PageDTO<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

// requests
export interface CriarEditalTemplateRequestDTO {
  nome: string;
  orgaoId: number;
  areaId: number;
  abrangencia: AbrangenciaEnum | string;
  cargoId: number;
  dataPublicacao?: string | null;
}

export interface AtualizarEditalTemplateRequestDTO {
  nome: string;
  orgaoId: number;
  areaId: number;
  abrangencia: AbrangenciaEnum | string;
  cargoId: number;
  dataPublicacao?: string | null;
}

// =========================
// MATERIAS / TOPICOS
// =========================

export interface MateriaTemplateDTO {
  id: number;
  nome?: string;
  descricao?: string;
  ordem?: number;
}

export interface TopicoTemplateDTO {
  id: number;
  nome?: string;
  descricao?: string;
  ordem?: number;
  topicoPaiId?: number | null;
  materiaTemplateId?: number;
}

export interface CriarMateriaTemplateRequestDTO {
  nome: string;
  ordem?: number;
}

export interface CriarTopicoTemplateRequestDTO {
  descricao: string;      // ✅ igual ao backend
  ordem: number;          // ✅ no backend é @NotNull, então aqui deve ser obrigatório
  topicoPaiId?: number | null;
}


// =========================
// ESTRUTURA
// =========================

export interface EstruturaTemplateDTO {
  templateId: number;
  nomeTemplate?: string;
  materias?: MateriaTemplateDTO[];
}

// =========================
// CLONE
// =========================

export interface ClonarEditalRequestDTO {
  nomeEdital?: string;
}

// ✅ Resposta do clone agora é estruturada
export interface ClonarEditalResponseDTO {
  id: number;
  templateId?: number | null;
}
