import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TopicoRevisao } from '../models/topico-revisao.model';

@Injectable({
  providedIn: 'root'
})
export class TopicoRevisaoService {

  private apiUrl = `${environment.apiUrl}/topicos-revisao`;

  constructor(private http: HttpClient) { }

  // LISTAR todos (com filtro opcional por matéria/assunto)
  listar(filtro?: string): Observable<TopicoRevisao[]> {
    let params = new HttpParams();
    if (filtro) {
      params = params.set('filtro', filtro);
    }
    return this.http.get<TopicoRevisao[]>(this.apiUrl, { params });
  }

  // LISTAR por ID (se precisar pra tela de edição detalhada)
  obter(id: number): Observable<TopicoRevisao> {
    return this.http.get<TopicoRevisao>(`${this.apiUrl}/${id}`);
  }

  // LISTAR APENAS OS TÓPICOS PARA REVISÃO HOJE
  listarHoje(): Observable<TopicoRevisao[]> {
    return this.http.get<TopicoRevisao[]>(`${this.apiUrl}/hoje`);
  }

  // CRIAR
  criar(dto: TopicoRevisao): Observable<TopicoRevisao> {
    return this.http.post<TopicoRevisao>(this.apiUrl, dto);
  }

  // EDITAR
  editar(id: number, dto: TopicoRevisao): Observable<TopicoRevisao> {
    return this.http.put<TopicoRevisao>(`${this.apiUrl}/${id}`, dto);
  }

  // EXCLUIR
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // MARCAR COMO REVISADO
  revisar(id: number): Observable<TopicoRevisao> {
    return this.http.patch<TopicoRevisao>(`${this.apiUrl}/${id}/revisar`, {});
  }
}
