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
        this.messageService.add({
          severity: 'error',
          summary: 'Falha ao carregar foco',
          detail: 'Nao foi possivel carregar o plano diario.'
        });
        return throwError(() => err);
      })
    );
  }

  mapearMetricasPremium(plano: FocoPlanoDiarioDTO | null | undefined): FocoPremiumMetrics {
    const fila = Array.isArray(plano?.filaRevisao) ? plano!.filaRevisao : [];
    const baseValida = fila
      .map((item) => Number(item?.score))
      .filter((score) => Number.isFinite(score) && score >= 0 && score <= 1);

    const dadosConsolidados = baseValida.length >= 5;
    const estabilidadeMedia = dadosConsolidados
      ? Number((baseValida.reduce((acc, score) => acc + score, 0) / baseValida.length).toFixed(2))
      : null;
    const riscoMedio = estabilidadeMedia === null ? null : Number((1 - estabilidadeMedia).toFixed(2));
    const retencao14d = estabilidadeMedia;

    const totalAgora = Number(plano?.resumoAcionavel?.totalAgora);
    const criticos = Number(plano?.resumoAcionavel?.criticos);
    const emRisco = Number(plano?.resumoAcionavel?.emRisco);
    const percentualTopicosEmRisco =
      Number.isFinite(totalAgora) && totalAgora > 0
        ? Math.round((((Number.isFinite(criticos) ? criticos : 0) + (Number.isFinite(emRisco) ? emRisco : 0)) * 100) / totalAgora)
        : null;

    return {
      dadosConsolidados,
      estabilidadeMedia,
      riscoMedio,
      retencao14d,
      percentualTopicosEmRisco
    };
  }
}
