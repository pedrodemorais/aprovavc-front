import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { TopicoEdital } from '../models/topico-edital.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TopicoEditalService {

  private baseUrl = `${environment.apiUrl}/topicos-edital`;

  constructor(private http: HttpClient) {}

  private handleError(error: any) {
    console.error('Erro na API TopicoEdital:', error);
    return throwError(() => error);
  }

  listarPorProva(provaId: number): Observable<TopicoEdital[]> {
    const params = new HttpParams().set('provaId', provaId.toString());
    return this.http.get<TopicoEdital[]>(this.baseUrl, { params })
      .pipe(catchError(this.handleError));
  }

  listarPorProvaEMateria(provaId: number, materiaId: number): Observable<TopicoEdital[]> {
    const params = new HttpParams()
      .set('provaId', provaId.toString())
      .set('materiaId', materiaId.toString());

    return this.http.get<TopicoEdital[]>(this.baseUrl, { params })
      .pipe(catchError(this.handleError));
  }

  buscarPorId(id: number): Observable<TopicoEdital> {
    return this.http.get<TopicoEdital>(`${this.baseUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

criar(topico: TopicoEdital): Observable<TopicoEdital> {
  return this.http.post<TopicoEdital>(this.baseUrl, topico)
    .pipe(catchError(err => this.handleError(err)));
}

  atualizar(id: number, topico: TopicoEdital): Observable<TopicoEdital> {
    return this.http.put<TopicoEdital>(`${this.baseUrl}/${id}`, topico)
      .pipe(catchError(this.handleError));
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }
}
