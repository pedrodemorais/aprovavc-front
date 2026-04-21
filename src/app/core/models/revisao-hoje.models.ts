import { PrioridadeFilaHoje, TipoFilaHoje } from './hoje-fila.models';

export interface RevisaoHojeItemDTO {
  topicoId: number;
  materiaId: number | null;
  materiaNome: string | null;
  topicoNome: string | null;
  prioridade: PrioridadeFilaHoje;
  statusCanonico: string;
  proximaRevisao: string | null;
  motivo: string | null;
  tempoEstimadoMinutos: number | null;
  deepLink: string;
  tipo: TipoFilaHoje;
  categoria: string | null;
  score: number | null;
}

export interface RevisaoHojeFilaDTO {
  totalItens: number;
  tempoEstimadoMinutos: number;
  itens: RevisaoHojeItemDTO[];
}
