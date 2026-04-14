import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FocoPlanoDiarioDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { environment } from 'src/environments/environment';

export interface FocoPremiumMetrics {
  dadosConsolidados: boolean;
  estabilidadeMedia: number | null;
  riscoMedio: number | null;
  retencao14d: number | null;
  percentualTopicosEmRisco: number | null;
}

@Injectable({ providedIn: 'root' })
export class FocoPlanoDiarioService {
  private readonly baseUrl = `${environment.apiUrl}/foco/plano-diario`;

  constructor(
    private http: HttpClient,
    private messageService: MessageService
  ) {}

  obterPlanoDiario(editalId?: number): Observable<FocoPlanoDiarioDTO> {
    let params = new HttpParams();
    if (Number.isFinite(Number(editalId)) && Number(editalId) > 0) {
      params = params.set('editalId', String(Number(editalId)));
    }

    return this.http.get<FocoPlanoDiarioDTO>(this.baseUrl, { params }).pipe(
      catchError((err) => {
        console.warn('[FOCO] load error', err);
        if (!this.isErroSemEditalAtivo(err)) {
          this.messageService.add({
            severity: 'error',
            summary: 'Falha ao carregar foco',
            detail: 'Nao foi possivel carregar o plano diario.'
          });
        }
        return throwError(() => err);
      })
    );
  }

  private isErroSemEditalAtivo(err: any): boolean {
    const status = Number(err?.status || 0);
    const serverMessage = String(err?.error?.message || '').trim().toLowerCase();
    const detail = String(err?.error?.detail || '').trim().toLowerCase();
    const text = `${serverMessage} ${detail}`;
    return text.includes('nenhum edital ativo') || status === 412;
  }

}
