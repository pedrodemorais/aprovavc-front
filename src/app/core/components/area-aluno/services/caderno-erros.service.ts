import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type CadernoErroStatus = 'ABERTO' | 'REVISADO' | 'DOMINADO';
export type CadernoErroFonte = 'QUESTAO' | 'SIMULADO' | 'MANUAL';

export interface CadernoErro {
  id: number;
  alunoId: number;
  materiaId: number;
  topicoId: number;
  subtopicoId?: number | null;
  titulo: string;
  descricaoErro: string;
  causaRaiz?: string | null;
  correcao?: string | null;
  status: CadernoErroStatus;
  tags: string[];
  fonte: CadernoErroFonte;
  questaoId?: number | null;
  simuladoId?: number | null;
  tentativaId?: number | null;
  dataErro: string;
  dataProximaRevisao?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CadernoErroPayload {
  materiaId: number;
  topicoId: number;
  subtopicoId?: number | null;
  titulo: string;
  descricaoErro: string;
  causaRaiz?: string | null;
  correcao?: string | null;
  fonte: CadernoErroFonte;
  dataErro: string;
  tags?: string[];
  questaoId?: number | null;
  simuladoId?: number | null;
  tentativaId?: number | null;
}

export interface CadernoErroListParams {
  page?: number;
  size?: number;
  sort?: string;
  materiaId?: number | null;
  topicoId?: number | null;
  subtopicoId?: number | null;
  status?: CadernoErroStatus | '';
  dataErroInicio?: string;
  dataErroFim?: string;
  dataRevisaoInicio?: string;
  dataRevisaoFim?: string;
  tag?: string;
  busca?: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export interface RevisarErroPayload {
  status: Extract<CadernoErroStatus, 'REVISADO' | 'DOMINADO'>;
}

export interface TopicoArvoreNode {
  id: number;
  descricao: string;
  ativo?: boolean;
  subtopicos?: TopicoArvoreNode[];
  filhos?: TopicoArvoreNode[];
}

@Injectable({
  providedIn: 'root'
})
export class CadernoErrosService {
  private readonly baseUrl = `${environment.apiUrl}/caderno-erros`;
  private readonly materiasBaseUrl = `${environment.apiUrl}/materias`;

  constructor(private http: HttpClient) {}

  listar(params: CadernoErroListParams): Observable<PageResponse<CadernoErro>> {
    let httpParams = new HttpParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      httpParams = httpParams.set(key, String(value));
    });
    return this.http.get<PageResponse<CadernoErro>>(this.baseUrl, { params: httpParams });
  }

  detalhar(id: number): Observable<CadernoErro> {
    return this.http.get<CadernoErro>(`${this.baseUrl}/${id}`);
  }

  criar(payload: CadernoErroPayload): Observable<CadernoErro> {
    return this.http.post<CadernoErro>(this.baseUrl, payload);
  }

  atualizar(id: number, payload: CadernoErroPayload): Observable<CadernoErro> {
    return this.http.put<CadernoErro>(`${this.baseUrl}/${id}`, payload);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  revisar(id: number, payload: RevisarErroPayload): Observable<CadernoErro> {
    return this.http.post<CadernoErro>(`${this.baseUrl}/${id}/revisar`, payload);
  }

  listarTopicosArvore(materiaId: number): Observable<TopicoArvoreNode[]> {
    return this.http.get<TopicoArvoreNode[]>(`${this.materiasBaseUrl}/${materiaId}/topicos-arvore`);
  }
}

