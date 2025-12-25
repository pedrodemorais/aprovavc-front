// src/app/core/area-admin/dto/edital-admin.dto.ts

// =========================
// TEMPLATES
// =========================

export interface EditalTemplateDTO {
  id: number;
  nome: string;
  area?: string;
  abrangencia?: string;
  cargo?: string;

  publicado?: boolean;
  versao?: number;               // ✅ pra parar erro no template
  dataCriacao?: string;
  dataPublicacao?: string | null; // ✅ pra parar erro no template
}

// requests
export interface CriarEditalTemplateRequestDTO {
  nome: string;
  area: string;
  abrangencia: string;
  cargo: string;
}

export interface AtualizarEditalTemplateRequestDTO {
  nome: string;
  area: string;
  abrangencia: string;
  cargo: string;
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

// ✅ SEU BACKEND RETORNA ResponseEntity<Long>, então a resposta é NUMBER
export type ClonarEditalResponseDTO = number;
