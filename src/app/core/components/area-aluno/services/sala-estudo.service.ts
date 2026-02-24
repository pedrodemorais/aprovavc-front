// src/app/core/services/sala-estudo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';



export interface FlashcardRevisaoRespostaRequest {
  flashcardId: number;
  avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL';
}

export interface TopicoRevisaoRespostaRequest {
  topicoId: number;
  avaliacao: 'ERREI' | 'DIFICIL' | 'BOM' | 'FACIL';
}

export interface EstudoTopicoRequest {
  materiaId: number;
  topicoId: number;

  // mesmo nome e tipo logico do back
  modoTemporizador: string;   // "livre" ou "pomodoro"
  tipoSessao: 'ESTUDO' | 'REVISAO';

  tempoLivreSegundos: number; // tempo que sera somado no back

  pomodoroFase?: string;      // "foco", "pausa-curta", "pausa-longa"
  pomodoroCiclosConcluidos?: number;

  anotacoes?: string;
}

export interface EstudoTopicoResponse {
  id: number;
  materiaId: number;
  topicoId: number;
  modoTemporizador: string;
  tempoLivreSegundos: number;
  tipoSessao?: 'ESTUDO' | 'REVISAO';
}

export interface TopicoFinalizadoDTO {
  topicoId: number;
  materiaId: number;
  dataFinalizacao: string;
}

export interface AnotacaoTopicoDTO {
  topicoId: number;
  anotacoes: string;
}

export interface TempoEstudoMateriaDTO {
  materiaId: number;
  materiaNome: string;
  tempoEstudoSegundos?: number;
  tempoRevisaoSegundos?: number;
  tempoEstudoSemanaSegundos?: number;
  tempoRevisaoSemanaSegundos?: number;
  tempoTotalSegundos?: number;
  tempoTotal?: number;
  totalSegundos?: number;
  totalSegundosSemana?: number;
}

export interface TempoEstudoTotalDTO {
  tempoEstudoSegundos?: number;
  tempoRevisaoSegundos?: number;
  tempoEstudoSemanaSegundos?: number;
  tempoRevisaoSemanaSegundos?: number;
  tempoTotalSegundos?: number;
  tempoTotal?: number;
  totalSegundos?: number;
  totalSegundosSemana?: number;
  constancia?: number;
  constanciaDias?: number;
  diasAtivos?: number;
}

export interface ConstanciaEstudoDiaDTO {
  dia: string;
  tempoEstudoSegundos?: number;
  tempoRevisaoSegundos?: number;
  totalSegundos?: number;
  teveEstudo?: boolean;
  materias?: string[];
}

export interface TopicoNodeDTO {
  id?: number;
  topicoId?: number;
  subtopicoId?: number;
  idTopico?: number;
  idSubtopico?: number;
  descricao?: string;
  ativo?: boolean;
  nivel?: number;
  ordem?: number;
  materiaId?: number;
  topicoPaiId?: number | null;
  paiId?: number | null;
  topicoPai?: { id?: number | null };
  pai?: { id?: number | null };
  proximaRevisao?: string | null;
  statusRevisao?: string | null;
  statusCanonico?: string | null;
  subtopicos?: TopicoNodeDTO[];
  filhos?: TopicoNodeDTO[];
  [key: string]: unknown;
}

export interface MateriaTopicosDTO {
  materiaId: number;
  materiaNome: string;
  topicos: TopicoNodeDTO[];
  ordemVersion?: string | null;
}
export interface BibliotecaResumoDTO {
  materiaId: number;
  materiaNome: string;
  topicoId: number;
  topicoDescricao: string;
  temResumo: boolean;
  resumoTexto?: string;
  updatedAt?: string;
}

export interface BibliotecaFlashcardDTO {
  materiaId: number;
  materiaNome: string;
  topicoId: number;
  topicoDescricao: string;
  flashcardId: number;
  frente: string;
  verso: string;
  tags?: string;
  dificuldade: 'MUITO_FACIL' | 'FACIL' | 'MEDIA' | 'DIFICIL' | 'MUITO_DIFICIL';
  updatedAt?: string;
}
export interface VocabularioDTO {
  id: number;
  materiaId: number;
  topicoId: number;
  termo: string;
  definicao: string;
  tags?: string;
  dataCriacao?: string;
  dataAtualizacao?: string;
}
export interface SplitSubtopicoRequest {
  novosSubtopicos: string[];
  novoTituloPai?: string;
  desativarOriginal?: boolean;
}

