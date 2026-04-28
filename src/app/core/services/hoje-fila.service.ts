import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import {
  DashboardStreakResumoDTO,
  HojeFilaInsightsDTO,
  HojeFilaItemDTO,
  HojeFilaResponseDTO,
  HojeResumoDTO,
  PrioridadeFilaHoje,
  StatusHojeStreak,
  TipoFilaHoje
} from '../models/hoje-fila.models';

interface HojeFilaItemRaw {
  topicoId?: number | null;
  materiaId?: number | null;
  nomeMateria?: string | null;
  materiaNome?: string | null;
  nomeTopico?: string | null;
  topicoNome?: string | null;
  topicoDescricao?: string | null;
  prioridade?: string | null;
  statusCanonico?: string | null;
  status?: string | null;
  motivo?: string | null;
  tempoEstimadoMinutos?: number | null;
  estimativaSegundos?: number | null;
  deepLink?: string | null;
  tipo?: string | null;
}

interface HojeFilaResponseRaw {
  totalItens?: number | null;
  total?: number | null;
  tempoEstimadoMinutos?: number | null;
  tempoEstimadoMin?: number | null;
  itens?: HojeFilaItemRaw[] | null;
  fila?: HojeFilaItemRaw[] | null;
  items?: HojeFilaItemRaw[] | null;
  insights?: {
    streakDias?: number | null;
    consolidadosSemana?: number | null;
    tendencia7dPercent?: number | null;
    tendencia7dLabel?: string | null;
    consolidadosSemanaLabel?: string | null;
  } | null;
}

interface HojeResumoRaw {
  dataReferencia?: string | null;
  timezone?: string | null;
  streakDias?: number | null;
  estudouHoje?: boolean | null;
  diasAtivosUltimos7?: number | null;
  diasAtivosUltimos30?: number | null;
  itensConcluidosHoje?: number | null;
  tempoEstudoHojeMinutos?: number | null;
  atualizadoEm?: string | null;
}

interface DashboardStreakResumoRaw {
  streakAtual?: number | null;
  melhorStreak?: number | null;
  consistencia30DiasQtd?: number | null;
  consistencia30DiasTotal?: number | null;
  consistencia30DiasPercent?: number | null;
  statusHoje?: string | null;
  dataReferencia?: string | null;
}

