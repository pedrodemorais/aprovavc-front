import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DashboardSummary } from '../models/dashboard-summary.models';

@Injectable({ providedIn: 'root' })
export class DashboardSummaryService {
  private readonly baseUrl = `${environment.apiUrl}/dashboard/summary`;

  constructor(private http: HttpClient) {}

  getSummary(janelaDias: number, editalId?: number | null): Observable<DashboardSummary> {
    const traceId = `summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    let params = new HttpParams()
      .set('janelaDias', String(janelaDias))
      .set('_t', String(Date.now()));
    if (Number.isFinite(Number(editalId)) && Number(editalId) > 0) {
      params = params.set('editalId', String(editalId));
    }
    console.warn('[DASHBOARD][SUMMARY][REQ]', {
      traceId,
      startedAtIso: new Date(startedAt).toISOString(),
      baseUrl: this.baseUrl,
      janelaDias,
      editalId: Number.isFinite(Number(editalId)) ? Number(editalId) : null,
      params: params.toString()
    });
    return this.http.get<DashboardSummary>(this.baseUrl, { params }).pipe(
      tap((summary) => {
        const elapsedMs = Date.now() - startedAt;
        const fila = Array.isArray(summary?.filaAtiva?.itens) ? summary.filaAtiva.itens : [];
        const top3 = fila.slice(0, 3).map((i) => ({
          topicoId: Number(i?.topicoId || 0),
          categoria: String(i?.categoria || ''),
          score: Number.isFinite(Number(i?.score)) ? Number(i?.score) : null,
          proxRevisao: i?.proxRevisao ?? null
        }));
        console.warn('[DASHBOARD][SUMMARY][OK]', {
          traceId,
          elapsedMs,
          asOf: summary?.asOf ?? null,
          modoAtivo: summary?.modoAtivo ?? null,
          totalAgora: Number(summary?.resumoAcionavel?.totalAgora || 0),
          criticos: Number(summary?.resumoAcionavel?.criticos || 0),
          emRisco: Number(summary?.resumoAcionavel?.emRisco || 0),
          filaAtivaSize: fila.length,
          filaTop3: top3
        });
      }),
      catchError((error) => {
        const elapsedMs = Date.now() - startedAt;
        console.error('[DASHBOARD][SUMMARY][ERRO]', {
          traceId,
          elapsedMs,
          mensagem: error?.message || String(error),
          status: error?.status ?? null,
          url: error?.url ?? this.baseUrl
        });
        return throwError(() => error);
      })
    );
  }
}