export interface SplitSubtopicoResponse {
  original: {
    id: number;
    descricao: string;
    ativo: boolean;
  };
  novos: Array<{
    id: number;
    descricao: string;
    topicoPaiId: number;
    materiaId: number;
  }>;
}

export interface FinalizacaoTopicoActionRequest {
  acao: 'FINALIZAR' | 'DESFINALIZAR';
  cascade?: boolean;
}

export interface FinalizacaoTopicoActionResponse {
  topicoAtualizado?: {
    topicoId?: number;
    id?: number;
    finalizado?: boolean;
  };
  topicosImpactados?: Array<{
    topicoId?: number;
    id?: number;
    finalizado?: boolean;
  }>;
  resumoMateria?: {
    materiaId?: number;
    total?: number;
    concluidos?: number;
    pendentes?: number;
  };
}

export interface NextTopicRecommendationResponse {
  topicoId?: number | null;
  materiaId?: number | null;
  motivo?: string;
  ordemVersion?: string | null;
  contexto?: NextTopicContext;
}

export interface NextTopicContext {
  ordemVersion?: string | null;
  topicoAtualId?: number | null;
  proximoTopicoId?: number | null;
  motivo?: string;
  indiceAtual?: number | null;
  indiceRetornado?: number | null;
  [key: string]: unknown;
}

export interface RevisaoDashboardResumoDTO {
  vencidas: number;
  hoje: number;
  emDia: number;
  total: number;
}

export interface RevisaoDashboardMetaDTO {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  generatedAt?: string;
  timezone?: string;
}

export interface RevisaoDashboardResponseDTO {
  resumo: RevisaoDashboardResumoDTO;
  itens: RevisaoDashboardItem[];
  meta?: RevisaoDashboardMetaDTO;
}

@Injectable({ providedIn: 'root' })
export class SalaEstudoService {

  private apiUrl = `${environment.apiUrl}/sala-estudo`;
  private topicosApiUrl = `${environment.apiUrl}/topicos`;
  private readonly usarRegrasBackV2 = !!environment?.featureFlags?.backendBusinessRulesV2;
  private readonly cacheTopicosFinalizadosTtlMs = 15000;
  private readonly cacheRevisoesDashboardTtlMs = 15000;
  private topicosFinalizadosCache: TopicoFinalizadoDTO[] | null = null;
  private topicosFinalizadosCacheTs = 0;
  private topicosFinalizadosInFlight$: Observable<TopicoFinalizadoDTO[]> | null = null;
  private revisoesDashboardCache: RevisaoDashboardItem[] | null = null;
  private revisoesDashboardCacheTs = 0;
  private revisoesDashboardInFlight$: Observable<RevisaoDashboardItem[]> | null = null;
  private revisoesDashboardUnificadoCache: RevisaoDashboardResponseDTO | null = null;
  private revisoesDashboardUnificadoCacheTs = 0;
  private revisoesDashboardUnificadoInFlight$: Observable<RevisaoDashboardResponseDTO> | null = null;

  constructor(private http: HttpClient) {}

  // ================= ESTUDO / ANOTAÇÕES =================

  salvarEstudo(req: EstudoTopicoRequest): Observable<EstudoTopicoResponse> {
    return this.http.post<EstudoTopicoResponse>(`${this.apiUrl}/estudos`, req).pipe(
      tap(() => this.limparCacheRevisoesDashboard())
    );
  }

