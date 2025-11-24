import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConfiguradorService {
  constructor(private http: HttpClient) { }

  // 1. Busca todos os estados
  getEstados(): Observable<string[]> {
    return this.http.get<string[]>(`${ environment.apiUrl}/estados`);
  }

  // 2. Busca os municípios de um estado específico
  getMunicipiosPorEstado(uf: string): Observable<any[]> {
    return this.http.get<any[]>(`${ environment.apiUrl}/municipios/${uf}`);
  }
}
