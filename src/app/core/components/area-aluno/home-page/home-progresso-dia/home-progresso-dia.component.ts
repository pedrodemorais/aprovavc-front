import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-home-progresso-dia',
  templateUrl: './home-progresso-dia.component.html',
  styleUrls: ['./home-progresso-dia.component.css']
})
export class HomeProgressoDiaComponent {
  @Input() streakDias = 0;
  @Input() topicosRevisados = 0;
  @Input() flashcardsRevisados = 0;
  @Input() topicosEstudados = 0;
}
