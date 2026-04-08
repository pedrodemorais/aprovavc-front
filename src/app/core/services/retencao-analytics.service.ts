import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  EditalResumoRetencaoDTO,
  EvolucaoMateriaDTO,
  ErroReincidenteDTO,
  RetencaoAnalyticsResponseDTO,
  RetencaoSemDadosResponseDTO,
  RetencaoPontoDTO,
  RevisaoEventoHistoricoDTO,
  TopicoRiscoDTO
} from '../models/retencao-analytics.models';

@Injectable({ providedIn: 'root' })
export class RetencaoAnalyticsService {
  private readonly baseUrl = `${environment.apiUrl}/sala-estudo/revisoes`;

  constructor(private http: HttpClient) {}

  buscarResumoEdital(janela: 1 | 7 | 14 | 30): Observable<EditalResumoRetencaoDTO> {
    const params = new HttpParams().set('janela', String(janela));
    return this.http.get<EditalResumoRetencaoDTO>(`${this.baseUrl}/retencao/edital/resumo`, { params });
  }

  buscarTopicosEmRisco(janela: 1 | 7 | 14 | 30, limit = 50): Observable<TopicoRiscoDTO[]> {
    const params = new HttpParams()
      .set('janela', String(janela))
      .set('limit', String(limit));
    return this.http.get<TopicoRiscoDTO[]>(`${this.baseUrl}/retencao/topicos/em-risco`, { params });
  }

  buscarErrosReincidentes(dias = 30, limit = 20): Observable<ErroReincidenteDTO[]> {
    const params = new HttpParams()
      .set('dias', String(dias))
      .set('limit', String(limit));
    return this.http.get<ErroReincidenteDTO[]>(`${this.baseUrl}/analytics/erros-reincidentes`, { params });
  }

  buscarSerieTopico(topicoId: number, dias = 30): Observable<RetencaoPontoDTO[]> {
    const params = new HttpParams().set('dias', String(dias));
    return this.http.get<RetencaoPontoDTO[]>(`${this.baseUrl}/retencao/topicos/${topicoId}/serie`, { params });
  }

  buscarHistoricoTopico(topicoId: number, dias = 30): Observable<RevisaoEventoHistoricoDTO[]> {
    const params = new HttpParams().set('dias', String(dias));
    return this.http.get<RevisaoEventoHistoricoDTO[]>(`${this.baseUrl}/retencao/topicos/${topicoId}/historico`, { params });
  }

  buscarAnalyticsRetencao(janela: 1 | 7 | 14 | 30): Observable<RetencaoAnalyticsResponseDTO> {
    const params = new HttpParams().set('janela', String(janela));
    return this.http.get<RetencaoAnalyticsResponseDTO>(`${this.baseUrl}/retencao/analytics`, { params });
  }

  buscarEvolucaoMaterias(): Observable<EvolucaoMateriaDTO[]> {
    return this.http.get<EvolucaoMateriaDTO[]>(`${environment.apiUrl}/dashboard/evolucao/materias`);
  }

  buscarTopicosSemDados(params?: {
    janela?: 1 | 7 | 14 | 30;
    editalId?: number | null;
    page?: number;
    size?: number;
    search?: string | null;
  }): Observable<RetencaoSemDadosResponseDTO> {
    let httpParams = new HttpParams();
    httpParams = httpParams.set('janela', String(params?.janela ?? 30));
    httpParams = httpParams.set('page', String(params?.page ?? 0));
    httpParams = httpParams.set('size', String(params?.size ?? 500));
    if (Number.isFinite(Number(params?.editalId)) && Number(params?.editalId) > 0) {
      httpParams = httpParams.set('editalId', String(params?.editalId));
    }
    if (params?.search && String(params.search).trim()) {
      httpParams = httpParams.set('search', String(params.search).trim());
    }

    return this.http.get<RetencaoSemDadosResponseDTO>(`${environment.apiUrl}/retencao/topicos/sem-dados`, {
      params: httpParams
    });
  }
}
