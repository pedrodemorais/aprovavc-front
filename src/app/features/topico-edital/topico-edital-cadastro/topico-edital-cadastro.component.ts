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

  @Input() empresaId!: number;
  @Input() provaId!: number;
  @Input() materiaId!: number;
  @Input() materiaNome?: string;
  @Input() provaNome?: string;

  form!: FormGroup;
  topicos: TopicoEdital[] = [];
  carregando = false;
  editando = false;

  constructor(
    private fb: FormBuilder,
    private topicoEditalService: TopicoEditalService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      id: [null],
      codigo: ['', [Validators.required, Validators.pattern(/^[0-9]+(\.[0-9]+)*$/)]],
      descricao: ['', [Validators.required, Validators.maxLength(400)]],
      ativo: [true]
    });

    if (this.empresaId && this.provaId && this.materiaId) {
      this.carregarTopicos();
    }
  }

  carregarTopicos(): void {
    this.carregando = true;
    this.topicoEditalService
      .listarPorProvaEMateria(this.empresaId, this.provaId, this.materiaId)
      .subscribe({
        next: (lista) => {
          this.topicos = lista;
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

  salvar(): void {
    console.log('CLICOU EM SALVAR', this.form.value, 'form inválido?', this.form.invalid);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.value;

    const payload: TopicoEdital = {
      id: formValue.id,
      codigo: formValue.codigo,
      descricao: formValue.descricao,
      ativo: formValue.ativo,
      empresaId: this.empresaId,
      provaId: this.provaId,
      materiaId: this.materiaId
      // ordem NÃO é enviada, é calculada no backend
    };

    if (this.editando && payload.id) {
      this.topicoEditalService
        .atualizar(this.empresaId, payload.id, payload)
        .subscribe({
          next: () => {
            this.carregarTopicos();
            this.novo();
          },
          error: (err) => console.error('Erro ao atualizar tópico', err)
        });
    } else {
      this.topicoEditalService
        .criar(this.empresaId, payload)
        .subscribe({
          next: () => {
            this.carregarTopicos();
            this.novo();
          },
          error: (err) => console.error('Erro ao criar tópico', err)
        });
    }
  }

  excluir(topico: TopicoEdital): void {
    if (!topico.id) {
      return;
    }

    const confirma = confirm(`Deseja realmente excluir o tópico: "${topico.descricao}"?`);
    if (!confirma) {
      return;
    }

    this.topicoEditalService
      .excluir(this.empresaId, topico.id)
      .subscribe({
        next: () => this.carregarTopicos(),
        error: (err) => console.error('Erro ao excluir tópico', err)
      });
  }

getNivel(codigo: string | null | undefined): number {
  if (!codigo) {
    return 1;
  }
  return codigo.split('.').length;
}

getIndentacao(codigo: string | null | undefined): number {
  const nivel = this.getNivel(codigo);

  // antes devia estar algo como (nivel - 1) * 24
  // vamos deixar bem menor:
  const passo = 14; // teste com 10, 12, 14 pra ver o que você gosta mais
  return Math.max(0, (nivel - 1) * passo);
}



}
