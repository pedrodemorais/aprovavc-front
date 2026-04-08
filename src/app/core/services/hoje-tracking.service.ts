import { Injectable } from '@angular/core';

export interface HojeItemConcluidoEvent {
  evento: 'HOJE_ITEM_CONCLUIDO';
  tipo: string;
  prioridade: string;
  tempoEstimado: number;
  timestamp: string;
}

export interface HojeFilaConcluidaEvent {
  evento: 'HOJE_FILA_CONCLUIDA';
  totalItens: number;
  tempoTotal: number;
  data: string;
}

type HojeTrackingEvent = HojeItemConcluidoEvent | HojeFilaConcluidaEvent;

@Injectable({ providedIn: 'root' })
export class HojeTrackingService {
  private readonly events: HojeTrackingEvent[] = [];

  registrarItemConcluido(tipo: string, prioridade: string, tempoEstimado: number): void {
    this.events.push({
      evento: 'HOJE_ITEM_CONCLUIDO',
      tipo,
      prioridade,
      tempoEstimado,
      timestamp: new Date().toISOString()
    });
  }

  registrarFilaConcluida(totalItens: number, tempoTotal: number): void {
    this.events.push({
      evento: 'HOJE_FILA_CONCLUIDA',
      totalItens,
      tempoTotal,
      data: new Date().toISOString().slice(0, 10)
    });
  }

  listarEventos(): HojeTrackingEvent[] {
    return [...this.events];
  }

  limparEventos(): void {
    this.events.length = 0;
  }
}
