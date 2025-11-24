import { Component } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-recuperar-senha',
  templateUrl: './recuperar-senha.component.html',
  styleUrls: ['./recuperar-senha.component.css']
})

export class RecuperarSenhaComponent {
  email: string = '';
  mensagemSucesso: string = '';
  mensagemErro: string = '';

  constructor(private authService: AuthService) {}

  onSubmit() {
    if (!this.email) {
      this.mensagemErro = "❌ Por favor, insira um e-mail válido.";
      this.mensagemSucesso = "";
      return;
    }

    this.authService.solicitarToken(this.email).subscribe({
      next: (response) => {
        this.mensagemSucesso = "✅ E-mail enviado! Verifique sua caixa de entrada.";
        this.mensagemErro = ""; // Limpa mensagem de erro caso tenha
      },
      error: (err) => {
        console.error("Erro ao recuperar senha:", err);

        if (err.status === 404) {
          this.mensagemErro = "❌ O e-mail informado não foi encontrado na base de dados.";
        } else if (err.error && typeof err.error === 'string') {
          this.mensagemErro = `❌ ${err.error}`;
        } else {
          this.mensagemErro = "❌ Erro ao solicitar recuperação de senha. Tente novamente.";
        }

        this.mensagemSucesso = ""; // Limpa mensagem de sucesso caso tenha
      }
    });
  }
}
