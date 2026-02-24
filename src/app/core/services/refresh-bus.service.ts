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
    console.debug('[RefreshBus] REVISAO_CONCLUIDA emit', payload);
    this.revisaoConcluidaSubject.next(payload);
  }
}
