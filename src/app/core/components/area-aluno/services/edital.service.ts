import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Edital } from '../models/Edital';

export interface EditalFormPayload {
  nome: string;
  descricao?: string | null;
  dataProva?: string | null;   // yyyy-MM-dd
  materiasIds: number[];
}

@Injectable({ providedIn: 'root' })
export class EditalService {

  private apiUrl = `${environment.apiUrl}/editais`;

  constructor(private http: HttpClient) {}

  listar(): Observable<Edital[]> {
    return this.http.get<Edital[]>(this.apiUrl);
  }

  buscarPorId(id: number): Observable<Edital> {
    return this.http.get<Edital>(`${this.apiUrl}/${id}`);
  }

  criar(payload: EditalFormPayload): Observable<Edital> {
    return this.http.post<Edital>(this.apiUrl, payload);
  }

  atualizar(id: number, payload: EditalFormPayload): Observable<Edital> {
    return this.http.put<Edital>(`${this.apiUrl}/${id}`, payload);
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
