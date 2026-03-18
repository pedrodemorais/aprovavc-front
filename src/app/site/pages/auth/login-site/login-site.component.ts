import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { NotificationService } from 'src/app/site/services/notification.service';
import { HttpErrorResponse } from '@angular/common/http';
import { PlanoSemanalBootstrapService } from 'src/app/core/components/area-aluno/services/plano-semanal-bootstrap.service';

@Component({
  selector: 'app-login-site',
  templateUrl: './login-site.component.html',
  styleUrls: ['./login-site.component.css'],
  encapsulation: ViewEncapsulation.Emulated
})
export class LoginSiteComponent implements OnInit {
  message: string | null = null;
  email = '';
  password = '';
  showPassword = false;
  errorMessage = '';
  successMessage = '';
  mensagem: string = '';
  private mensagemAtivacaoDetectada = false;

  constructor(
    private authService: AuthService,
    private planoSemanalBootstrapService: PlanoSemanalBootstrapService,
    private router: Router,
    private route: ActivatedRoute,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {

    // ✅ Trata parâmetros vindos do backend após ativação
    this.route.queryParams.subscribe(params => {

      // Compatibilidade com seu formato antigo: ?ativado=true
      if (params['ativado'] === 'true') {
        this.mensagem = '✅ Conta ativada com sucesso! Faça login.';
        this.mensagemAtivacaoDetectada = true;
        this.notificationService.clearMessage();
        this.limparQueryParamsAtivacao();
        return;
      }

      // Novo formato: ?ativacao=ok|ja|invalido
      const ativacao = params['ativacao'];

      if (ativacao === 'ok') {
        this.mensagem = '✅ Conta ativada com sucesso! Faça login.';
        this.mensagemAtivacaoDetectada = true;
        this.notificationService.clearMessage();
        this.limparQueryParamsAtivacao();
      } else if (ativacao === 'ja') {
        this.mensagem = 'ℹ️ Sua conta já estava ativada. Faça login.';
        this.mensagemAtivacaoDetectada = true;
        this.notificationService.clearMessage();
        this.limparQueryParamsAtivacao();
      } else if (ativacao === 'invalido') {
        this.mensagem = '⚠️ Link de ativação inválido ou expirado. Tente fazer login ou solicite um novo cadastro.';
        this.mensagemAtivacaoDetectada = true;
        this.notificationService.clearMessage();
        this.limparQueryParamsAtivacao();
      }
    });

    // ✅ Mensagem salva no localStorage
    const savedMessage = localStorage.getItem('notificationMessage');
    if (!this.mensagemAtivacaoDetectada && savedMessage) {
      this.mensagem = savedMessage;

      setTimeout(() => {
        localStorage.removeItem('notificationMessage');
      }, 15000);
    }
  }

  // ✅ Remove query params da URL pra não repetir mensagem ao dar F5
  private limparQueryParamsAtivacao(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ativacao: null, ativado: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  login() {
    console.log('🔍 Botão de login foi clicado!');

    this.errorMessage = '';

    this.authService.login({ email: this.email, senha: this.password }).subscribe({
      next: (resp) => {
        console.log('✅ Login bem-sucedido!', resp);

        if (!resp.assinaturaValida) {
          this.mensagem =
            'Sua assinatura está expirada. Atualize seu plano para continuar usando o Revizo.';

          this.router.navigate(['/area-restrita/meu-cadastro'], {
            queryParams: { expirado: true },
          });

          return;
        }

        this.planoSemanalBootstrapService.preencherSeNecessarioNoLogin().subscribe({
          next: () => {
            this.router.navigate(['/area-restrita/hoje']).then(() => {
              console.log('➡️ Redirecionado para hoje');
            });
          },
          error: () => {
            this.router.navigate(['/area-restrita/hoje']).then(() => {
              console.log('➡️ Redirecionado para hoje');
            });
          }
        });
      },

      error: (error: HttpErrorResponse) => {
        if (error) {
          if (typeof error.error === 'object' && error.error.message) {
            this.errorMessage = error.error.message;
          } else if (typeof error.error === 'string') {
            try {
              const parsedError = JSON.parse(error.error);
              if (parsedError.message) {
                this.errorMessage = parsedError.message;
              } else {
                this.errorMessage = error.error;
              }
            } catch {
              this.errorMessage = error.error;
            }
          } else {
            this.errorMessage = 'Erro inesperado. Tente novamente.';
          }
        } else {
          this.errorMessage = 'Erro inesperado. Tente novamente.';
        }

        console.warn('⚠️ Mensagem final tratada:', this.errorMessage);
      },
    });
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }
}
