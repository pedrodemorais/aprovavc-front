import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProvaEstudo } from 'src/app/core/models/prova-estudo.model';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';
import { MateriaEstudo } from 'src/app/core/models/materia-estudo.model';
import { MateriaEstudoService } from 'src/app/core/services/materia-estudo.service';

@Component({
  selector: 'app-prova-estudo',
  templateUrl: './prova-estudo.component.html',
  styleUrls: ['./prova-estudo.component.css']
})
export class ProvaEstudoComponent implements OnInit {

  form!: FormGroup;
  provas: ProvaEstudo[] = [];
  materias: MateriaEstudo[] = [];

  filtroNome = '';

  carregando = false;
  salvando = false;

  editandoId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private service: ProvaEstudoService,
    private materiaService: MateriaEstudoService
  ) {}

  ngOnInit(): void {
    this.criarForm();
    this.carregarMaterias();
    this.carregarProvas();
  }

  criarForm(): void {
    this.form = this.fb.group({
      nome: ['', [Validators.required, Validators.maxLength(150)]],
      descricao: ['', [Validators.maxLength(255)]],
      ativo: [true],
      materiasIds: [[] as number[]]   // lista de IDs das matérias selecionadas
    });
  }

  carregarMaterias(): void {
    this.materiaService.listar().subscribe({
      next: (lista) => {
        // somente matérias ativas
        this.materias = (lista || []).filter(m => m.ativo !== false);
      },
      error: () => {}
    });
  }

  carregarProvas(): void {
    this.carregando = true;
    this.service.listar(this.filtroNome).subscribe({
      next: (lista) => {
        this.provas = lista;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      }
    });
  }

  aplicarFiltro(): void {
    this.carregarProvas();
  }

  limparFiltro(): void {
    this.filtroNome = '';
    this.carregarProvas();
  }

  /** Marca/desmarca matéria na lista materiasIds do form */
 onMateriaToggle(id: number, event: Event): void {
  const checkbox = event.target as HTMLInputElement;
  const checked = checkbox.checked;

  const atuais: number[] = this.form.value.materiasIds
    ? [...this.form.value.materiasIds]
    : [];

  if (checked) {
    if (!atuais.includes(id)) {
      atuais.push(id);
    }
  } else {
    const idx = atuais.indexOf(id);
    if (idx >= 0) {
      atuais.splice(idx, 1);
    }
  }

  this.form.patchValue({ materiasIds: atuais });
}


  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const dto: ProvaEstudo = {
      nome: this.form.value.nome,
      descricao: this.form.value.descricao,
      ativo: this.form.value.ativo,
      materiasIds: this.form.value.materiasIds || []
    };

    this.salvando = true;

    if (this.editandoId) {
      this.service.atualizar(this.editandoId, dto).subscribe({
        next: () => {
          this.salvando = false;
          this.cancelarEdicao();
          this.carregarProvas();
        },
        error: () => { this.salvando = false; }
      });
    } else {
      this.service.criar(dto).subscribe({
        next: () => {
          this.salvando = false;
          this.form.reset({ ativo: true, materiasIds: [] });
          this.carregarProvas();
        },
        error: () => { this.salvando = false; }
      });
    }
  }

  editar(prova: ProvaEstudo): void {
    this.editandoId = prova.id ?? null;
    this.form.patchValue({
      nome: prova.nome,
      descricao: prova.descricao ?? '',
      ativo: prova.ativo ?? true,
      materiasIds: prova.materiasIds || []
    });
  }

  cancelarEdicao(): void {
    this.editandoId = null;
    this.form.reset({ ativo: true, materiasIds: [] });
  }

  alternarStatus(prova: ProvaEstudo): void {
    if (!prova.id) return;

    this.service.inativar(prova.id).subscribe({
      next: () => this.carregarProvas(),
      error: () => {}
    });
  }

  excluir(prova: ProvaEstudo): void {
    if (!prova.id) return;

    if (!confirm(`Deseja realmente excluir a prova "${prova.nome}"?`)) {
      return;
    }

    this.service.excluir(prova.id).subscribe({
      next: () => {
        if (this.editandoId === prova.id) {
          this.cancelarEdicao();
        }
        this.carregarProvas();
      },
      error: () => {}
    });
  }
nomesMaterias(prova: ProvaEstudo): string {
  if (!prova.materiasIds || prova.materiasIds.length === 0) {
    return '';
  }

  const nomes = this.materias
    .filter(m => m.id && prova.materiasIds!.includes(m.id))
    .map(m => m.nome);

  return nomes.join(', ');
}

  campoInvalido(campo: string): boolean {
    const control = this.form.get(campo);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
