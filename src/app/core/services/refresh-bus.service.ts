import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface RevisaoConcluidaEvent {
  origem: 'anotacao' | 'flashcard' | 'finalizacao-topico' | 'desconhecida';
  topicoId?: number;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class RefreshBusService {
  private readonly revisaoConcluidaSubject = new Subject<RevisaoConcluidaEvent>();
  readonly revisaoConcluida$: Observable<RevisaoConcluidaEvent> = this.revisaoConcluidaSubject.asObservable();

  emitRevisaoConcluida(evento: Omit<RevisaoConcluidaEvent, 'timestamp'>): void {
    const payload: RevisaoConcluidaEvent = {
      ...evento,
      timestamp: Date.now()
    };
    console.warn('[REFRESH_BUS][REVISAO_CONCLUIDA][EMIT]', {
      origem: payload?.origem ?? 'desconhecida',
      topicoId: Number(payload?.topicoId || 0) || null,
      timestamp: payload.timestamp,
      timestampIso: new Date(payload.timestamp).toISOString()
    });
    this.revisaoConcluidaSubject.next(payload);
  }
}
