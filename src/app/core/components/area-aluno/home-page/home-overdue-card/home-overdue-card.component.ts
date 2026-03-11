import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-home-overdue-card',
  templateUrl: './home-overdue-card.component.html',
  styleUrls: ['./home-overdue-card.component.css']
})
export class HomeOverdueCardComponent {
  @Input() quantidade = 0;
  @Input() tempoEstimadoMinutos = 0;
  @Output() resolver = new EventEmitter<void>();

  onResolverAgora(): void {
    this.resolver.emit();
  }
}
