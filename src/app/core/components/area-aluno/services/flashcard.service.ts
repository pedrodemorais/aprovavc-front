import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { FlashcardDTO } from '../models/FlashcardDTO';

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
  totalRevisoes?: number;
  totalAcertos?: number;
  taxaAcerto?: number;
  updatedAt?: string;
}

export interface FlashcardCriticoDTO {
  flashcardId?: number;
  materiaId?: number;
  materiaNome?: string;
  topicoId?: number;
  topicoDescricao?: string;
  frente?: string;
  verso?: string;
  dificuldade?: 'MUITO_FACIL' | 'FACIL' | 'MEDIA' | 'DIFICIL' | 'MUITO_DIFICIL';
  totalRevisoes?: number;
  totalAcertos?: number;
  taxaAcerto?: number;
}

@Injectable({ providedIn: 'root' })
export class FlashcardService {
  private readonly apiUrl = `${environment.apiUrl}/sala-estudo`;

  constructor(private http: HttpClient) {}

  criarFlashcard(dto: FlashcardDTO): Observable<FlashcardDTO> {
    return this.http.post<FlashcardDTO>(`${this.apiUrl}/flashcards`, dto);
  }

  atualizarFlashcard(id: number, dto: FlashcardDTO): Observable<FlashcardDTO> {
    return this.http.put<FlashcardDTO>(`${this.apiUrl}/flashcards/${id}`, dto);
  }

  excluirFlashcard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/flashcards/${id}`);
  }

  listarFlashcardsPorTopico(topicoId: number): Observable<FlashcardDTO[]> {
    return this.http.get<FlashcardDTO[]>(`${this.apiUrl}/flashcards/topico/${topicoId}`);
  }

  listarBibliotecaFlashcards(params?: {
    materiaId?: number | null;
    topicoId?: number | null;
    termo?: string | null;
    dificuldade?: string | null;
    pendentes?: boolean;
    criticos?: boolean;
  })
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
    if (params?.dificuldade) {
      httpParams = httpParams.set('dificuldade', String(params.dificuldade));
    }
    if (typeof params?.pendentes === 'boolean') {
      httpParams = httpParams.set('pendentes', String(params.pendentes));
    }
    if (typeof params?.criticos === 'boolean') {
      httpParams = httpParams.set('criticos', String(params.criticos));
    }
    return this.http.get<BibliotecaFlashcardDTO[]>(`${this.apiUrl}/biblioteca/flashcards`, { params: httpParams });
  }

  listarFlashcardsCriticos(): Observable<FlashcardCriticoDTO[]> {
    return this.http.get<FlashcardCriticoDTO[]>(`${this.apiUrl}/biblioteca/flashcards`, {
      params: new HttpParams().set('criticos', 'true')
    }).pipe(
      catchError(() => of([]))
    );
  }
}
