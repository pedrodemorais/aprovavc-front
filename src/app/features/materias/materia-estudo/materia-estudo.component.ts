import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MateriaEstudo } from 'src/app/core/models/materia-estudo.model';
import { MateriaEstudoService } from 'src/app/core/services/materia-estudo.service';

@Component({
  selector: 'app-materia-estudo',
  templateUrl: './materia-estudo.component.html',
  styleUrls: ['./materia-estudo.component.css']
})
export class MateriaEstudoComponent implements OnInit {

  form!: FormGroup;
  materias: MateriaEstudo[] = [];

  carregandoLista = false;
  salvando = false;

  filtroNome = '';

  // para edição
  editandoId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private service: MateriaEstudoService
  ) {}

  ngOnInit(): void {
    this.criarForm();
    this.carregarMaterias();
  }

  criarForm(): void {
    this.form = this.fb.group({
      nome: ['', [Validators.required, Validators.maxLength(100)]],
      descricao: ['', [Validators.maxLength(255)]],
      ativo: [true]
    });
  }

  carregarMaterias(): void {
    this.carregandoLista = true;
    this.service.listar(this.filtroNome).subscribe({
      next: (lista) => {
        this.materias = lista;
        this.carregandoLista = false;
      },
      error: () => {
        this.carregandoLista = false;
      }
    });
  }

  aplicarFiltro(): void {
    this.carregarMaterias();
  }

  limparFiltro(): void {
    this.filtroNome = '';
    this.carregarMaterias();
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const dto: MateriaEstudo = {
      nome: this.form.value.nome,
      descricao: this.form.value.descricao,
      ativo: this.form.value.ativo
    };

    this.salvando = true;

    if (this.editandoId) {
      // edição
      this.service.atualizar(this.editandoId, dto).subscribe({
        next: () => {
          this.salvando = false;
          this.cancelarEdicao();
          this.carregarMaterias();
        },
        error: () => {
          this.salvando = false;
        }
      });
    } else {
      // novo cadastro
      this.service.criar(dto).subscribe({
        next: () => {
          this.salvando = false;
          this.form.reset({ ativo: true });
          this.carregarMaterias();
        },
        error: () => {
          this.salvando = false;
        }
      });
    }
  }

  editar(materia: MateriaEstudo): void {
    this.editandoId = materia.id ?? null;
    this.form.patchValue({
      nome: materia.nome,
      descricao: materia.descricao ?? '',
      ativo: materia.ativo ?? true
    });
  }

  cancelarEdicao(): void {
    this.editandoId = null;
    this.form.reset({ ativo: true });
  }

  excluir(materia: MateriaEstudo): void {
    if (!materia.id) {
      return;
    }

    if (!confirm(`Deseja realmente excluir a matéria "${materia.nome}"?`)) {
      return;
    }

    this.service.excluir(materia.id).subscribe({
      next: () => {
        // se estava editando essa, limpa o form
        if (this.editandoId === materia.id) {
          this.cancelarEdicao();
        }
        this.carregarMaterias();
      },
      error: () => {}
    });
  }

  campoInvalido(campo: string): boolean {
    const control = this.form.get(campo);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
