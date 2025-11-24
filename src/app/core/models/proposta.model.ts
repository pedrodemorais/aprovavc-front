export type OrigemLead = 'INDICACAO' | 'INSTAGRAM' | 'GOOGLE' | 'OUTRO';

export interface PropostaItemDTO {
  descricao: string;
  quantidade: number;
  unidade?: string | null;
  precoVista: number;
  precoPrazo: number;
  desconto: number; // % (0-100)
}

export interface PropostaRequestDTO {
  data: string; // ISO yyyy-MM-dd
  cliente: string;
  telefone?: string | null;
  email?: string | null;
  origemLead?: OrigemLead | null;
  descricao?: string | null;
  observacoes?: string | null;
  itens: PropostaItemDTO[];
}

export interface PropostaResponseDTO extends PropostaRequestDTO {
  id: number;
  totalVista: number;
  totalPrazo: number;
  createdAt: string;
  updatedAt: string;
}