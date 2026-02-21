import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { HojeFilaInsightsDTO, HojeFilaItemDTO, HojeFilaResponseDTO, PrioridadeFilaHoje, TipoFilaHoje } from '../models/hoje-fila.models';

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

@Injectable({ providedIn: 'root' })
export class HojeFilaService {
  private readonly url = `${environment.apiUrl}/sala-estudo/hoje/fila`;

  constructor(private http: HttpClient) {}

  getFilaHoje(): Observable<HojeFilaResponseDTO> {
    return this.http.get<HojeFilaResponseRaw | HojeFilaItemRaw[]>(this.url).pipe(
      map((raw) => this.normalizarResposta(raw))
    );
  }

  private normalizarResposta(raw: HojeFilaResponseRaw | HojeFilaItemRaw[] | null | undefined): HojeFilaResponseDTO {
    const itensRaw = Array.isArray(raw)
      ? raw
      : (
        Array.isArray(raw?.itens) ? raw!.itens! :
        Array.isArray(raw?.fila) ? raw!.fila! :
        Array.isArray(raw?.items) ? raw!.items! :
        []
      );
    return {
      totalItens: Number((Array.isArray(raw) ? itensRaw.length : (raw?.totalItens ?? raw?.total)) || itensRaw.length || 0),
      tempoEstimadoMinutos: Number(Array.isArray(raw) ? 0 : (raw?.tempoEstimadoMinutos ?? raw?.tempoEstimadoMin ?? 0)),
      itens: itensRaw.map((item) => this.normalizarItem(item)),
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
