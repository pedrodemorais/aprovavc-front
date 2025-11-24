import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ProvaEstudo } from '../models/prova-estudo.model';

@Injectable({ providedIn: 'root' })
export class ProvaEstudoService {

  private baseUrl = `${environment.apiUrl}/provas-estudo`;

  constructor(private http: HttpClient) {}

  listar(nome?: string): Observable<ProvaEstudo[]> {
    let params = new HttpParams();
    if (nome) {
      params = params.set('nome', nome);
    }
    return this.http.get<ProvaEstudo[]>(this.baseUrl, { params });
  }

  obter(id: number): Observable<ProvaEstudo> {
    return this.http.get<ProvaEstudo>(`${this.baseUrl}/${id}`);
  }

  criar(dto: ProvaEstudo): Observable<ProvaEstudo> {
    return this.http.post<ProvaEstudo>(this.baseUrl, dto);
  }

  atualizar(id: number, dto: ProvaEstudo): Observable<ProvaEstudo> {
    return this.http.put<ProvaEstudo>(`${this.baseUrl}/${id}`, dto);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  inativar(id: number): Observable<ProvaEstudo> {
    return this.http.patch<ProvaEstudo>(`${this.baseUrl}/${id}/inativar`, {});
  }
}
