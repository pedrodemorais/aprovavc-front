import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { environment } from 'src/environments/environment';

export interface MateriaExclusaoPreview {
  materiaId: number;
  materiaNome: string;
  totalTopicos: number;
  totalRevisoesTopico: number;
  totalEstudosTopico: number;
  totalAnotacoesTopico: number;
  totalFlashcards: number;
  totalRevisoesFlashcard: number;
  totalVinculosEditalMateria: number;
  totalVinculosEditalTopico: number;
  totalTopicosFinalizados: number;
}

export interface ListarTopicosMateriaResponse {
  topicos: Topico[];
  ordemVersion?: string | null;
}

interface ListarTopicosMateriaRaw {
  topicos?: Topico[];
  ordemVersion?: string | null;
  ordem_version?: string | null;
}

export interface SalvarTopicoPayload {
  id?: number;
  descricao: string;
  ativo?: boolean;
  topicoPaiId?: number | null;
  ordem?: number;
  [key: string]: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class MateriaService {

  private apiUrl = `${environment.apiUrl}/materias`;
  private materiasChangedSubject = new Subject<void>();
  materiasChanged$ = this.materiasChangedSubject.asObservable();

  constructor(private http: HttpClient) {}

  listarMaterias(): Observable<Materia[]> {
    return this.http.get<Materia[]>(this.apiUrl);
  }

  salvarMateria(materia: Materia): Observable<Materia> {
    if (materia.id) {
      return this.http.put<Materia>(`${this.apiUrl}/${materia.id}`, materia)
        .pipe(tap(() => this.materiasChangedSubject.next()));
    }
    return this.http.post<Materia>(this.apiUrl, materia)
      .pipe(tap(() => this.materiasChangedSubject.next()));
  }

  excluirMateria(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(tap(() => this.materiasChangedSubject.next()));
  }

  excluirMateriaPreview(id: number): Observable<MateriaExclusaoPreview> {
    return this.http.get<MateriaExclusaoPreview>(`${this.apiUrl}/${id}/exclusao-preview`);
  }

  notificarMateriasAlteradas(): void {
    this.materiasChangedSubject.next();
  }

  // ---------- TÓPICOS ----------

// materia.service.ts (parte de tópicos)
listarTopicos(materiaId: number): Observable<Topico[]> {
  return this.listarTopicosComMeta(materiaId).pipe(
    map((resp) => resp.topicos || [])
  );
}

listarTopicosComMeta(materiaId: number): Observable<ListarTopicosMateriaResponse> {
  return this.http.get<Topico[] | ListarTopicosMateriaRaw>(`${this.apiUrl}/${materiaId}/topicos`).pipe(
    map((raw) => {
      if (Array.isArray(raw)) {
        return { topicos: raw, ordemVersion: null } as ListarTopicosMateriaResponse;
      }
      const topicos = Array.isArray(raw?.topicos) ? raw.topicos : [];
      const ordemVersion = raw?.ordemVersion ?? raw?.ordem_version ?? null;
      return { topicos, ordemVersion } as ListarTopicosMateriaResponse;
    })
  );
}


// materia.service.ts
salvarTopico(materiaId: number, payload: SalvarTopicoPayload): Observable<Topico> {
    // UPDATE (PUT) -> quando tem ID
    if (payload.id) {
      return this.http.put<Topico>(
        `${this.apiUrl}/${materiaId}/topicos/${payload.id}`,
        payload
      );
    }

    // CREATE (POST) -> quando não tem ID
    return this.http.post<Topico>(
      `${this.apiUrl}/${materiaId}/topicos`,
      payload
    );
  }


excluirTopico(materiaId: number, topicoId: number): Observable<void> {
  return this.http.delete<void>(`${this.apiUrl}/${materiaId}/topicos/${topicoId}`);
}

}
