import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';

@Component({
  selector: 'app-redefinir-senha',
  templateUrl: './redefinir-senha.component.html',
  styleUrls: ['./redefinir-senha.component.css']
})

export class RedefinirSenhaComponent implements OnInit {
  token: string = '';
  novaSenha: string = '';
  mensagem: string = '';
  erro: string = '';

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
      if (this.token) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
      }
  
      if (!this.token) {
        this.erro = "❌ Token inválido ou ausente.";
        return;
      }
  
      this.authService.validarToken(this.token).subscribe({
        next: () => {
          this.mensagem = "✅ Token válido. Você pode redefinir sua senha.";
        },
        error: (err) => {
          console.error("❌ Erro ao validar token:", err);
          this.erro = "❌ Token inválido ou expirado.";
        }
      });
    });
  }
  
  
  redefinirSenha() {
    const payload = {
      token: this.token, // Enviando token corretamente no body
      novaSenha: this.novaSenha
    };
  
    this.authService.redefinirSenha(payload).subscribe({
      next: () => {
        alert("✅ Senha redefinida com sucesso! Faça login.");
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error("❌ Erro ao redefinir senha:", err);
        this.erro = "❌ Erro ao redefinir senha. Tente novamente.";
      }
    });
  }
  
}
