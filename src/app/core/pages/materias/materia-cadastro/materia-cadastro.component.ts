import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Materia } from 'src/app/core/models/materia.model';
import { Topico } from 'src/app/core/models/topico.model';
import { MateriaService } from 'src/app/core/services/materia.service';

@Component({
  selector: 'app-materia-cadastro',
  templateUrl: './materia-cadastro.component.html',
  styleUrls: ['./materia-cadastro.component.css']
})
export class MateriaCadastroComponent implements OnInit {

  materiaForm!: FormGroup;

  materias: Materia[] = [];
  materiaSelecionada?: Materia;

  topicos: Topico[] = [];
  novoTopicoDescricao: string = '';

  carregandoMaterias = false;
  carregandoTopicos = false;
  salvando = false;
  mensagemErro?: string;

  constructor(
    private fb: FormBuilder,
    private materiaService: MateriaService
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
  }

  private montarForm(): void {
    this.materiaForm = this.fb.group({
      id: [null],
      nome: ['', [Validators.required, Validators.maxLength(100)]]
    });
  }

  campoInvalido(campo: string): boolean {
    const control = this.materiaForm.get(campo);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // ---------- MATÉRIA ----------

  carregarMaterias(): void {
    this.carregandoMaterias = true;
    this.mensagemErro = undefined;

    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista;
        this.carregandoMaterias = false;
      },
      error: () => {
        this.mensagemErro = 'Erro ao carregar matérias.';
        this.carregandoMaterias = false;
      }
    });
  }

  novaMateria(): void {
    this.materiaForm.reset();
    this.materiaSelecionada = undefined;
    this.topicos = [];
  }

  editarMateria(m: Materia): void {
    this.materiaForm.patchValue(m);
    this.materiaSelecionada = m;
    this.carregarTopicos(m);
  }

  salvarMateria(): void {
    if (this.materiaForm.invalid) {
      this.materiaForm.markAllAsTouched();
      return;
    }

    this.salvando = true;
    const dto: Materia = this.materiaForm.value;

    this.materiaService.salvarMateria(dto).subscribe({
      next: (salva) => {
        this.salvando = false;
        this.mensagemErro = undefined;

        const idx = this.materias.findIndex(m => m.id === salva.id);
        if (idx >= 0) {
          this.materias[idx] = salva;
        } else {
          this.materias.push(salva);
        }

        this.materiaSelecionada = salva;
        this.carregarTopicos(salva);
      },
      error: () => {
        this.salvando = false;
        this.mensagemErro = 'Erro ao salvar matéria.';
      }
    });
  }

  excluirMateria(m: Materia): void {
    if (!m.id) { return; }
    const ok = confirm(`Excluir a matéria "${m.nome}"?`);
    if (!ok) { return; }

    this.materiaService.excluirMateria(m.id).subscribe({
      next: () => {
        this.materias = this.materias.filter(x => x.id !== m.id);
        if (this.materiaSelecionada?.id === m.id) {
          this.novaMateria();
        }
      },
      error: () => {
        this.mensagemErro = 'Não foi possível excluir a matéria.';
      }
    });
  }

  // ---------- TÓPICOS ----------

  private carregarTopicos(m: Materia): void {
    if (!m.id) { return; }

    this.carregandoTopicos = true;
    this.topicos = [];

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        this.topicos = lista || [];
        this.carregandoTopicos = false;
      },
      error: () => {
        this.carregandoTopicos = false;
        this.mensagemErro = 'Erro ao carregar tópicos da matéria.';
      }
    });
  }

  adicionarTopicoRaiz(): void {
    const descricao = this.novoTopicoDescricao?.trim();
    if (!descricao) { return; }

    this.topicos.push(this.criarTopico(descricao, 0));
    this.novoTopicoDescricao = '';
  }

  adicionarSubtopico(pai: Topico): void {
    const descricao = prompt('Descrição do subtópico:');
    if (!descricao || !descricao.trim()) { return; }

    if (!pai.filhos) {
      pai.filhos = [];
    }
    pai.filhos.push(this.criarTopico(descricao.trim(), pai.nivel + 1));
  }

  private criarTopico(descricao: string, nivel: number): Topico {
    return {
      descricao,
      nivel,
      ativo: true,
      filhos: []
    };
  }

  excluirTopico(topico: Topico, parentArray: Topico[]): void {
    const ok = confirm(`Excluir o tópico "${topico.descricao}" e todos os subtópicos?`);
    if (!ok) { return; }

    const idx = parentArray.indexOf(topico);
    if (idx >= 0) {
      parentArray.splice(idx, 1);
    }
  }

  salvarTopicos(): void {
    if (!this.materiaSelecionada?.id) {
      alert('Salve a matéria antes de salvar os tópicos.');
      return;
    }

    this.salvando = true;
    this.materiaService.salvarTopicos(this.materiaSelecionada.id, this.topicos).subscribe({
      next: () => {
        this.salvando = false;
        alert('Tópicos salvos com sucesso.');
      },
      error: () => {
        this.salvando = false;
        this.mensagemErro = 'Erro ao salvar os tópicos.';
      }
    });
  }
}
