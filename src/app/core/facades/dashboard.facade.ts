import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';
import { DashboardSummary } from '../models/dashboard-summary.models';
import { DashboardSummaryService } from '../services/dashboard-summary.service';
import { RefreshBusService } from '../services/refresh-bus.service';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardFacade {
  private readonly janelaStorageKey = 'dashboard:janelaDias:v1';
  private readonly summarySubject = new BehaviorSubject<DashboardSummary | null>(null);
  readonly summary$ = this.summarySubject.asObservable();

  private readonly janelaSubject = new BehaviorSubject<1 | 7 | 14 | 30>(this.lerJanelaPersistida());
  readonly janela$ = this.janelaSubject.asObservable();

  private cache = new Map<number, DashboardSummary>();
  private inFlight = new Map<number, Observable<DashboardSummary>>();

  constructor(
    private dashboardSummaryService: DashboardSummaryService,
    private refreshBus: RefreshBusService
  ) {
    this.refreshBus.revisaoConcluida$.subscribe((evento) => {
      console.warn('[DASHBOARD][FACADE][EVENTO_REVISAO]', {
        origem: evento?.origem ?? null,
        topicoId: Number(evento?.topicoId || 0) || null,
        timestamp: Number(evento?.timestamp || Date.now())
      });
      this.invalidarCache();
    });
  }

  get janelaAtual(): 1 | 7 | 14 | 30 {
    return this.janelaSubject.value;
  }

  setJanela(janela: 1 | 7 | 14 | 30): void {
    this.janelaSubject.next(janela);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.janelaStorageKey, String(janela));
    }
  }

  loadSummary(janelaDias: 1 | 7 | 14 | 30, force = false): Observable<DashboardSummary> {
    console.warn('[DASHBOARD][FACADE][LOAD]', {
      janelaDias,
      force,
      cacheHit: this.cache.has(janelaDias),
      inFlight: this.inFlight.has(janelaDias)
    });
    this.setJanela(janelaDias);
    if (!force && this.cache.has(janelaDias)) {
      const cached = this.cache.get(janelaDias) as DashboardSummary;
      this.summarySubject.next(cached);
      console.warn('[DASHBOARD][FACADE][CACHE_HIT]', {
        janelaDias,
        asOf: cached?.asOf ?? null,
        modoAtivo: cached?.modoAtivo ?? null,
        totalAgora: Number(cached?.resumoAcionavel?.totalAgora || 0)
      });
      return of(cached);
    }

    if (!force && this.inFlight.has(janelaDias)) {
      console.warn('[DASHBOARD][FACADE][IN_FLIGHT_REUSE]', { janelaDias });
      return this.inFlight.get(janelaDias) as Observable<DashboardSummary>;
    }

    const req$ = this.dashboardSummaryService.getSummary(janelaDias).pipe(
      tap((summary) => {
        this.cache.set(janelaDias, summary);
        this.summarySubject.next(summary);
        this.debugSnapshot(summary);
      }),
      finalize(() => {
        this.inFlight.delete(janelaDias);
      }),
      shareReplay(1)
    );

    this.inFlight.set(janelaDias, req$);
    return req$;
  }

  invalidarCache(): void {
    console.warn('[DASHBOARD][FACADE][INVALIDAR_CACHE]', {
      cacheSizeAntes: this.cache.size,
      inFlightAntes: this.inFlight.size
    });
    this.cache.clear();
    this.inFlight.clear();
  }

  private lerJanelaPersistida(): 1 | 7 | 14 | 30 {
    const fallback: 1 | 7 | 14 | 30 = 30;
    if (typeof localStorage === 'undefined') return fallback;
    const raw = Number(localStorage.getItem(this.janelaStorageKey));
    if (raw === 1 || raw === 7 || raw === 14 || raw === 30) return raw;
    return fallback;
  }

  private debugSnapshot(summary: DashboardSummary): void {
    if (environment.production) return;
    const totalAgora = Number(summary?.resumoAcionavel?.totalAgora || 0);
    console.debug('[DASHBOARD][SUMMARY]', {
      asOf: summary?.asOf,
      janelaDias: summary?.janelaDias,
      modoAtivo: summary?.modoAtivo,
      totalAgora
    });
  }
}
