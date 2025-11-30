import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, tap, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Topico } from '../models/Topico';

@Injectable({ providedIn: 'root' })
export class TopicoService {

  private baseUrlMaterias = `${environment.apiUrl}/materias`;

  private _refresh$ = new Subject<void>();
  get refresh$(): Observable<void> {
    return this._refresh$.asObservable();
  }

  constructor(private http: HttpClient) {}

  private handleError(error: any) {
    console.error('Erro na API Topico:', error);
    return throwError(() => error);
  }

  private urlTopicos(materiaId: number): string {
    return `${this.baseUrlMaterias}/${materiaId}/topicos`;
  }

  listarArvore(materiaId: number): Observable<Topico[]> {
    const url = this.urlTopicos(materiaId);
    console.log('[TopicoService] GET listarArvore ->', url);

    return this.http.get<Topico[]>(url).pipe(
      catchError(err => this.handleError(err))
    );
  }

  obter(materiaId: number, id: number): Observable<Topico> {
    const url = `${this.urlTopicos(materiaId)}/${id}`;
    console.log('[TopicoService] GET obter ->', url);

    return this.http.get<Topico>(url).pipe(
      catchError(err => this.handleError(err))
    );
  }

  criar(materiaId: number, dto: Partial<Topico>): Observable<Topico> {
    const url = this.urlTopicos(materiaId);
    console.log('[TopicoService] POST criar ->', url, 'payload:', dto);

    return this.http.post<Topico>(url, dto).pipe(
      tap(() => {
        console.log('[TopicoService] criou tópico, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  atualizar(materiaId: number, id: number, dto: Partial<Topico>): Observable<Topico> {
    const url = `${this.urlTopicos(materiaId)}/${id}`;
    console.log('[TopicoService] PUT atualizar ->', url, 'payload:', dto);

    return this.http.put<Topico>(url, dto).pipe(
      tap(() => {
        console.log('[TopicoService] atualizou tópico, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  // excluir(materiaId: number, id: number): Observable<void> {
  //   const url = `${this.urlTopicos(materiaId)}/${id}`;
  //   console.log('[TopicoService] DELETE excluir ->', url);

  //   return this.http.delete<void>(url).pipe(
  //     tap(() => {
  //       console.log('[TopicoService] excluiu tópico, emitindo refresh$');
  //       this._refresh$.next();
  //     }),
  //     catchError(err => this.handleError(err))
  //   );
  // }

   excluir(materiaId: number, topicoId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrlMaterias}/${materiaId}/topicos/${topicoId}`);
  }
}
