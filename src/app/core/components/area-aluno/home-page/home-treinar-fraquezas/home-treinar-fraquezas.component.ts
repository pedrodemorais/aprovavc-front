import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-home-treinar-fraquezas',
  templateUrl: './home-treinar-fraquezas.component.html',
  styleUrls: ['./home-treinar-fraquezas.component.css']
})
export class HomeTreinarFraquezasComponent {
  @Input() materiaNome = '';
  @Input() topicosBaixaRetencao = 0;
  @Input() tempoEstimadoMinutos = 10;
  @Input() disponivel = false;
  @Output() treinar = new EventEmitter<void>();

  onTreinar(): void {
    this.treinar.emit();
  }
}
