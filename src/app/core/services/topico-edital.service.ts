import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TopicoEdital } from '../models/topico-edital.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TopicoEditalService {

   private baseUrl = `${environment.apiUrl}/empresas`;


  constructor(private http: HttpClient) {}

  listarPorProvaEMateria(
    empresaId: number,
    provaId: number,
    materiaId: number
  ): Observable<TopicoEdital[]> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital`;
    let params = new HttpParams()
      .set('provaId', provaId.toString())
      .set('materiaId', materiaId.toString());

    return this.http.get<TopicoEdital[]>(url, { params });
  }

  listarPorProva(
    empresaId: number,
    provaId: number
  ): Observable<TopicoEdital[]> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital`;
    let params = new HttpParams()
      .set('provaId', provaId.toString());

    return this.http.get<TopicoEdital[]>(url, { params });
  }

  buscarPorId(
    empresaId: number,
    id: number
  ): Observable<TopicoEdital> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital/${id}`;
    return this.http.get<TopicoEdital>(url);
  }

  criar(
    empresaId: number,
    topico: TopicoEdital
  ): Observable<TopicoEdital> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital`;
    return this.http.post<TopicoEdital>(url, topico);
  }

  atualizar(
    empresaId: number,
    id: number,
    topico: TopicoEdital
  ): Observable<TopicoEdital> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital/${id}`;
    return this.http.put<TopicoEdital>(url, topico);
  }

  excluir(
    empresaId: number,
    id: number
  ): Observable<void> {
    const url = `${this.baseUrl}/${empresaId}/topicos-edital/${id}`;
    return this.http.delete<void>(url);
  }
}
