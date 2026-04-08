import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AlunoParametroDTO } from 'src/app/core/dto/aluno-parametro.dto';
import { AlunoParametroService } from 'src/app/core/services/aluno-parametro.service';

@Component({
  selector: 'app-configuracoes',
  templateUrl: './configuracoes.component.view.html',
  styleUrls: ['./configuracoes.component.scss']
})
export class ConfiguracoesComponent implements OnInit {
  private readonly CHAVE_LIMITE_DIARIO_REVISOES = 'LIMITE_DIARIO_REVISOES';
  private readonly FALLBACK_LIMITE = 40;

  loading = false;
  salvando = false;
  mensagemSucesso = '';
  erroCarregamento = '';

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private alunoParametroService: AlunoParametroService
  ) {
    this.form = this.fb.group({
      limiteDiarioRevisoes: [
        this.FALLBACK_LIMITE,
        [Validators.required, Validators.pattern(/^\d+$/), Validators.min(5), Validators.max(200)]
      ]
    });
  }

  ngOnInit(): void {
    this.carregarParametros();
  }

  get limiteControl() {
    return this.form.get('limiteDiarioRevisoes');
  }

  get limiteInvalido(): boolean {
    const control = this.limiteControl;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  carregarParametros(): void {
    this.loading = true;
    this.erroCarregamento = '';
    this.mensagemSucesso = '';

    this.alunoParametroService
      .listarParametros()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (parametros) => {
          const valorAtual = this.extrairValorLimite(parametros);
          this.form.patchValue({ limiteDiarioRevisoes: valorAtual }, { emitEvent: false });
        },
        error: () => {
          this.erroCarregamento = 'Nao foi possivel carregar suas configuracoes.';
          this.form.patchValue({ limiteDiarioRevisoes: this.FALLBACK_LIMITE }, { emitEvent: false });
        }
      });
  }

  salvar(): void {
    this.mensagemSucesso = '';
    this.erroCarregamento = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const valor = String(this.limiteControl?.value ?? '').trim();
    this.salvando = true;

    this.alunoParametroService
      .atualizarParametro(this.CHAVE_LIMITE_DIARIO_REVISOES, valor)
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: () => {
          this.mensagemSucesso = 'Salvo com sucesso.';
        },
        error: () => {
          this.erroCarregamento = 'Nao foi possivel salvar. Tente novamente.';
        }
      });
  }

  getErroLimite(): string {
    const control = this.limiteControl;
    if (!control || !control.errors) return '';
    if (control.errors['required']) return 'Informe o limite diario de revisoes.';
    if (control.errors['pattern']) return 'Digite um numero inteiro valido.';
    if (control.errors['min']) return 'O limite minimo e 5.';
    if (control.errors['max']) return 'O limite maximo e 200.';
    return 'Valor invalido.';
  }

  private extrairValorLimite(parametros: AlunoParametroDTO[]): number {
    const parametro = (parametros || []).find((p) => p?.chave === this.CHAVE_LIMITE_DIARIO_REVISOES);
    const valor = Number(parametro?.valor);
    return Number.isInteger(valor) ? valor : this.FALLBACK_LIMITE;
  }
}