  finalizarTopico(topicoId: number): Observable<void> {
    if (this.usarRegrasBackV2) {
      return this.executarFinalizacaoTopico(topicoId, 'FINALIZAR').pipe(
        map(() => void 0),
        catchError(() =>
          this.http.post<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`, {}).pipe(
            tap(() => this.limparCacheTopicosFinalizados())
          )
        )
      );
    }
    return this.http.post<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`, {}).pipe(
      tap(() => this.limparCacheTopicosFinalizados())
    );
  }

  desfinalizarTopico(topicoId: number): Observable<void> {
    if (this.usarRegrasBackV2) {
      return this.executarFinalizacaoTopico(topicoId, 'DESFINALIZAR').pipe(
        map(() => void 0),
        catchError(() =>
          this.http.delete<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`).pipe(
            tap(() => this.limparCacheTopicosFinalizados())
          )
        )
      );
    }
    return this.http.delete<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`).pipe(
      tap(() => this.limparCacheTopicosFinalizados())
    );
  }

  executarFinalizacaoTopico(
    topicoId: number,
    acao: 'FINALIZAR' | 'DESFINALIZAR',
    cascade = true
  ): Observable<FinalizacaoTopicoActionResponse> {
    const payload: FinalizacaoTopicoActionRequest = { acao, cascade };
    return this.http.post<FinalizacaoTopicoActionResponse>(
      `${this.apiUrl}/topicos/${topicoId}/finalizacao`,
      payload
    ).pipe(
      tap(() => this.limparCacheTopicosFinalizados())
    );
  }

  resetarTopico(topicoId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/topicos/${topicoId}/reset`).pipe(
      tap(() => this.limparCacheTopicosFinalizados())
    );
  }

  listarTopicosFinalizados(): Observable<TopicoFinalizadoDTO[]> {
    const agora = Date.now();
    const cacheValido =
      !!this.topicosFinalizadosCache &&
      (agora - this.topicosFinalizadosCacheTs) < this.cacheTopicosFinalizadosTtlMs;

    if (cacheValido) {
      return of(this.topicosFinalizadosCache as TopicoFinalizadoDTO[]);
    }

    if (this.topicosFinalizadosInFlight$) {
      return this.topicosFinalizadosInFlight$;
    }

    this.topicosFinalizadosInFlight$ = this.http.get<TopicoFinalizadoDTO[]>(`${this.apiUrl}/topicos/finalizados`).pipe(
      tap((itens) => {
        this.topicosFinalizadosCache = itens || [];
        this.topicosFinalizadosCacheTs = Date.now();
      }),
      finalize(() => {
        this.topicosFinalizadosInFlight$ = null;
      }),
      shareReplay(1)
    );

    return this.topicosFinalizadosInFlight$;
  }

  private limparCacheTopicosFinalizados(): void {
    this.topicosFinalizadosCache = null;
    this.topicosFinalizadosCacheTs = 0;
    this.topicosFinalizadosInFlight$ = null;
  }

  buscarAnotacoes(topicoId: number): Observable<AnotacaoTopicoDTO> {
    return this.http.get<AnotacaoTopicoDTO>(`${this.apiUrl}/topicos/${topicoId}/anotacoes`);
  }

  // ================= CRUD FLASHCARDS =================

  criarFlashcard(dto: FlashcardDTO): Observable<FlashcardDTO> {
    return this.http.post<FlashcardDTO>(`${this.apiUrl}/flashcards`, dto);
  }

  listarFlashcardsPorTopico(topicoId: number): Observable<FlashcardDTO[]> {
    return this.http.get<FlashcardDTO[]>(`${this.apiUrl}/flashcards/topico/${topicoId}`);
  }

  excluirFlashcard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/flashcards/${id}`);
  }

  // ================= REVISAO ESPACADA =================

  /**
   * Lista apenas os flashcards que estao "vencidos" / para hoje,
   * de acordo com a tabela de revisao (1, 3, 7, 14, 30...).
   *
   * GET /api/sala-estudo/flashcards/revisao?topicoId=123
   */
  listarFlashcardsParaRevisao(topicoId: number): Observable<FlashcardDTO[]> {
    const url = `${this.apiUrl}/flashcards/revisao?topicoId=${topicoId}`;
    return this.http.get<FlashcardDTO[]>(url);
  }

  /**
   * Registra a resposta do aluno para um flashcard em revisao:
   * ERREI / DIFICIL / BOM / FACIL
   *
   * POST /api/sala-estudo/flashcards/revisao/responder
   */
  responderRevisaoFlashcard(req: FlashcardRevisaoRespostaRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/flashcards/revisao/responder`, req).pipe(
      tap(() => this.limparCacheRevisoesDashboard())
    );
  }

  /**
   * Registra a resposta de revisao baseada nas ANOTACOES do topico
   * (mesma logica de caixinhas, mas nivel topico).
   *
   * POST /api/sala-estudo/topicos/revisao/responder
   */
  responderRevisaoTopico(req: TopicoRevisaoRespostaRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/topicos/revisao/responder`, req).pipe(
      tap(() => this.limparCacheRevisoesDashboard())
    );
  }

  listarTempoEstudoPorMateria(): Observable<TempoEstudoMateriaDTO[]> {
    return this.http.get<TempoEstudoMateriaDTO[]>(`${this.apiUrl}/estudos/tempo-por-materia`);
  }

  buscarTempoEstudoTotal(): Observable<TempoEstudoTotalDTO> {
    return this.http.get<TempoEstudoTotalDTO>(`${this.apiUrl}/estudos/tempo-total`);
  }

  listarConstanciaMensal(ano?: number, mes?: number): Observable<ConstanciaEstudoDiaDTO[]> {
    const params: string[] = [];
    if (ano != null) params.push(`ano=${ano}`);
    if (mes != null) params.push(`mes=${mes}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return this.http.get<ConstanciaEstudoDiaDTO[]>(`${this.apiUrl}/estudos/constancia-mes${query}`);
  }

  listarMateriasParaEstudo(escopo: string): Observable<MateriaTopicosDTO[]> {
    const escopoFinal = (escopo || '').trim().toLowerCase();
    if (escopoFinal && escopoFinal !== 'todas') {
      const query = `?escopo=${encodeURIComponent(escopoFinal)}`;
      return this.http.get<MateriaTopicosDTO[]>(`${this.apiUrl}/estudar-materias${query}`);
    }

    return this.http.get<MateriaTopicosDTO[]>(`${this.apiUrl}/estudar-materias`)
      .pipe(
        catchError(() =>
          this.http.get<MateriaTopicosDTO[]>(`${this.apiUrl}/estudar-materias?escopo=todas`)
        )
      );
  }

  listarBibliotecaResumos(params?: { materiaId?: number | null; topicoId?: number | null; termo?: string | null })
    : Observable<BibliotecaResumoDTO[]> {
    let httpParams = new HttpParams();
    if (params?.materiaId) {
      httpParams = httpParams.set('materiaId', String(params.materiaId));
    }
    if (params?.topicoId) {
      httpParams = httpParams.set('topicoId', String(params.topicoId));
    }
    if (params?.termo) {
      httpParams = httpParams.set('termo', String(params.termo));
    }
    return this.http.get<BibliotecaResumoDTO[]>(`${this.apiUrl}/biblioteca/resumos`, { params: httpParams });
  }

  listarBibliotecaFlashcards(params?: { materiaId?: number | null; topicoId?: number | null; termo?: string | null })
    : Observable<BibliotecaFlashcardDTO[]> {
    let httpParams = new HttpParams();
    if (params?.materiaId) {
      httpParams = httpParams.set('materiaId', String(params.materiaId));
    }
    if (params?.topicoId) {
      httpParams = httpParams.set('topicoId', String(params.topicoId));
    }
    if (params?.termo) {
      httpParams = httpParams.set('termo', String(params.termo));
    }
    return this.http.get<BibliotecaFlashcardDTO[]>(`${this.apiUrl}/biblioteca/flashcards`, { params: httpParams });
  }

  criarVocabulario(req: { materiaId: number; topicoId: number; termo: string; definicao: string; tags?: string })
    : Observable<VocabularioDTO> {
    return this.http.post<VocabularioDTO>(`${this.apiUrl}/vocabularios`, req);
  }

  listarVocabularios(topicoId: number): Observable<VocabularioDTO[]> {
    const url = `${this.apiUrl}/vocabularios?topicoId=${topicoId}`;
    return this.http.get<VocabularioDTO[]>(url);
  }

  atualizarVocabulario(
    id: number,
    req: { termo?: string; definicao?: string; tags?: string }
  ): Observable<VocabularioDTO> {
    return this.http.put<VocabularioDTO>(`${this.apiUrl}/vocabularios/${id}`, req);
  }

  excluirVocabulario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/vocabularios/${id}`);
  }
  splitSubtopico(subtopicoId: number, payload: SplitSubtopicoRequest): Observable<SplitSubtopicoResponse> {
    return this.http.post<SplitSubtopicoResponse>(`${this.topicosApiUrl}/${subtopicoId}/split`, payload);
  }

  obterProximoTopico(
    materiaId: number,
    modo: 'estudar' | 'revisar',
    filtro?: 'atrasadas' | 'hoje' | 'emdia',
    currentTopicoId?: number | null,
    ordemVersion?: string | null
  ): Observable<NextTopicRecommendationResponse> {
    if (!this.usarRegrasBackV2) {
      return of({ topicoId: null, materiaId, motivo: 'FEATURE_FLAG_OFF' });
    }

    let params = new HttpParams().set('modo', modo);
    if (filtro) {
      params = params.set('filtro', filtro);
    }
    if (!currentTopicoId || !Number.isFinite(currentTopicoId) || currentTopicoId <= 0) {
      return throwError(() => new Error('currentTopicoId é obrigatório para next-topic.'));
    }
    params = params.set('currentTopicoId', String(currentTopicoId));
    if (!ordemVersion || !String(ordemVersion).trim()) {
      return throwError(() => new Error('ordemVersion e obrigatoria para next-topic.'));
    }
    params = params.set('ordemVersion', String(ordemVersion));

    return this.http.get<NextTopicRecommendationResponse>(
      `${this.apiUrl}/materias/${materiaId}/next-topic`,
      { params }
    );
  }

  listarRevisoesDashboard(): Observable<RevisaoDashboardItem[]> {
    const agora = Date.now();
    const cacheValido =
      !!this.revisoesDashboardCache &&
      (agora - this.revisoesDashboardCacheTs) < this.cacheRevisoesDashboardTtlMs;

    if (cacheValido) {
      return of(this.revisoesDashboardCache as RevisaoDashboardItem[]);
    }

    if (this.revisoesDashboardInFlight$) {
      return this.revisoesDashboardInFlight$;
    }

    const url = `${this.apiUrl}/revisoes/dashboard`;
    const params = new HttpParams().set('_t', String(Date.now()));
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    });

    this.revisoesDashboardInFlight$ = this.http.get<RevisaoDashboardItem[]>(url, { params, headers }).pipe(
      tap((itens) => {
        this.revisoesDashboardCache = itens || [];
        this.revisoesDashboardCacheTs = Date.now();
      }),
      finalize(() => {
        this.revisoesDashboardInFlight$ = null;
      }),
      shareReplay(1)
    );

    return this.revisoesDashboardInFlight$;
  }

