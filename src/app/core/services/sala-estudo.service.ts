import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { SalaEstudoMateria } from '../models/SalaEstudoMateria';
import { EstudoMateria, EstudoMateriaRequest } from '../models/EstudoMateria';
import { RevisaoMateria } from '../models/RevisaoMateria';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalaEstudoService {

  private baseUrl = `${environment.apiUrl}/sala-estudo`;

  constructor(private http: HttpClient) {}

  carregarSala(materiaId: number, alunoId: number): Observable<SalaEstudoMateria> {
    const params = new HttpParams().set('alunoId', alunoId);
    return this.http
      .get<SalaEstudoMateria>(`${this.baseUrl}/materias/${materiaId}`, { params })
      .pipe(
        catchError(err => {
          console.error('Erro ao carregar sala de estudo', err);
          return throwError(() => err);
        })
      );
  }

  registrarEstudo(materiaId: number, alunoId: number, conteudo: string): Observable<EstudoMateria> {
    const params = new HttpParams().set('alunoId', alunoId);
    const body: EstudoMateriaRequest = { conteudo };

    return this.http
      .post<EstudoMateria>(`${this.baseUrl}/materias/${materiaId}/estudos`, body, { params })
      .pipe(
        catchError(err => {
          console.error('Erro ao registrar estudo', err);
          return throwError(() => err);
        })
      );
  }

  listarRevisoesPendentes(materiaId: number, alunoId: number): Observable<RevisaoMateria[]> {
    const params = new HttpParams().set('alunoId', alunoId);
    return this.http
      .get<RevisaoMateria[]>(`${this.baseUrl}/materias/${materiaId}/revisoes`, { params })
      .pipe(
        catchError(err => {
          console.error('Erro ao listar revisões pendentes', err);
          return throwError(() => err);
        })
      );
  }

  concluirRevisao(revisaoId: number, alunoId: number): Observable<RevisaoMateria> {
    const params = new HttpParams().set('alunoId', alunoId);
    return this.http
      .post<RevisaoMateria>(`${this.baseUrl}/revisoes/${revisaoId}/concluir`, null, { params })
      .pipe(
        catchError(err => {
          console.error('Erro ao concluir revisão', err);
          return throwError(() => err);
        })
      );
  }
}