@Injectable({ providedIn: 'root' })
export class HojeFilaService {
  private readonly url = `${environment.apiUrl}/revisoes/dashboard`;
  private readonly resumoUrl = `${environment.apiUrl}/sala-estudo/hoje/resumo`;
  private readonly streakUrl = `${environment.apiUrl}/dashboard/streak`;
  private readonly noCacheHeaders = new HttpHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  });

  constructor(private http: HttpClient) {}

  getFilaHoje(): Observable<HojeFilaResponseDTO> {
    const params = new HttpParams()
      .set('_t', String(Date.now()))
      .set('status', 'TODOS')
      .set('page', '0')
      .set('size', '50')
      .set('janelaDias', '30');
    return this.http.get<HojeFilaResponseRaw | HojeFilaItemRaw[]>(this.url, {
      params,
      headers: this.noCacheHeaders
    }).pipe(
      map((raw) => this.normalizarResposta(raw))
    );
  }

  getResumoHoje(): Observable<HojeResumoDTO> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http.get<HojeResumoRaw | null>(this.resumoUrl, {
      params,
      headers: this.noCacheHeaders
    }).pipe(
      map((raw) => this.normalizarResumoHoje(raw))
    );
  }

  getDashboardStreak(): Observable<DashboardStreakResumoDTO> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http.get<DashboardStreakResumoRaw | null>(this.streakUrl, {
      params,
      headers: this.noCacheHeaders
    }).pipe(
      map((raw) => this.normalizarDashboardStreak(raw))
    );
  }

  private normalizarResposta(raw: HojeFilaResponseRaw | HojeFilaItemRaw[] | null | undefined): HojeFilaResponseDTO {
    const itensRaw = Array.isArray(raw)
      ? raw
      : (
        Array.isArray(raw?.itens) ? raw!.itens! :
        Array.isArray(raw?.fila) ? raw!.fila! :
        Array.isArray(raw?.items) ? raw!.items! :
        Array.isArray((raw as any)?.itens) ? (raw as any).itens :
        []
      );
    return {
      totalItens: Number((Array.isArray(raw) ? itensRaw.length : (raw?.totalItens ?? raw?.total)) || itensRaw.length || 0),
      tempoEstimadoMinutos: Number(Array.isArray(raw) ? 0 : (raw?.tempoEstimadoMinutos ?? raw?.tempoEstimadoMin ?? 0)),
      itens: itensRaw.map((item: HojeFilaItemRaw) => this.normalizarItem(item)),
      insights: Array.isArray(raw) ? null : this.normalizarInsights(raw?.insights)
    };
  }

  private normalizarInsights(raw: HojeFilaResponseRaw['insights']): HojeFilaInsightsDTO | null {
    if (!raw) return null;
    return {
      streakDias: this.toNullableNumber(raw.streakDias),
      consolidadosSemana: this.toNullableNumber(raw.consolidadosSemana),
      tendencia7dPercent: this.toNullableNumber(raw.tendencia7dPercent),
      tendencia7dLabel: (raw.tendencia7dLabel ?? null) || null,
      consolidadosSemanaLabel: (raw.consolidadosSemanaLabel ?? null) || null
    };
  }

  private normalizarResumoHoje(raw: HojeResumoRaw | null | undefined): HojeResumoDTO {
    return {
      dataReferencia: String(raw?.dataReferencia || ''),
      timezone: String(raw?.timezone || ''),
      streakDias: this.toNullableNumber(raw?.streakDias),
      estudouHoje: Boolean(raw?.estudouHoje),
      diasAtivosUltimos7: Math.max(0, Number(raw?.diasAtivosUltimos7 || 0)),
      diasAtivosUltimos30: Math.max(0, Number(raw?.diasAtivosUltimos30 || 0)),
      itensConcluidosHoje: Math.max(0, Number(raw?.itensConcluidosHoje || 0)),
      tempoEstudoHojeMinutos: Math.max(0, Number(raw?.tempoEstudoHojeMinutos || 0)),
      atualizadoEm: raw?.atualizadoEm ?? null
    };
  }

  private normalizarDashboardStreak(raw: DashboardStreakResumoRaw | null | undefined): DashboardStreakResumoDTO {
    const status = String(raw?.statusHoje || '').toUpperCase();
    const statusHoje: StatusHojeStreak =
      status === 'CONCLUIU' || status === 'INICIOU' || status === 'NAO_INICIOU'
        ? (status as StatusHojeStreak)
        : 'NAO_INICIOU';

    return {
      streakAtual: Math.max(0, Number(raw?.streakAtual || 0)),
      melhorStreak: Math.max(0, Number(raw?.melhorStreak || 0)),
      consistencia30DiasQtd: Math.max(0, Number(raw?.consistencia30DiasQtd || 0)),
      consistencia30DiasTotal: Math.max(1, Number(raw?.consistencia30DiasTotal || 30)),
      consistencia30DiasPercent: Number(Number(raw?.consistencia30DiasPercent || 0).toFixed(1)),
      statusHoje,
      dataReferencia: String(raw?.dataReferencia || '')
    };
  }

  private normalizarItem(item: HojeFilaItemRaw): HojeFilaItemDTO {
    const materiaId = this.toNullableNumber(item?.materiaId);
    const topicoId = Number(item?.topicoId || 0);
    const tempoEstimadoMinutos =
      this.toNullableNumber(item?.tempoEstimadoMinutos) ??
      this.fromSegundosToMin(item?.estimativaSegundos);

    return {
      topicoId,
      materiaId,
      materiaNome: (item?.materiaNome ?? item?.nomeMateria ?? null) || null,
      topicoNome: (item?.topicoNome ?? item?.nomeTopico ?? item?.topicoDescricao ?? null) || null,
      prioridade: this.normalizarPrioridade(item?.prioridade ?? item?.statusCanonico ?? item?.status),
      motivo: item?.motivo ?? this.motivoFromStatus(item?.statusCanonico ?? item?.status),
      tempoEstimadoMinutos,
      deepLink: this.normalizarDeepLink(item?.deepLink, materiaId, topicoId),
      tipo: this.normalizarTipo(item?.tipo)
    };
  }

  private normalizarPrioridade(valor: string | null | undefined): PrioridadeFilaHoje {
    const key = String(valor || '').toUpperCase();
    switch (key) {
      case 'VENCIDA':
      case PrioridadeFilaHoje.ATRASADA:
      case PrioridadeFilaHoje.CRITICO:
      case PrioridadeFilaHoje.EM_RISCO:
      case PrioridadeFilaHoje.ERRO_REINCIDENTE:
      case PrioridadeFilaHoje.ALTA:
      case PrioridadeFilaHoje.MEDIA:
      case PrioridadeFilaHoje.BAIXA:
        return key as PrioridadeFilaHoje;
      default:
        return PrioridadeFilaHoje.MEDIA;
    }
  }

  private motivoFromStatus(valor: string | null | undefined): string | null {
    const key = String(valor || '').toUpperCase();
    if (key === 'ATRASADA' || key === 'VENCIDA') {
      return 'Revisão atrasada.';
    }
    if (key === 'HOJE') {
      return 'Revisão prevista para hoje.';
    }
    return null;
  }

  private normalizarTipo(valor: string | null | undefined): TipoFilaHoje {
    const key = String(valor || '').toUpperCase();
    switch (key) {
      case TipoFilaHoje.TOPICO:
      case TipoFilaHoje.FLASHCARD:
      case TipoFilaHoje.ERRO:
        return key as TipoFilaHoje;
      default:
        return TipoFilaHoje.TOPICO;
    }
  }

  private normalizarDeepLink(deepLink: string | null | undefined, materiaId: number | null, topicoId: number): string {
    const cleaned = String(deepLink || '').trim();
    if (cleaned && !cleaned.includes('/sala-estudo/0')) {
      return cleaned;
    }
    if (materiaId && materiaId > 0) {
      return `/area-restrita/sala-estudo/${materiaId}?topicoId=${topicoId}`;
    }
    return '/area-restrita/revisoes';
  }

  private toNullableNumber(valor: unknown): number | null {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }

  private fromSegundosToMin(segundos: unknown): number | null {
    const n = Number(segundos);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.ceil(n / 60);
  }
}
