import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type StatusEstudoDTO = 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';
export type PomodoroEtapaDTO = 'foco' | 'pausa_curta' | 'pausa_longa';

export interface EstudoTopicoEstadoDTO {
  provaId: number;
  topicoId: number;

  notas: string;
  status: StatusEstudoDTO;
  tempoMs: number;
  ultimaAtualizacao: string; // ISO

  pomodoro?: {
    etapa: PomodoroEtapaDTO;
    restanteMs: number;
    ciclosFocoConcluidos: number;
  };
}

@Injectable({ providedIn: 'root' })
export class EstudoTopicoEstadoService {
  // 🔧 Ajuste aqui se o seu baseUrl for diferente
  private baseUrl = `${environment.apiUrl}/estudos/estado`;

  constructor(private http: HttpClient) {}

  obter(provaId: number, topicoId: number): Observable<EstudoTopicoEstadoDTO> {
    return this.http.get<EstudoTopicoEstadoDTO>(`${this.baseUrl}/${provaId}/${topicoId}`);
  }

  salvar(dto: EstudoTopicoEstadoDTO): Observable<EstudoTopicoEstadoDTO> {
    return this.http.put<EstudoTopicoEstadoDTO>(`${this.baseUrl}`, dto);
  }

  listarPorProva(provaId: number): Observable<EstudoTopicoEstadoDTO[]> {
    return this.http.get<EstudoTopicoEstadoDTO[]>(`${this.baseUrl}/prova/${provaId}`);
  }
}
