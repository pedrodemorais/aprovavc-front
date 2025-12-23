import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SuporteService } from 'src/app/core/components/area-aluno/services/suporte.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-suporte',
  templateUrl: './suporte.component.html',
  styleUrls: ['./suporte.component.css']
})
export class SuporteComponent {
  suporteForm: FormGroup;
  mensagem?: string;
  erro?: string;
  enviando = false;
  mostrarFormulario = false;
  emailRemetente = '';

  constructor(
    private fb: FormBuilder,
    private suporteService: SuporteService,
    private authService: AuthService
  ) {
    const user = this.authService.getUser();
    this.emailRemetente = user?.sub || '';

    this.suporteForm = this.fb.group({
      assunto: ['', [Validators.required, Validators.minLength(4)]],
      mensagem: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  abrirFormularioEmail(): void {
    this.mostrarFormulario = true;
  }

  enviarEmail(): void {
    if (this.suporteForm.invalid) {
      this.suporteForm.markAllAsTouched();
      return;
    }

    this.enviando = true;
    this.mensagem = undefined;
    this.erro = undefined;

    const mensagemOriginal = this.suporteForm.value.mensagem || '';
    const mensagemComRemetente = `Remetente: ${this.emailRemetente}\n\n${mensagemOriginal}`;

    const payload = {
      emailRemetente: this.emailRemetente,
      assunto: this.suporteForm.value.assunto,
      mensagem: mensagemComRemetente
    };

    this.suporteService.enviarEmail(payload).subscribe({
      next: () => {
        this.enviando = false;
        this.mensagem = 'Mensagem enviada com sucesso.';
        this.suporteForm.reset();
      },
      error: (err: any) => {
        console.error('[SUPORTE] Erro ao enviar email:', err);
        this.enviando = false;
        this.erro = 'Nao foi possivel enviar sua mensagem. Tente novamente.';
      }
    });
  }
}
