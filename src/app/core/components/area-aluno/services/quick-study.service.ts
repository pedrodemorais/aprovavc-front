import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { SalaEstudoService } from './sala-estudo.service';

export interface QuickStudyRegisterRequest {
  materiaId: number;
  topicoId: number;
  tempoEstudadoMinutos: number;
  dataEstudo?: string;
  observacao?: string;
}

export interface QuickStudyRegisterPayload {
  materiaId: number;
  topicoId: number;
  dataEstudo: string;
  tempoEstudadoMinutos: number;
  observacao?: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuickStudyService {
  private readonly apiUrl = `${environment.apiUrl}/sala-estudo/registros-estudo`;

  constructor(
    private http: HttpClient,
    private salaEstudoService: SalaEstudoService
  ) {}

  register(payload: QuickStudyRegisterRequest): Observable<unknown> {
    const body: QuickStudyRegisterPayload = {
      materiaId: Number(payload.materiaId),
      topicoId: Number(payload.topicoId),
      dataEstudo: payload.dataEstudo || this.getTodayIsoDate(),
      tempoEstudadoMinutos: Number(payload.tempoEstudadoMinutos),
      observacao: payload.observacao?.trim() || undefined
    };
    return this.http.post(this.apiUrl, body).pipe(
      tap(() => this.salaEstudoService.limparCacheRevisoesDashboard()),
      switchMap((resp) => {
        const observacao = body.observacao?.trim() || '';
        if (!observacao) {
          return of(resp);
        }
        const anotacoesHtml = `<p>${this.escapeHtml(observacao).replace(/\n/g, '<br>')}</p>`;
        return this.salaEstudoService.salvarEstudo({
          materiaId: body.materiaId,
          topicoId: body.topicoId,
          modoTemporizador: 'livre',
          tipoSessao: 'ESTUDO',
          tempoLivreSegundos: 0,
          anotacoes: anotacoesHtml
        }).pipe(switchMap(() => of(resp)));
      })
    );
  }

  private getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
