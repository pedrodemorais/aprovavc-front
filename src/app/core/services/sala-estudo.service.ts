// src/app/core/services/sala-estudo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class SalaEstudoService {

  
  private apiUrl = `${environment.apiUrl}/materias`;

  constructor(private http: HttpClient) {}

  // Reaproveita o endpoint que já funciona na tela de cadastro:
  listarTopicosPorMateria(materiaId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${materiaId}/topicos`);
  }
}
