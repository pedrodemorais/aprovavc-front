import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ExecutionQueueItem {
  topicoId: number;
  materiaId: number | null;
}

@Injectable({ providedIn: 'root' })
export class ExecutionQueueService {
  private readonly filaSubject = new BehaviorSubject<ExecutionQueueItem[]>([]);
  readonly fila$ = this.filaSubject.asObservable();

  setFila(itens: ExecutionQueueItem[]): void {
    const fila = (Array.isArray(itens) ? itens : [])
      .map((item) => ({
        topicoId: Number(item?.topicoId || 0),
        materiaId: Number(item?.materiaId || 0) || null
      }))
      .filter((item) => item.topicoId > 0);
    this.filaSubject.next(fila);
  }

  getSnapshot(): ExecutionQueueItem[] {
    return [...this.filaSubject.value];
  }

  clear(): void {
    this.filaSubject.next([]);
  }

  completeAndGetNext(topicoIdConcluido: number): ExecutionQueueItem | null {
    const fila = [...this.filaSubject.value];
    if (!fila.length) return null;

    if (topicoIdConcluido > 0) {
      const idx = fila.findIndex((item) => Number(item.topicoId) === Number(topicoIdConcluido));
      if (idx >= 0) {
        fila.splice(idx, 1);
      } else if (fila.length) {
        fila.shift();
      }
    } else {
      fila.shift();
    }

    this.filaSubject.next(fila);
    return fila.length ? fila[0] : null;
  }
}
