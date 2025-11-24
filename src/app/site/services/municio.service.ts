import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MunicipioService {

  constructor(private http: HttpClient) { }


  // 2. Busca os municípios de um estado específico
  getMunicipiosPorEstado(uf: string): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/municipios/${uf}`);
  }
}
