import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { UnidadeDto } from 'src/app/core/models/unidade.dto';

@Injectable({
  providedIn: 'root'
})
export class UnidadeService {
  private apiUrl = `${environment.apiUrl}/unidades`;

  constructor(private http: HttpClient) {}

  cadastrarUnidade(unidade: UnidadeDto): Observable<UnidadeDto> {
    return this.http.post<UnidadeDto>(this.apiUrl, unidade);
  }

  atualizarUnidade(unidade: UnidadeDto): Observable<UnidadeDto> {
    return this.http.put<UnidadeDto>(`${this.apiUrl}/${unidade.id}`, unidade);
  }

  buscarUnidadePorId(id: number): Observable<UnidadeDto> {
    return this.http.get<UnidadeDto>(`${this.apiUrl}/${id}`);
  }

  buscarTodasUnidades(): Observable<UnidadeDto[]> {
    return this.http.get<UnidadeDto[]>(this.apiUrl);
  }

  deletarUnidade(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  buscarUnidade(nome: string): Observable<UnidadeDto[]> {
  const params = new HttpParams().set('nome', nome);
  return this.http.get<UnidadeDto[]>(`${this.apiUrl}/buscar`, { params });
}
}
