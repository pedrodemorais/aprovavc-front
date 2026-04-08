import { PressaoFilaItemDTO } from 'src/app/core/api/dto/pressao-do-dia.dto';
import { ResumoAcionavel } from 'src/app/core/models/dashboard-summary.models';

export type DashboardFilaItemDTO = PressaoFilaItemDTO;
export type ResumoAcionavelDTO = ResumoAcionavel;

export interface FocoPlanoDiarioDTO {
  modo: 'REVISAO' | 'EXECUCAO_PLANO' | 'CONSOLIDACAO';
  editalId: number;
  editalNome: string;
  modoAtivo: string | null;
  capacidadeMinutos: number | null;
  distribuicao: FocoDistribuicaoMateriaDTO[];
  filaRevisao: DashboardFilaItemDTO[];
  resumoAcionavel: ResumoAcionavelDTO;
  reforco: FocoReforcoInfoDTO | null;
  execucaoPlano?: FocoExecucaoPlanoDTO | null;
  progressoHoje?: FocoProgressoHojeDTO;
  blocoNumero?: number;
  blocoMinutosDisponiveis?: number;
  origemPlano?: string;
}

export interface FocoExecucaoPlanoDTO {
  materiaId?: number | null;
  proximoTopicoId?: number | null;
  proximoTopicoNome?: string | null;
  proximoTopicoPaiNome?: string | null;
  topicoPaiNome?: string | null;
  criterio?: string | null;
  materiaConcluida?: boolean | null;
}

export interface FocoDistribuicaoMateriaDTO {
  materiaId: number;
  materiaNome: string;
  minutosPlanejados: number;
  percentualPlanejado: number;
  proximoConteudo: {
    topicoId: number;
    topicoNome: string;
    ordem: number | null;
    topicoPaiNome?: string | null;
    paiNome?: string | null;
  } | null;
  status: 'OK' | 'SEM_CONTEUDO_NOVO';
}

export interface FocoReforcoInfoDTO {
  reforcosHoje: number;
  reforcosAmanha: number;
}

export interface FocoProgressoHojeDTO {
  revisoesTopicoConcluidas: number;
  revisoesFlashcardConcluidas?: number;
  estudosConcluidos?: number;
  reforcosResolvidos?: number;
  itensConcluidosTotal?: number;
  janelaInicio?: string;
  janelaFim?: string;
}
