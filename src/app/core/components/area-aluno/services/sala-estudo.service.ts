// src/app/core/services/sala-estudo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';



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

  // mesmo nome e tipo lógico do back
  modoTemporizador: string;   // "livre" ou "pomodoro"
  tipoSessao: 'ESTUDO' | 'REVISAO';

  tempoLivreSegundos: number; // tempo que será somado no back

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
export interface MateriaTopicosDTO {
  materiaId: number;
  materiaNome: string;
  topicos: any[];
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

@Injectable({ providedIn: 'root' })
export class SalaEstudoService {

  private apiUrl = `${environment.apiUrl}/sala-estudo`;
  private topicosApiUrl = `${environment.apiUrl}/topicos`;
  private readonly cacheTtlMs = 60000;
  private revisoesDashboardCache?: { data: RevisaoDashboardItem[]; ts: number };
  private revisoesDashboardRequest$?: Observable<RevisaoDashboardItem[]>;
  private topicosFinalizadosCache?: { data: TopicoFinalizadoDTO[]; ts: number };
  private topicosFinalizadosRequest$?: Observable<TopicoFinalizadoDTO[]>;

  constructor(private http: HttpClient) {}

  // ================= ESTUDO / ANOTAÇÕES =================

  salvarEstudo(req: EstudoTopicoRequest): Observable<EstudoTopicoResponse> {
    return this.http.post<EstudoTopicoResponse>(`${this.apiUrl}/estudos`, req);
  }

  finalizarTopico(topicoId: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`, {});
  }

  desfinalizarTopico(topicoId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/topicos/${topicoId}/finalizar`);
  }

  listarTopicosFinalizados(): Observable<TopicoFinalizadoDTO[]> {
    if (this.isCacheValido(this.topicosFinalizadosCache)) {
      return of(this.topicosFinalizadosCache!.data);
    }
    if (this.topicosFinalizadosRequest$) {
      return this.topicosFinalizadosRequest$;
    }
    this.topicosFinalizadosRequest$ = this.http.get<TopicoFinalizadoDTO[]>(`${this.apiUrl}/topicos/finalizados`).pipe(
      tap((lista) => {
        this.topicosFinalizadosCache = { data: lista || [], ts: Date.now() };
      }),
      shareReplay(1),
      catchError((err) => {
        this.topicosFinalizadosRequest$ = undefined;
        return throwError(() => err);
      }),
      finalize(() => {
        this.topicosFinalizadosRequest$ = undefined;
      })
    );
    return this.topicosFinalizadosRequest$;
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

  // ================= REVISÃO ESPAÇADA =================

  /**
   * Lista apenas os flashcards que estão "vencidos" / para hoje,
   * de acordo com a tabela de revisão (1, 3, 7, 14, 30...).
   *
   * GET /api/sala-estudo/flashcards/revisao?topicoId=123
   */
  listarFlashcardsParaRevisao(topicoId: number): Observable<FlashcardDTO[]> {
    const url = `${this.apiUrl}/flashcards/revisao?topicoId=${topicoId}`;
    return this.http.get<FlashcardDTO[]>(url);
  }

  /**
   * Registra a resposta do aluno para um flashcard em revisão:
   * ERREI / DIFICIL / BOM / FACIL
   *
   * POST /api/sala-estudo/flashcards/revisao/responder
   */
  responderRevisaoFlashcard(req: FlashcardRevisaoRespostaRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/flashcards/revisao/responder`, req);
  }

  /**
   * Registra a resposta de revisão baseada nas ANOTAÇÕES do tópico
   * (mesma lógica de caixinhas, mas nível tópico).
   *
   * POST /api/sala-estudo/topicos/revisao/responder
   */
  responderRevisaoTopico(req: TopicoRevisaoRespostaRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/topicos/revisao/responder`, req);
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

listarRevisoesDashboard(): Observable<RevisaoDashboardItem[]> {
  if (this.isCacheValido(this.revisoesDashboardCache)) {
    return of(this.revisoesDashboardCache!.data);
  }
  if (this.revisoesDashboardRequest$) {
    return this.revisoesDashboardRequest$;
  }
  const url = `${this.apiUrl}/revisoes/dashboard`;
  this.revisoesDashboardRequest$ = this.http.get<RevisaoDashboardItem[]>(url).pipe(
    tap((res) => {
      this.revisoesDashboardCache = { data: res || [], ts: Date.now() };
    }),
    shareReplay(1),
    catchError((err) => {
      this.revisoesDashboardRequest$ = undefined;
      return throwError(() => err);
    }),
    finalize(() => {
      this.revisoesDashboardRequest$ = undefined;
    })
  );
  return this.revisoesDashboardRequest$;
}

private isCacheValido(cache?: { ts: number }): boolean {
  if (!cache) return false;
  return (Date.now() - cache.ts) < this.cacheTtlMs;
}



}











