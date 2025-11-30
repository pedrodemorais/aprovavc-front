import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
@Component({
  selector: 'app-ativacao',
  templateUrl: './ativacao.component.html',
  styleUrls: ['./ativacao.component.css']
})
export class AtivacaoComponent implements OnInit {
  mensagem = '';
sucesso = false;
  constructor(private authService: AuthService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
     if (token) {
    this.authService.ativarConta(token).subscribe({
      next: () => {
        this.sucesso = true;
        this.mensagem = 'Conta ativada com sucesso! Redirecionando para login...';
        setTimeout(() => this.router.navigate(['/login'], { queryParams: { ativado: true } }), 2000);
      },
      error: () => {
        this.mensagem = 'Erro ao ativar conta. Token inválido ou expirado.';
      }
    });
  } else {
    this.mensagem = 'Token de ativação inválido.';
  }
  }
}
