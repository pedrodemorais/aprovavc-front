import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-home-missao-dia',
  templateUrl: './home-missao-dia.component.html',
  styleUrls: ['./home-missao-dia.component.css']
})
export class HomeMissaoDiaComponent {
  @Input() totalRevisoes = 0;
  @Input() concluidas = 0;
  @Input() tempoEstimadoMinutos = 0;
  @Input() tempoRestanteMinutos = 0;
  @Output() iniciarRevisao = new EventEmitter<void>();

  get iniciou(): boolean {
    return this.concluidas > 0 && this.totalRevisoes > 0;
  }

  get progressoPercentual(): number {
    if (this.totalRevisoes <= 0) return 0;
    return Math.min(100, Math.round((this.concluidas / this.totalRevisoes) * 100));
  }

  onIniciar(): void {
    this.iniciarRevisao.emit();
  }
}
