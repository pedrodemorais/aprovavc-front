import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError, tap, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ProvaMateria } from '../models/prova-materia.model';

@Injectable({ providedIn: 'root' })
export class ProvaMateriaService {

  private baseUrl = `${environment.apiUrl}/provas-estudo`;

  private _refresh$ = new Subject<void>();
  get refresh$(): Observable<void> {
    return this._refresh$.asObservable();
  }

  constructor(private http: HttpClient) {}

  private handleError(error: any) {
    console.error('Erro na API ProvaMateria:', error);
    return throwError(() => error);
  }

  private url(provaId: number): string {
    return `${this.baseUrl}/${provaId}/materias`;
  }

  listar(provaId: number): Observable<ProvaMateria[]> {
    const url = this.url(provaId);
    console.log('[ProvaMateriaService] GET listar ->', url);

    return this.http.get<ProvaMateria[]>(url).pipe(
      catchError(err => this.handleError(err))
    );
  }

  adicionar(provaId: number, dto: ProvaMateria): Observable<ProvaMateria> {
    const url = this.url(provaId);
    console.log('[ProvaMateriaService] POST adicionar ->', url, 'payload:', dto);

    return this.http.post<ProvaMateria>(url, dto).pipe(
      tap(() => {
        console.log('[ProvaMateriaService] adicionou matéria ao edital, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  remover(provaId: number, id: number): Observable<void> {
    const url = `${this.url(provaId)}/${id}`;
    console.log('[ProvaMateriaService] DELETE remover ->', url);

    return this.http.delete<void>(url).pipe(
      tap(() => {
        console.log('[ProvaMateriaService] removeu matéria do edital, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }
}
