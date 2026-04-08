import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { catchError, tap } from 'rxjs/operators';  // ✅ Importar corretamente
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  errorMessage = '';
  successMessage = '';
  loading: boolean = false; // 🔹 Controle de carregamento

  constructor(private authService: AuthService, private router: Router) {}

  register() {
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'As senhas não coincidem';
      return;
    }

    const user = {
      nome: this.name,
      email: this.email,
      senha: this.password
    };
    this.loading = true; // Ativa o indicador de carregamento
    this.errorMessage = '';
    this.successMessage = '';

    // ✅ Chamando corretamente o método `register()` e tratando a resposta com subscribe()
    this.authService.register(user).subscribe({
      next: (response) => {
        this.successMessage = 'Cadastro realizado com sucesso! Verifique seu e-mail.';
        this.errorMessage = '';
        this.loading = false;
        setTimeout(() => {
          this.router.navigate(['/login']); // Redireciona para login após o sucesso
        }, 3000);
      },
      error: (error) => {
        this.errorMessage = error.error || 'Erro ao cadastrar. Tente novamente.';
        this.successMessage = '';
        this.loading = false;
      }
    });
  }
  
  
}
