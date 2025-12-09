import { Component,OnInit,ViewEncapsulation  } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from 'src/app/site/services/notification.service';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login-site',
  templateUrl: './login-site.component.html',
  styleUrls: ['./login-site.component.css'],
  encapsulation: ViewEncapsulation.Emulated // Garante que os estilos fiquem isolados
})
export class LoginSiteComponent implements OnInit  {
  message: string | null = null;
  email = '';
  password = '';
  errorMessage = '';
  successMessage = ''; // Para exibir mensagens de sucesso
  mensagem: string = '';

  constructor(private authService: AuthService, private router: Router,private route: ActivatedRoute,private notificationService: NotificationService) {
    
  }

  ngOnInit() {
    // Verifica se a URL contém o parâmetro "ativado=true"
    this.route.queryParams.subscribe(params => {
      if (params['ativado'] === 'true') {
        this.mensagem = '✅ Conta ativada com sucesso! Faça login.';
      }
    });

    const savedMessage = localStorage.getItem('notificationMessage');
    if (savedMessage) {
      
      this.mensagem = savedMessage;
  
      // 🔥 Remove a mensagem do localStorage para não exibir repetidamente
      setTimeout(() => {
        localStorage.removeItem('notificationMessage');
        
      }, 15000);
    }
    
  }
login() {
  console.log('🔍 Botão de login foi clicado!');

  this.errorMessage = '';

  this.authService.login({ email: this.email, senha: this.password }).subscribe({
    next: (resp) => {
      console.log('✅ Login bem-sucedido!', resp);

      // ❗ Se a assinatura NÃO é válida → manda pra tela de dados/assinatura
      if (!resp.assinaturaValida) {
        this.mensagem =
          'Sua assinatura está expirada. Atualize seu plano para continuar usando o AprovaVC.';

    this.router.navigate(['/area-restrita/meu-cadastro'], {
  queryParams: { expirado: true },
});

        return;
      }

      // ✅ Assinatura ok → segue pro dashboard
      this.router.navigate(['/area-restrita/dashboard']).then(() => {
        console.log('➡️ Redirecionado para o dashboard');
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


  
  

  
}




