import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  FiltroCognitivo,
  JanelaCognitiva,
  RetencaoCognitivaResumoDTO,
  TopicoCognitivoDTO
} from '../models/cognitive-metrics.models';

type AnyRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class CognitiveMetricsService {
  private readonly baseUrl = `${environment.apiUrl}/sala-estudo/cognitivo/retencao`;

  constructor(private http: HttpClient) {}

  getResumoRetencao(janela: JanelaCognitiva): Observable<RetencaoCognitivaResumoDTO> {
    const params = new HttpParams().set('janela', String(janela));
    return this.http.get<AnyRecord>(`${this.baseUrl}/resumo`, { params }).pipe(
      map((raw) => this.normalizarResumo(raw, janela))
    );
  }

  getTopicosCognitivos(
    janela: JanelaCognitiva,
    filtro?: FiltroCognitivo | null,
    limit = 50
  ): Observable<TopicoCognitivoDTO[]> {
    let params = new HttpParams()
      .set('janela', String(janela))
      .set('limit', String(limit));

    if (filtro) {
      params = params.set('filtro', String(filtro));
    }

    return this.http.get<AnyRecord[] | { itens?: AnyRecord[] }>(`${this.baseUrl}/topicos`, { params }).pipe(
      map((raw) => this.normalizarTopicos(raw))
    );
  }

  private normalizarResumo(raw: AnyRecord | null | undefined, janela: JanelaCognitiva): RetencaoCognitivaResumoDTO {
    const obj = raw ?? {};
    const ret14 = this.toNullableNumber(
      this.pick(obj, ['retencao14d', 'retencao_14d', 'retencaoMedia14d', 'retencaoMedia', 'score14d'])
    );
    const ret7 = this.toNullableNumber(this.pick(obj, ['retencao7d', 'retencao_7d', 'score7d']));
    const ret30 = this.toNullableNumber(this.pick(obj, ['retencao30d', 'retencao_30d', 'score30d']));

    return {
      janelaDias: Number(this.pick(obj, ['janelaDias', 'janela']) ?? janela) || janela,
      retencao14d: ret14,
      retencao7d: ret7,
      retencao30d: ret30,
      totalTopicos: this.toNullableNumber(this.pick(obj, ['totalTopicos', 'total', 'topicosTotal'])),
      consolidados: this.toNullableNumber(this.pick(obj, ['consolidados', 'topicosConsolidados', 'consolidado']))
    };
  }

  private normalizarTopicos(raw: AnyRecord[] | { itens?: AnyRecord[] } | null | undefined): TopicoCognitivoDTO[] {
    let lista: AnyRecord[] = [];
    if (Array.isArray(raw)) {
      lista = raw;
    } else if (raw && Array.isArray(raw.itens)) {
      lista = raw.itens;
    }

    return lista
      .map((item) => this.normalizarTopico(item))
      .filter((item) => item.topicoId > 0);
  }

  private normalizarTopico(raw: AnyRecord): TopicoCognitivoDTO {
    return {
      topicoId: Number(this.pick(raw, ['topicoId', 'id']) ?? 0),
      materiaId: this.toNullableNumber(this.pick(raw, ['materiaId'])),
      nomeMateria: this.toNullableString(this.pick(raw, ['nomeMateria', 'materiaNome'])),
      nomeTopico: this.toNullableString(this.pick(raw, ['nomeTopico', 'topicoDescricao', 'descricao'])),
      score: this.toNullableNumber(this.pick(raw, ['score', 'scoreRetencao'])),
      risk: this.toNullableNumber(this.pick(raw, ['risk', 'forgettingRisk', 'riscoEsquecimento'])),
      stability: this.toNullableNumber(this.pick(raw, ['stability', 'stabilityIndex', 'estabilidade', 'stabilityDias'])),
      diasDesdeUltimoEvento: this.toNullableNumber(this.pick(raw, ['diasDesdeUltimoEvento', 'diasSemEvento'])),
      classificacao: this.toNullableString(this.pick(raw, ['classificacao', 'status'])),
      dataUltimoEvento: this.toNullableString(this.pick(raw, ['dataUltimoEvento', 'dataUltimoEventoEm', 'ultimoEventoEm'])),
      ultimoEventoEm: this.toNullableString(this.pick(raw, ['ultimoEventoEm', 'dataUltimoEvento', 'dataUltimoEventoEm'])),
      ultimaRevisao: this.toNullableString(this.pick(raw, ['ultimaRevisao', 'dataUltimaRevisao', 'lastReviewAt'])),
      ultimaRevisaoEm: this.toNullableString(this.pick(raw, ['ultimaRevisaoEm', 'ultimaRevisao', 'dataUltimaRevisao', 'lastReviewAt'])),
      dataUltimaRevisao: this.toNullableString(this.pick(raw, ['dataUltimaRevisao', 'ultimaRevisaoEm', 'ultimaRevisao', 'lastReviewAt']))
    };
  }

  private pick(obj: AnyRecord, keys: string[]): unknown {
    for (const key of keys) {
      if (key in obj) {
        return obj[key];
      }
    }
    return undefined;
  }

  private toNullableNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
