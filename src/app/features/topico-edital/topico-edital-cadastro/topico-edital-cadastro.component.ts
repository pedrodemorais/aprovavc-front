import { HttpErrorResponse } from '@angular/common/http';
import { OnDestroy } from '@angular/core';
import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TopicoEditalService } from 'src/app/core/services/topico-edital.service';
import { TopicoEdital } from 'src/app/core/models/topico-edital.model';

@Component({
  selector: 'app-topico-edital-cadastro',
  templateUrl: './topico-edital-cadastro.component.html',
  styleUrls: ['./topico-edital-cadastro.component.css']
})
export class TopicoEditalCadastroComponent implements OnInit {


  @Input() provaId!: number;
  @Input() provaNome?: string;

  form!: FormGroup;
  topicos: TopicoEdital[] = [];
  carregando = false;
  editando = false;
  erroBackend?: string; 
   private erroTimeout: any; 
  constructor(
    private fb: FormBuilder,
    private topicoEditalService: TopicoEditalService
  ) {}

  ngOnInit(): void {
    if (this.erroTimeout) {
      clearTimeout(this.erroTimeout);
    }
    this.form = this.fb.group({
      id: [null],
      codigo: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]+)*$/)]],
      descricao: ['', [Validators.required, Validators.maxLength(400)]],
      ativo: [true]
    });

    if (this.provaId) {
      this.carregarTopicos();
    }
  }

 carregarTopicos(): void {
  this.carregando = true;
  this.topicoEditalService
    .listarPorProva(this.provaId)
    .subscribe({
      next: (lista) => {
        // 👇 ordena antes de exibir
        this.topicos = this.ordenarTopicosPorCodigo(lista);
        this.carregando = false;
      },
      error: (err) => {
        console.error('Erro ao carregar tópicos do edital', err);
        this.carregando = false;
      }
    });
}


  novo(): void {
    this.editando = false;
    this.form.reset({
      id: null,
      codigo: '',
      descricao: '',
      ativo: true
    });
  }

  editar(topico: TopicoEdital): void {
    this.editando = true;
    this.form.patchValue({
      id: topico.id,
      codigo: topico.codigo,
      descricao: topico.descricao,
      ativo: topico.ativo
    });
  }

  get codigo() {
    return this.form.get('codigo');
  }

  get descricao() {
    return this.form.get('descricao');
  }

  excluir(topico: TopicoEdital): void {
  if (!topico.id) {
    return;
  }

  const confirma = confirm(`Deseja realmente excluir o tópico: "${topico.codigo} - ${topico.descricao}"?`);

  if (!confirma) {
    return;
  }

  this.topicoEditalService
    .excluir(topico.id)
    .subscribe({
      next: () => {
        this.carregarTopicos();
      },
      error: (err) => console.error('Erro ao excluir tópico', err)
    });
}


 salvar(): void {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  const payload: TopicoEdital = {
    id: this.form.value.id,
    codigo: this.form.value.codigo,
    descricao: this.form.value.descricao,
    ativo: this.form.value.ativo,
    provaId: this.provaId,
    materiaId: null,
    nivel: this.form.value.codigo,
    nivelTopico: this.form.value.codigo
  };

  this.erroBackend = undefined; // limpa erro anterior

  if (this.editando && payload.id) {
    this.topicoEditalService
      .atualizar(payload.id, payload)
      .subscribe({
        next: () => {
          this.carregarTopicos();
          this.novo();
        },
        error: (err: HttpErrorResponse) => {
          console.error('Erro ao atualizar tópico', err);
          this.tratarErroBackend(err);
        }
      });
  } else {
    this.topicoEditalService
      .criar(payload)
      .subscribe({
        next: () => {
          this.carregarTopicos();
          this.novo();
        },
        error: (err: HttpErrorResponse) => {
          console.error('Erro ao criar tópico', err);
          this.tratarErroBackend(err);
        }
      });
  }
}
private tratarErroBackend(err: HttpErrorResponse): void {
  let msg = 'Não foi possível salvar o tópico do edital.';

  if (err.error) {
    if (err.error.mensagem) {
      msg = err.error.mensagem;
    } else if (err.error.message) {
      msg = err.error.message;
    } else if (typeof err.error === 'string') {
      msg = err.error;
    }
  } else {
    msg = 'Erro de comunicação com o servidor.';
  }

  this.erroBackend = msg;

  // limpa timeout anterior, se existir
  if (this.erroTimeout) {
    clearTimeout(this.erroTimeout);
  }

  // depois de 4 segundos, some com a mensagem
  this.erroTimeout = setTimeout(() => {
    this.erroBackend = undefined;
  }, 4000);
}



  // ====== helpers de nível/identação ======

  getNivel(codigo: string | null | undefined): number {
    if (!codigo) {
      return 1;
    }
    return codigo.split('.').length;
  }

  getIndentacao(codigo: string | null | undefined): number {
    const nivel = this.getNivel(codigo);
    const passo = 18; // px por nível
    return Math.max(0, (nivel - 1) * passo);
  }

  private compararCodigo(c1?: string | null, c2?: string | null): number {
  // trata nulos
  if (!c1 && !c2) { return 0; }
  if (!c1) { return 1; }
  if (!c2) { return -1; }

  const partes1 = c1.split('.').map(p => parseInt(p, 10));
  const partes2 = c2.split('.').map(p => parseInt(p, 10));

  const maxLen = Math.max(partes1.length, partes2.length);

  for (let i = 0; i < maxLen; i++) {
    const n1 = partes1[i] ?? 0;
    const n2 = partes2[i] ?? 0;

    if (n1 < n2) { return -1; }
    if (n1 > n2) { return 1; }
  }

  // se chegou aqui, são "iguais" numericamente
  return 0;
}

private ordenarTopicosPorCodigo(lista: TopicoEdital[]): TopicoEdital[] {
  // cria cópia pra não mutar o array original
  return [...lista].sort((a, b) => this.compararCodigo(a.codigo, b.codigo));
}

}
