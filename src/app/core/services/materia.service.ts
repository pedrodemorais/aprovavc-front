import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MateriaService {

  private apiUrl = `${environment.apiUrl}/materias`;

  constructor(private http: HttpClient) {}

  listarMaterias(): Observable<Materia[]> {
    return this.http.get<Materia[]>(this.apiUrl);
  }

  salvarMateria(materia: Materia): Observable<Materia> {
    if (materia.id) {
      return this.http.put<Materia>(`${this.apiUrl}/${materia.id}`, materia);
    }
    return this.http.post<Materia>(this.apiUrl, materia);
  }

  excluirMateria(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  listarTopicos(materiaId: number): Observable<Topico[]> {
    return this.http.get<Topico[]>(`${this.apiUrl}/${materiaId}/topicos`);
  }

  salvarTopicos(materiaId: number, topicos: Topico[]): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${materiaId}/topicos`, topicos);
  }
}
