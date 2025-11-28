import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SalaEstudoEstadoService {
  private base = `${environment.apiUrl}/estudo-estado`;

  constructor(private http: HttpClient) {}

  obter(provaId: number, topicoId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/${provaId}/${topicoId}`);
  }

  salvar(dto: any): Observable<any> {
    return this.http.post<any>(this.base, dto); // seu backend é POST
  }
}
