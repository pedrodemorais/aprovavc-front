import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-home-continuar-estudo',
  templateUrl: './home-continuar-estudo.component.html',
  styleUrls: ['./home-continuar-estudo.component.css']
})
export class HomeContinuarEstudoComponent {
  @Input() materiaNome = '';
  @Input() proximoTopico = '';
  @Input() tempoEstimadoMinutos = 10;
  @Input() disponivel = false;
  @Output() estudar = new EventEmitter<void>();

  onEstudarAgora(): void {
    this.estudar.emit();
  }
}