  listarRevisoesDashboardUnificado(params?: {
    alunoId?: number;
    materiaId?: number;
    status?: string;
    tipo?: string;
    janelaDias?: number;
    page?: number;
    size?: number;
  }): Observable<RevisaoDashboardResponseDTO> {
    const agora = Date.now();
    const cacheValido =
      !!this.revisoesDashboardUnificadoCache &&
      (agora - this.revisoesDashboardUnificadoCacheTs) < this.cacheRevisoesDashboardTtlMs;

    if (cacheValido && !params) {
      return of(this.revisoesDashboardUnificadoCache as RevisaoDashboardResponseDTO);
    }

    if (this.revisoesDashboardUnificadoInFlight$ && !params) {
      return this.revisoesDashboardUnificadoInFlight$;
    }

    let httpParams = new HttpParams().set('_t', String(Date.now()));
    if (params?.alunoId) httpParams = httpParams.set('alunoId', String(params.alunoId));
    if (params?.materiaId) httpParams = httpParams.set('materiaId', String(params.materiaId));
    if (params?.status) httpParams = httpParams.set('status', String(params.status));
    if (params?.tipo) httpParams = httpParams.set('tipo', String(params.tipo));
    if (params?.janelaDias) httpParams = httpParams.set('janelaDias', String(params.janelaDias));
    if (params?.page != null) httpParams = httpParams.set('page', String(params.page));
    if (params?.size != null) httpParams = httpParams.set('size', String(params.size));

    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    });

    const req$ = this.http.get<RevisaoDashboardResponseDTO>(`${environment.apiUrl}/revisoes/dashboard`, {
      params: httpParams,
      headers
    }).pipe(
      tap((resp) => {
        if (!params) {
          this.revisoesDashboardUnificadoCache = resp || null;
          this.revisoesDashboardUnificadoCacheTs = Date.now();
        }
      }),
      finalize(() => {
        if (!params) {
          this.revisoesDashboardUnificadoInFlight$ = null;
        }
      }),
      shareReplay(1)
    );

    if (!params) {
      this.revisoesDashboardUnificadoInFlight$ = req$;
    }

    return req$;
  }

  limparCacheRevisoesDashboard(): void {
    this.revisoesDashboardCache = null;
    this.revisoesDashboardCacheTs = 0;
    this.revisoesDashboardInFlight$ = null;
    this.revisoesDashboardUnificadoCache = null;
    this.revisoesDashboardUnificadoCacheTs = 0;
    this.revisoesDashboardUnificadoInFlight$ = null;
  }



}












