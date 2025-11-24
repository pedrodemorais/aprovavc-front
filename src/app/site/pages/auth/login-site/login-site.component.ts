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
    console.log("🔍 Botão de login foi clicado!");
  
    this.authService.login({ email: this.email, senha: this.password }).subscribe({
      next: () => {
        console.log("✅ Login bem-sucedido!");
  
        // 🔥 Agora verificamos se o usuário está autenticado
        this.authService.isAuthenticated().subscribe(authenticated => {
          if (authenticated) {
           
            this.router.navigate(['/area-restrita/menu']).then(() => {
             
            });
          } else {
           
            this.errorMessage = 'Erro ao autenticar. Verifique suas credenciais.';
          }
        });
      },
      error: (error: HttpErrorResponse) => {
            
        if (error.error === 401) {
            console.warn("⚠️ Erro de autenticação - 401 UNAUTHORIZED");
        }
    
        if (error) {
            if (typeof error.error === 'object' && error.error.message) {
                console.log("✅ Mensagem encontrada dentro de error.error:", error.error.message);
                this.errorMessage = error.error.message;
            } 
            else if (typeof error.error === 'string') {
                try {
                    const parsedError = JSON.parse(error.error);
                    if (parsedError.message) {
                        console.log("✅ Mensagem encontrada no JSON convertido:", parsedError.message);
                        this.errorMessage = parsedError.message;
                    } else {
                        this.errorMessage = error.error;
                    }
                } catch (e) {
                    console.warn("⚠️ Erro ao fazer parse do JSON de erro!");
                    this.errorMessage = error.error;
                }
            } 
            else {
                console.warn("⚠️ Mensagem não encontrada, aplicando mensagem padrão!");
                this.errorMessage = "Erro inesperado. Tente novamente.";
            }
        } else {
            console.warn("⚠️ Nenhuma mensagem de erro encontrada no backend!");
            this.errorMessage = "Erro inesperado. Tente novamente.";
        }
    
        console.warn("⚠️ Mensagem final tratada:", this.errorMessage);
    }
    
    
      
      
    });
  }

  
  

  
}




