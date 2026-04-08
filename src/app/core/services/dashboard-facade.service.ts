import { Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { TopicoCognitivoDTO } from '../models/cognitive-metrics.models';
import { EditalResumoRetencaoDTO, RetencaoAnalyticsResponseDTO, TopicoRiscoDTO } from '../models/retencao-analytics.models';
import { RetencaoAnalyticsService } from './retencao-analytics.service';

export type NivelRiscoUsuario = 'CRITICO' | 'MODERADO' | 'LEVE' | 'SEM_DADOS';

export interface RetencaoPainelSnapshot {
  resumo: EditalResumoRetencaoDTO;
  topicos: TopicoRiscoDTO[];
  analytics: RetencaoAnalyticsResponseDTO | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardFacadeService {
  constructor(private retencaoService: RetencaoAnalyticsService) {}

  carregarRetencaoPainel(janela: 1 | 7 | 14 | 30): Observable<RetencaoPainelSnapshot> {
    return forkJoin({
      resumo: this.retencaoService.buscarResumoEdital(janela),
      topicos: this.retencaoService.buscarTopicosEmRisco(janela, 50),
      analytics: this.retencaoService.buscarAnalyticsRetencao(janela)
    });
  }

  classificarNivelUsuario(classificacao: string | null | undefined, score: number | null | undefined): NivelRiscoUsuario {
    const viaScore = this.mapScoreParaNivel(score);
    if (viaScore !== 'SEM_DADOS') return viaScore;
    return this.mapClassificacaoParaNivel(classificacao);
  }

  mapClassificacaoParaNivel(classificacao: string | null | undefined): NivelRiscoUsuario {
    const normalizado = String(classificacao || '').toUpperCase().trim();
    if (normalizado === 'CRITICO') return 'CRITICO';
    if (normalizado === 'EM_RISCO') return 'MODERADO';
    if (normalizado === 'CONSOLIDADO') return 'LEVE';
    return 'SEM_DADOS';
  }

  mapScoreParaNivel(score: number | null | undefined): NivelRiscoUsuario {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'SEM_DADOS';
    if (n < 0.45) return 'CRITICO';
    if (n < 0.75) return 'MODERADO';
    return 'LEVE';
  }

  calcularPressaoHorizonte(topicos: TopicoCognitivoDTO[]): { risco24h: number; risco48h: number; risco7d: number } {
    const lista = Array.isArray(topicos) ? topicos : [];
    const risco24h = lista.filter((t) => this.classificarNivelUsuario(t?.classificacao, t?.score) === 'CRITICO').length;
    const risco48h = lista.filter((t) => {
      const nivel = this.classificarNivelUsuario(t?.classificacao, t?.score);
      return nivel === 'CRITICO' || nivel === 'MODERADO';
    }).length;
    const risco7d = lista.filter((t) => {
      const nivel = this.classificarNivelUsuario(t?.classificacao, t?.score);
      return nivel === 'CRITICO' || nivel === 'MODERADO';
    }).length;
    return { risco24h, risco48h, risco7d };
  }
}
