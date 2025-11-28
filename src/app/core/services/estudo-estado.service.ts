import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type StatusEstudo = 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';
export type PomodoroEtapa = 'foco' | 'pausa_curta' | 'pausa_longa';

export interface EstudoEstadoDTO {
  provaId: number;
  topicoId: number;

  status: StatusEstudo;
  tempoMs: number;
  notas: string;
modo: string;   // "livre" | "pomodoro" | "flashcards" | "anotacoes"
  ultimaAtualizacao: string; // ISO

  // pomodoro (opcional)
  pomodoro?: {
    etapa: PomodoroEtapa;
    restanteMs: number;
    ciclosFocoConcluidos: number;
  };
}

@Injectable({ providedIn: 'root' })
export class EstudoEstadoService {
  private base = `${environment.apiUrl}/estudo-estado`;

  constructor(private http: HttpClient) {}

  obter(provaId: number, topicoId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${provaId}/${topicoId}`);
  }

  salvar(dto: any): Observable<any> {
    return this.http.post<any>(this.base, dto);
  }
}
