import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AtualizarBlocoEstudoRequestDTO,
  AvancarCicloResponseDTO,
  BlocoEstudoDTO,
  PlanoDoDiaDTO
} from '../../dto/blocos-estudo.dto';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class BlocosEstudoService {
  private baseUrl = `${environment.apiUrl}/blocos-estudo`;
  private blocosChangedSubject = new Subject<void>();
  blocosChanged$ = this.blocosChangedSubject.asObservable();

  constructor(private http: HttpClient) {}

  listarBlocos(): Observable<BlocoEstudoDTO[]> {
    return this.http.get<BlocoEstudoDTO[]>(this.baseUrl);
  }

  obterBloco(numero: number): Observable<BlocoEstudoDTO> {
    return this.http.get<BlocoEstudoDTO>(`${this.baseUrl}/${numero}`);
  }

  atualizarBloco(numero: number, dto: AtualizarBlocoEstudoRequestDTO): Observable<BlocoEstudoDTO> {
    return this.http.put<BlocoEstudoDTO>(`${this.baseUrl}/${numero}`, dto)
      .pipe(tap(() => this.blocosChangedSubject.next()));
  }

  notificarBlocosAlterados(): void {
    this.blocosChangedSubject.next();
  }

  removerItem(itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/itens/${itemId}`);
  }

  planoDoDia(): Observable<PlanoDoDiaDTO> {
    return this.http.get<PlanoDoDiaDTO>(`${this.baseUrl}/plano-do-dia`);
  }

  avancarCiclo(): Observable<AvancarCicloResponseDTO> {
    return this.http.post<AvancarCicloResponseDTO>(`${this.baseUrl}/ciclo/avancar`, {});
  }
}
