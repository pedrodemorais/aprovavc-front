// src/app/core/services/sala-estudo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { FlashcardDTO } from '../models/FlashcardDTO';

export interface EstudoTopicoRequest {
  materiaId: number;
  topicoId: number;

  // mesmo nome e tipo lógico do back
  modoTemporizador: string;        // "livre" ou "pomodoro" (ou "LIVRE"/"POMODORO" se vc quiser padronizar)

  tempoLivreSegundos: number;      // corresponde ao tempo usado no estudo

  pomodoroFase?: string;           // "foco", "pausa-curta", "pausa-longa"
  pomodoroCiclosConcluidos?: number;

  anotacoes?: string;
}

export interface EstudoTopicoResponse {
  id: number;
  materiaId: number;
  topicoId: number;
  modoTemporizador: string;
  tempoLivreSegundos: number;
  // se sua entidade/DTO de resposta tiver outras coisas, você adiciona depois
}

export interface AnotacaoTopicoDTO {
  topicoId: number;
  anotacoes: string;
}

@Injectable({ providedIn: 'root' })
export class SalaEstudoService {

  private apiUrl = `${environment.apiUrl}/sala-estudo`;

  constructor(private http: HttpClient) {}

  salvarEstudo(req: EstudoTopicoRequest): Observable<EstudoTopicoResponse> {
    return this.http.post<EstudoTopicoResponse>(`${this.apiUrl}/estudos`, req);
  }

  buscarAnotacoes(topicoId: number): Observable<AnotacaoTopicoDTO> {
    return this.http.get<AnotacaoTopicoDTO>(`${this.apiUrl}/topicos/${topicoId}/anotacoes`);
  }

  criarFlashcard(dto: FlashcardDTO): Observable<FlashcardDTO> {
    return this.http.post<FlashcardDTO>(`${this.apiUrl}/flashcards`, dto);
  }

  listarFlashcardsPorTopico(topicoId: number): Observable<FlashcardDTO[]> {
    return this.http.get<FlashcardDTO[]>(`${this.apiUrl}/flashcards/topico/${topicoId}`);
  }

  excluirFlashcard(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/flashcards/${id}`);
  }
}
