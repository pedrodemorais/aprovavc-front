import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-redefinir-senha-site',
  templateUrl: './redefinir-senha-site.component.html',
  styleUrls: ['./redefinir-senha-site.component.css']
})
export class RedefinirSenhaSiteComponent implements OnInit {
  redefinirSenhaForm!: FormGroup;
  mensagem: string = '';
  erro: string = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.redefinirSenhaForm = this.fb.group({
      senhaAtual: ['', Validators.required],
      novaSenha: ['', [Validators.required, Validators.minLength(6)]],
      confirmarSenha: ['', Validators.required]
    }, { validator: this.senhasIguais });
  }

  // Validador personalizado para comparar as senhas
  senhasIguais(form: FormGroup) {
    const novaSenha = form.get('novaSenha')?.value;
    const confirmarSenha = form.get('confirmarSenha')?.value;
    return novaSenha === confirmarSenha ? null : { senhasDiferentes: true };
  }

  redefinirSenha() {
    console.log("🔹 Método redefinirSenha() foi chamado!");
    if (this.redefinirSenhaForm.invalid) return;

    const { senhaAtual, novaSenha } = this.redefinirSenhaForm.value;

    this.authService.alterarSenha(senhaAtual, novaSenha).subscribe({
      next: () => {
        this.mensagem = '✅ Senha alterada com sucesso!';
        this.erro = '';
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: err => {
        this.erro = '❌ Erro ao alterar senha. ' + err.error?.erro || 'Tente novamente.';
        this.mensagem = '';
      }
    });
  }
}
