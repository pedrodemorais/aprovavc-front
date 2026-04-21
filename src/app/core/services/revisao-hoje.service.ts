import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PrioridadeFilaHoje, TipoFilaHoje } from '../models/hoje-fila.models';
import { RevisaoHojeFilaDTO, RevisaoHojeItemDTO } from '../models/revisao-hoje.models';
import { environment } from 'src/environments/environment';

interface RevisaoHojeFilaRaw {
  totalItens?: number | null;
  total?: number | null;
  tempoEstimadoMinutos?: number | null;
  tempoEstimadoMin?: number | null;
  itens?: RevisaoHojeItemRaw[] | null;
  fila?: RevisaoHojeItemRaw[] | null;
  items?: RevisaoHojeItemRaw[] | null;
  lista?: RevisaoHojeItemRaw[] | null;
  topicos?: RevisaoHojeItemRaw[] | null;
}

interface RevisaoHojeItemRaw {
  topicoId?: number | null;
  idTopico?: number | null;
  materiaId?: number | null;
  idMateria?: number | null;
  materiaNome?: string | null;
  nomeMateria?: string | null;
  topicoNome?: string | null;
  nomeTopico?: string | null;
  topicoDescricao?: string | null;
  prioridade?: string | null;
  statusCanonico?: string | null;
  status?: string | null;
  categoria?: string | null;
  classificacao?: string | null;
  score?: number | null;
  proximaRevisao?: string | null;
  proxRevisao?: string | null;
  tempoEstimadoMinutos?: number | null;
  tempoEstimadoMin?: number | null;
  estimativaSegundos?: number | null;
  deepLink?: string | null;
  tipo?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RevisaoHojeService {
  private readonly url = `${environment.apiUrl}/sala-estudo/revisoes/hoje/fila`;
  private readonly noCacheHeaders = new HttpHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  });

  constructor(private http: HttpClient) {}

  getFilaHoje(): Observable<RevisaoHojeFilaDTO> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http.get<RevisaoHojeFilaRaw | RevisaoHojeItemRaw[]>(this.url, { params, headers: this.noCacheHeaders }).pipe(
      map((raw) => this.normalizarResposta(raw))
    );
  }

  private normalizarResposta(raw: RevisaoHojeFilaRaw | RevisaoHojeItemRaw[] | null | undefined): RevisaoHojeFilaDTO {
    const itensRaw = Array.isArray(raw)
      ? raw
      : (
        Array.isArray(raw?.itens) ? raw!.itens! :
        Array.isArray(raw?.fila) ? raw!.fila! :
        Array.isArray(raw?.items) ? raw!.items! :
        Array.isArray(raw?.lista) ? raw!.lista! :
        Array.isArray(raw?.topicos) ? raw!.topicos! :
        []
      );

    const itens = itensRaw
      .map((item) => this.normalizarItem(item))
      .filter((item): item is RevisaoHojeItemDTO => !!item);

    return {
      totalItens: Math.max(0, Number((Array.isArray(raw) ? itens.length : (raw?.totalItens ?? raw?.total)) || itens.length || 0)),
      tempoEstimadoMinutos: Number(Array.isArray(raw) ? this.somarTempo(itens) : (raw?.tempoEstimadoMinutos ?? raw?.tempoEstimadoMin ?? this.somarTempo(itens))),
      itens
    };
  }

  private normalizarItem(raw: RevisaoHojeItemRaw | null | undefined): RevisaoHojeItemDTO | null {
    const topicoId = Number(raw?.topicoId ?? raw?.idTopico ?? 0);
    if (!Number.isFinite(topicoId) || topicoId <= 0) return null;

    const materiaIdRaw = Number(raw?.materiaId ?? raw?.idMateria ?? 0);
    const materiaId = Number.isFinite(materiaIdRaw) && materiaIdRaw > 0 ? materiaIdRaw : null;

    const prioridade = this.normalizarPrioridade(raw?.prioridade ?? raw?.statusCanonico ?? raw?.status ?? raw?.categoria);
    const statusCanonico = this.normalizarStatusCanonico(raw?.statusCanonico ?? raw?.status ?? raw?.prioridade ?? raw?.categoria);
    const proximaRevisao = String(raw?.proximaRevisao ?? raw?.proxRevisao ?? '').trim() || null;
    const tempoEstimadoMinutos = this.normalizarTempo(raw);

    return {
      topicoId,
      materiaId,
      materiaNome: String(raw?.materiaNome ?? raw?.nomeMateria ?? '').trim() || null,
      topicoNome: String(raw?.topicoNome ?? raw?.nomeTopico ?? raw?.topicoDescricao ?? '').trim() || null,
      prioridade,
      statusCanonico,
      proximaRevisao,
      motivo: this.motivoFromStatus(statusCanonico),
      tempoEstimadoMinutos,
      deepLink: this.normalizarDeepLink(String(raw?.deepLink || '').trim(), materiaId, topicoId),
      tipo: this.normalizarTipo(raw?.tipo),
      categoria: String(raw?.categoria ?? raw?.classificacao ?? '').trim() || null,
      score: Number.isFinite(Number(raw?.score)) ? Number(raw?.score) : null
    };
  }

  private normalizarPrioridade(valor: unknown): PrioridadeFilaHoje {
    const key = String(valor || '').toUpperCase();
    if (key === 'ATRASADA' || key === 'VENCIDA') return PrioridadeFilaHoje.ATRASADA;
    if (key === 'HOJE' || key === 'ALTA') return PrioridadeFilaHoje.ALTA;
    if (key === PrioridadeFilaHoje.CRITICO) return PrioridadeFilaHoje.CRITICO;
    if (key === PrioridadeFilaHoje.EM_RISCO) return PrioridadeFilaHoje.EM_RISCO;
    if (key === PrioridadeFilaHoje.ERRO_REINCIDENTE) return PrioridadeFilaHoje.ERRO_REINCIDENTE;
    if (key === PrioridadeFilaHoje.BAIXA) return PrioridadeFilaHoje.BAIXA;
    return PrioridadeFilaHoje.MEDIA;
  }

  private normalizarStatusCanonico(valor: unknown): string {
    const key = String(valor || '').toUpperCase();
    if (key === 'ATRASADA' || key === 'VENCIDA') return 'ATRASADA';
    if (key === 'HOJE' || key === 'ALTA') return 'HOJE';
    return 'FUTURA';
  }

  private normalizarTipo(valor: unknown): TipoFilaHoje {
    const key = String(valor || '').toUpperCase();
    if (key === TipoFilaHoje.FLASHCARD) return TipoFilaHoje.FLASHCARD;
    if (key === TipoFilaHoje.ERRO) return TipoFilaHoje.ERRO;
    return TipoFilaHoje.TOPICO;
  }

  private motivoFromStatus(statusCanonico: string): string | null {
    const key = String(statusCanonico || '').toUpperCase();
    if (key === 'ATRASADA') return 'Revisao atrasada.';
    if (key === 'HOJE') return 'Revisao prevista para hoje.';
    return null;
  }

  private normalizarDeepLink(valor: string, materiaId: number | null, topicoId: number): string {
    if (valor && !valor.includes('/sala-estudo/0')) return valor;
    if (materiaId && materiaId > 0) {
      return `/area-restrita/sala-estudo/${materiaId}?topicoId=${topicoId}`;
    }
    return '/area-restrita/revisoes';
  }

  private normalizarTempo(raw: RevisaoHojeItemRaw | null | undefined): number | null {
    const tempoMin = Number(raw?.tempoEstimadoMinutos ?? raw?.tempoEstimadoMin);
    if (Number.isFinite(tempoMin) && tempoMin > 0) return Math.ceil(tempoMin);
    const tempoSeg = Number(raw?.estimativaSegundos);
    if (Number.isFinite(tempoSeg) && tempoSeg > 0) return Math.ceil(tempoSeg / 60);
    return null;
  }

  private somarTempo(itens: RevisaoHojeItemDTO[]): number {
    return (itens || []).reduce((acc, item) => acc + Number(item?.tempoEstimadoMinutos || 0), 0);
  }
}
