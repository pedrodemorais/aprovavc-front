import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, tap, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Materia } from '../models/Materia ';

@Injectable({ providedIn: 'root' })
export class MateriaService {

  private baseUrl = `${environment.apiUrl}/materias`;

  private _refresh$ = new Subject<void>();
  get refresh$(): Observable<void> {
    return this._refresh$.asObservable();
  }

  constructor(private http: HttpClient) {}

  private handleError(error: any) {
    console.error('Erro na API Materia:', error);
    return throwError(() => error);
  }

  listar(nome?: string): Observable<Materia[]> {
    let params = new HttpParams();
    if (nome) {
      params = params.set('nome', nome);
    }

    return this.http.get<Materia[]>(this.baseUrl, { params })
      .pipe(catchError(err => this.handleError(err)));
  }

  obter(id: number): Observable<Materia> {
    return this.http.get<Materia>(`${this.baseUrl}/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  // 👇 AQUI: aceita Partial<Materia>
  criar(dto: Partial<Materia>): Observable<Materia> {
    return this.http.post<Materia>(this.baseUrl, dto).pipe(
      tap(() => {
        console.log('[MateriaService] criou matéria, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  // 👇 AQUI TAMBÉM: aceita Partial<Materia>
  atualizar(id: number, dto: Partial<Materia>): Observable<Materia> {
    return this.http.put<Materia>(`${this.baseUrl}/${id}`, dto).pipe(
      tap(() => {
        console.log('[MateriaService] atualizou matéria, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        console.log('[MateriaService] excluiu (inativou) matéria, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }
}
