import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { MateriaEstudo } from '../models/materia-estudo.model';

@Injectable({ providedIn: 'root' })
export class MateriaEstudoService {

  private baseUrl = `${environment.apiUrl}/materias-estudo`;

  constructor(private http: HttpClient) {}

  // LISTAR (com filtro opcional por nome)
  listar(nome?: string): Observable<MateriaEstudo[]> {
    let params = new HttpParams();
    if (nome) {
      params = params.set('nome', nome);
    }
    return this.http.get<MateriaEstudo[]>(this.baseUrl, { params });
  }

  // BUSCAR POR ID (se quiser usar em outra tela depois)
  obter(id: number): Observable<MateriaEstudo> {
    return this.http.get<MateriaEstudo>(`${this.baseUrl}/${id}`);
  }

  // CRIAR
  criar(materia: MateriaEstudo): Observable<MateriaEstudo> {
    return this.http.post<MateriaEstudo>(this.baseUrl, materia);
  }

  // EDITAR
  atualizar(id: number, materia: MateriaEstudo): Observable<MateriaEstudo> {
    return this.http.put<MateriaEstudo>(`${this.baseUrl}/${id}`, materia);
  }

  // EXCLUIR
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // INATIVAR (se quiser usar futuramente)
  inativar(id: number): Observable<MateriaEstudo> {
    return this.http.patch<MateriaEstudo>(`${this.baseUrl}/${id}/inativar`, {});
  }
}
