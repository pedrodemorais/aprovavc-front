import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, tap, catchError, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ProvaEstudo } from '../models/prova-estudo.model';

@Injectable({ providedIn: 'root' })
export class ProvaEstudoService {

  private baseUrl = `${environment.apiUrl}/provas-estudo`;

  private _refresh$ = new Subject<void>();
  get refresh$(): Observable<void> {
    return this._refresh$.asObservable();
  }

  constructor(private http: HttpClient) {}

  private handleError(error: any) {
    console.error('Erro na API ProvaEstudo:', error);
    return throwError(() => error);
  }

  listar(nome?: string): Observable<ProvaEstudo[]> {
    let params = new HttpParams();
    if (nome) {
      params = params.set('nome', nome);
    }
    return this.http.get<ProvaEstudo[]>(this.baseUrl, { params })
      .pipe(catchError(err => this.handleError(err)));
  }

  obter(id: number): Observable<ProvaEstudo> {
    return this.http.get<ProvaEstudo>(`${this.baseUrl}/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  criar(dto: ProvaEstudo): Observable<ProvaEstudo> {
    return this.http.post<ProvaEstudo>(this.baseUrl, dto).pipe(
      tap(() => {
        console.log('[ProvaEstudoService] criou prova, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  atualizar(id: number, dto: ProvaEstudo): Observable<ProvaEstudo> {
    return this.http.put<ProvaEstudo>(`${this.baseUrl}/${id}`, dto).pipe(
      tap(() => {
        console.log('[ProvaEstudoService] atualizou prova, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        console.log('[ProvaEstudoService] excluiu prova, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }

  inativar(id: number): Observable<ProvaEstudo> {
    return this.http.patch<ProvaEstudo>(`${this.baseUrl}/${id}/inativar`, {}).pipe(
      tap(() => {
        console.log('[ProvaEstudoService] inativou prova, emitindo refresh$');
        this._refresh$.next();
      }),
      catchError(err => this.handleError(err))
    );
  }
}
