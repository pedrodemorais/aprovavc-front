// src/app/core/services/sala-estudo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';


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
}

export interface AnotacaoTopicoDTO {
  topicoId: number;
  anotacoes: string;
}

@Injectable({ providedIn: 'root' })
export class SalaEstudoService {

  private apiUrl = `${environment.apiUrl}/sala-estudo`;

  constructor(private http: HttpClient) {}

  // ================= ESTUDO / ANOTAÇÕES =================

  salvarEstudo(req: EstudoTopicoRequest): Observable<EstudoTopicoResponse> {
    return this.http.post<EstudoTopicoResponse>(`${this.apiUrl}/estudos`, req);
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

  listarRevisoesDashboard(): Observable<RevisaoDashboardItem[]> {
  return this.http.get<RevisaoDashboardItem[]>(
    `${this.apiUrl}/revisoes/dashboard`
  );
}


}
