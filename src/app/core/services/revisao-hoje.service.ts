import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { PrioridadeFilaHoje, TipoFilaHoje } from '../models/hoje-fila.models';
import { RevisaoHojeFilaDTO, RevisaoHojeItemDTO } from '../models/revisao-hoje.models';
import { environment } from 'src/environments/environment';
import { AlunoParametroService } from './aluno-parametro.service';

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
  meta?: {
    origem?: string | null;
    limiteAplicado?: number | null;
    totalAntesDoLimite?: number | null;
    totalDepoisDoLimite?: number | null;
    page?: number | null;
    size?: number | null;
    hasNext?: boolean | null;
    generatedAt?: string | null;
  } | null;
}

interface RevisaoDashboardRaw {
  resumo?: {
    total?: number | null;
  } | null;
  itens?: RevisaoHojeItemRaw[] | null;
  meta?: {
    totalItems?: number | null;
    page?: number | null;
    size?: number | null;
    totalPages?: number | null;
    generatedAt?: string | null;
  } | null;
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
  dataProximaRevisao?: string | null;
  tempoEstimadoMinutos?: number | null;
  tempoEstimadoMin?: number | null;
  estimativaSegundos?: number | null;
  deepLink?: string | null;
  tipo?: string | null;
  modoRevisaoPreferido?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RevisaoHojeService {
  private readonly url = `${environment.apiUrl}/revisoes/dashboard`;
  private readonly CHAVE_LIMITE_DIARIO_REVISOES = 'LIMITE_DIARIO_REVISOES';
  private readonly FALLBACK_LIMITE_REVISOES_DIARIAS = 40;
  private readonly noCacheHeaders = new HttpHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  });

  constructor(
    private http: HttpClient,
    private alunoParametroService: AlunoParametroService
  ) {}

  getFilaHoje(params?: {
    origem?: string | null;
    materiaId?: number | null;
    topicoIds?: number[] | null;
    status?: string[] | null;
    limite?: number | null;
    page?: number | null;
    size?: number | null;
  }): Observable<RevisaoHojeFilaDTO> {
    const topicoIdsFiltro = Array.isArray(params?.topicoIds)
      ? params!.topicoIds!.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    const statusFiltro = Array.isArray(params?.status)
      ? params!.status!.map((s) => String(s || '').trim().toUpperCase()).filter((s) => !!s)
      : [];
    const page = Number.isFinite(Number(params?.page)) && Number(params?.page) >= 0 ? Number(params?.page) : 0;
    const sizeInformado = Number.isFinite(Number(params?.size)) && Number(params?.size) > 0
      ? Number(params?.size)
      : null;
    const limiteInformado = Number.isFinite(Number(params?.limite)) && Number(params?.limite) > 0
      ? Number(params?.limite)
      : null;

    return this.resolverLimiteFila(limiteInformado).pipe(
      switchMap((limitePadrao) => {
        const limiteEfetivo = Math.max(1, sizeInformado ?? limiteInformado ?? limitePadrao);
        let queryParams = new HttpParams().set('_t', String(Date.now()));
        if (Number.isFinite(Number(params?.materiaId)) && Number(params?.materiaId) > 0) {
          queryParams = queryParams.set('materiaId', String(Number(params?.materiaId)));
        }
        queryParams = queryParams
          .set('status', statusFiltro.length === 1 ? statusFiltro[0] : 'TODOS')
          .set('page', String(page))
          .set('size', String(limiteEfetivo))
          .set('janelaDias', '30');

        return this.http.get<RevisaoHojeFilaRaw | RevisaoHojeItemRaw[] | RevisaoDashboardRaw>(this.url, { params: queryParams, headers: this.noCacheHeaders }).pipe(
          map((raw) => this.normalizarResposta(raw)),
          map((resp) => this.aplicarFiltrosLocais(resp, topicoIdsFiltro, statusFiltro, limiteEfetivo))
        );
      })
    );
  }

  private resolverLimiteFila(limiteInformado: number | null): Observable<number> {
    if (limiteInformado && limiteInformado > 0) {
      return of(limiteInformado);
    }
    return this.alunoParametroService.listarParametros().pipe(
      map((parametros) => {
        const parametro = (parametros || []).find((p) => p?.chave === this.CHAVE_LIMITE_DIARIO_REVISOES);
        const valor = Number(parametro?.valor);
        return Number.isInteger(valor) && valor > 0 ? valor : this.FALLBACK_LIMITE_REVISOES_DIARIAS;
      }),
      catchError(() => of(this.FALLBACK_LIMITE_REVISOES_DIARIAS))
    );
  }

  private aplicarFiltrosLocais(
    resp: RevisaoHojeFilaDTO,
    topicoIdsFiltro: number[],
    statusFiltro: string[],
    limite: number
  ): RevisaoHojeFilaDTO {
    const topicosSet = new Set(topicoIdsFiltro);
    const statusSet = new Set(statusFiltro);
    const filtrados = (resp.itens || []).filter((item) => {
      if (topicosSet.size > 0 && !topicosSet.has(Number(item.topicoId || 0))) return false;
      if (statusSet.size > 1 && !statusSet.has(String(item.statusCanonico || '').toUpperCase())) return false;
      return true;
    });
    const itens = filtrados.slice(0, Math.max(1, limite));
    return {
      ...resp,
      itens,
      totalItens: itens.length,
      tempoEstimadoMinutos: this.somarTempo(itens),
      meta: {
        ...(resp.meta || {}),
        limiteAplicado: limite,
        totalAntesDoLimite: filtrados.length,
        totalDepoisDoLimite: itens.length
      }
    };
  }

  private normalizarResposta(raw: RevisaoHojeFilaRaw | RevisaoHojeItemRaw[] | RevisaoDashboardRaw | null | undefined): RevisaoHojeFilaDTO {
    const rawObj: any = Array.isArray(raw) ? null : (raw || {});
    const itensRaw = Array.isArray(raw)
      ? raw
      : (
        Array.isArray(rawObj?.itens) ? rawObj.itens :
        Array.isArray(rawObj?.fila) ? rawObj.fila :
        Array.isArray(rawObj?.items) ? rawObj.items :
        Array.isArray(rawObj?.lista) ? rawObj.lista :
        Array.isArray(rawObj?.topicos) ? rawObj.topicos :
        []
      );

    const itens = itensRaw
      .map((item: RevisaoHojeItemRaw) => this.normalizarItem(item))
      .filter((item: RevisaoHojeItemDTO | null): item is RevisaoHojeItemDTO => !!item);

    return {
      totalItens: Math.max(0, Number(
        (Array.isArray(raw)
          ? itens.length
          : (rawObj?.totalItens
            ?? rawObj?.total
            ?? rawObj?.meta?.totalItems
            ?? rawObj?.resumo?.total))
        || itens.length || 0)),
      tempoEstimadoMinutos: Number(Array.isArray(raw) ? this.somarTempo(itens) : (rawObj?.tempoEstimadoMinutos ?? rawObj?.tempoEstimadoMin ?? this.somarTempo(itens))),
      itens,
      meta: Array.isArray(raw)
        ? null
        : ({
            ...(rawObj?.meta || {}),
            origem: rawObj?.meta?.origem ?? null
          } as any)
    };
  }

  private normalizarItem(raw: RevisaoHojeItemRaw | null | undefined): RevisaoHojeItemDTO | null {
    const topicoId = Number(raw?.topicoId ?? raw?.idTopico ?? 0);
    if (!Number.isFinite(topicoId) || topicoId <= 0) return null;

    const materiaIdRaw = Number(raw?.materiaId ?? raw?.idMateria ?? 0);
    const materiaId = Number.isFinite(materiaIdRaw) && materiaIdRaw > 0 ? materiaIdRaw : null;

    const prioridade = this.normalizarPrioridade(raw?.prioridade ?? raw?.statusCanonico ?? raw?.status ?? raw?.categoria);
    const statusCanonico = this.normalizarStatusCanonico(raw?.statusCanonico ?? raw?.status ?? raw?.prioridade ?? raw?.categoria);
    const proximaRevisao = String(raw?.proximaRevisao ?? raw?.dataProximaRevisao ?? raw?.proxRevisao ?? '').trim() || null;
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
