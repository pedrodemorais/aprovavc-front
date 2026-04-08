import { Component } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { AiService } from 'src/app/core/services/ai.service';

@Component({
  selector: 'app-ai-teste',
  templateUrl: './ai-teste.component.html',
  styleUrls: ['./ai-teste.component.css']
})
export class AiTesteComponent {
  prompt = '';
  resposta = '';
  erro = '';
  loading = false;

  constructor(private aiService: AiService) {}

  enviar(): void {
    const prompt = this.prompt.trim();
    this.erro = '';
    this.resposta = '';

    if (!prompt) {
      return;
    }

    this.loading = true;
    this.aiService.testarIA(prompt)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (resposta) => {
          this.resposta = resposta;
        },
        error: () => {
          this.erro = 'Nao foi possivel consultar a IA agora.';
        }
      });
  }
}
