import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { TopicoRevisaoService } from 'src/app/core/services/topico-revisao.service';
import { TopicoRevisao } from 'src/app/core/models/topico-revisao.model';

import { MateriaEstudo } from 'src/app/core/models/materia-estudo.model';
import { MateriaEstudoService } from 'src/app/core/services/materia-estudo.service';

import { ProvaEstudo } from 'src/app/core/models/prova-estudo.model';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';

import { TopicoEdital } from 'src/app/core/models/topico-edital.model';
import { TopicoEditalService } from 'src/app/core/services/topico-edital.service';

@Component({
  selector: 'app-topico-revisao',
  templateUrl: './topico-revisao.component.html',
  styleUrls: ['./topico-revisao.component.css']
})
export class TopicoRevisaoComponent implements OnInit {

  form!: FormGroup;

  empresaId = 1; // depois pega do JWT

  materias: MateriaEstudo[] = [];
  provas: ProvaEstudo[] = [];
  provaSelecionadaId: number | null = null;

  topicosHoje: TopicoRevisao[] = [];
  todosTopicos: TopicoRevisao[] = [];

  // tópicos do edital da prova+matéria selecionadas
  topicosEdital: TopicoEdital[] = [];
  carregandoTopicosEdital = false;

  carregandoHoje = false;
  carregandoTodos = false;
  salvando = false;

  filtroGeral = '';

  constructor(
    private fb: FormBuilder,
    private service: TopicoRevisaoService,
    private materiaService: MateriaEstudoService,
    private provaService: ProvaEstudoService,
    private topicoEditalService: TopicoEditalService
  ) {}

  ngOnInit(): void {
    this.criarForm();
    this.carregarProvas();
  }

  // --------------------------------------------------
  // FORM
  // --------------------------------------------------
  criarForm(): void {
    this.form = this.fb.group({
      materiaId: [null, [Validators.required]],
      topicoEditalId: [null], // opcional
      assunto: ['', [Validators.required, Validators.maxLength(500)]]
    });
  }

  // --------------------------------------------------
  // PROVAS
  // --------------------------------------------------
  carregarProvas(): void {
    this.provaService.listar('').subscribe({
      next: (lista) => {
        this.provas = lista || [];

        if (this.provas.length === 1) {
          this.provaSelecionadaId = this.provas[0].id ?? null;
        }

        this.carregarMaterias();
        this.carregarTopicosHoje();
        this.carregarTodos();
      },
      error: () => {
        this.provas = [];
        this.carregarMaterias();
        this.carregarTopicosHoje();
        this.carregarTodos();
      }
    });
  }

  alterarProva(): void {
    this.carregarTopicosHoje();
    this.carregarTodos();

    this.form.patchValue({
      materiaId: null,
      topicoEditalId: null
    });
    this.topicosEdital = [];

    this.carregarMaterias();
  }

  // --------------------------------------------------
  // MATÉRIAS
  // --------------------------------------------------
  carregarMaterias(): void {
    this.materiaService.listar().subscribe({
      next: (lista) => {
        let materias = lista || [];

        if (this.provaSelecionadaId) {
          const provaAtual = this.provas.find(p => p.id === this.provaSelecionadaId);
          if (provaAtual && provaAtual.materiasIds && provaAtual.materiasIds.length > 0) {
            const idsSet = new Set(provaAtual.materiasIds);
            materias = materias.filter(m => m.id != null && idsSet.has(m.id));
          }
        }

        this.materias = materias;
      },
      error: () => {
        this.materias = [];
      }
    });
  }

  onMateriaChange(): void {
    const materiaId = this.form.value.materiaId as number | null;

    this.form.patchValue({ topicoEditalId: null });
    this.topicosEdital = [];

    if (materiaId && this.provaSelecionadaId) {
      this.carregarTopicosEdital(materiaId);
    }
  }

  // --------------------------------------------------
  // TÓPICOS DO EDITAL
  // --------------------------------------------------
  private carregarTopicosEdital(materiaId: number): void {
    if (!this.provaSelecionadaId) {
      return;
    }

    this.carregandoTopicosEdital = true;

    this.topicoEditalService
      .listarPorProvaEMateria(this.provaSelecionadaId!, materiaId)
      .subscribe({
        next: (lista) => {
          this.topicosEdital = lista || [];
          this.carregandoTopicosEdital = false;
        },
        error: (err) => {
          console.error('Erro ao carregar tópicos do edital', err);
          this.carregandoTopicosEdital = false;
          this.topicosEdital = [];
        }
      });
  }

  // --------------------------------------------------
  // TÓPICOS DE REVISÃO
  // --------------------------------------------------
  carregarTopicosHoje(): void {
    this.carregandoHoje = true;
    this.service.listarHoje().subscribe({
      next: (lista) => {
        this.topicosHoje = this.filtrarListaPorProva(lista || []);
        this.carregandoHoje = false;
      },
      error: () => {
        this.carregandoHoje = false;
        this.topicosHoje = [];
      }
    });
  }

  carregarTodos(): void {
    this.carregandoTodos = true;
    this.service.listar(this.filtroGeral).subscribe({
      next: (lista) => {
        this.todosTopicos = this.filtrarListaPorProva(lista || []);
        this.carregandoTodos = false;
      },
      error: () => {
        this.carregandoTodos = false;
        this.todosTopicos = [];
      }
    });
  }

  private filtrarListaPorProva(lista: TopicoRevisao[]): TopicoRevisao[] {
    if (!this.provaSelecionadaId) {
      return lista;
    }
    return lista.filter(t => t.provaId === this.provaSelecionadaId);
  }

  aplicarFiltro(): void {
    this.carregarTodos();
  }

  limparFiltro(): void {
    this.filtroGeral = '';
    this.carregarTodos();
  }

  // --------------------------------------------------
  // STATUS / ESTILO
  // --------------------------------------------------
  private hojeISO(): string {
    return new Date().toISOString().substring(0, 10);
  }

  getStatus(topico: TopicoRevisao): 'ATRASADO' | 'HOJE' | 'FUTURO' {
    if (!topico.dataProximaRevisao) {
      return 'FUTURO';
    }

    const hoje = this.hojeISO();
    const data = topico.dataProximaRevisao;

    if (data < hoje) {
      return 'ATRASADO';
    }
    if (data === hoje) {
      return 'HOJE';
    }
    return 'FUTURO';
  }

  getClasseLinha(topico: TopicoRevisao): string {
    const status = this.getStatus(topico);

    if (status === 'ATRASADO') {
      return 'linha-atrasada';
    }
    if (status === 'HOJE') {
      return 'linha-hoje';
    }
    return 'linha-futuro';
  }

  getEmojiStatus(topico: TopicoRevisao): string {
    const status = this.getStatus(topico);

    if (status === 'ATRASADO') {
      return '🔴 ATRASADO';
    }
    if (status === 'HOJE') {
      return '🟠 HOJE';
    }
    return '🟢 EM DIA';
  }

  // --------------------------------------------------
  // CRUD TÓPICO
  // --------------------------------------------------
  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.provaSelecionadaId && this.provas.length > 1) {
      alert('Selecione uma prova antes de cadastrar o tópico.');
      return;
    }

    const formValue = this.form.value;

    const dto: TopicoRevisao = {
      provaId: this.provaSelecionadaId || undefined,
      materiaId: formValue.materiaId,
      assunto: formValue.assunto,
      topicoEditalId: formValue.topicoEditalId || undefined
    };

    this.salvando = true;
    this.service.criar(dto).subscribe({
      next: () => {
        this.salvando = false;
        this.form.reset({
          materiaId: null,
          topicoEditalId: null,
          assunto: ''
        });
        this.topicosEdital = [];
        this.carregarTopicosHoje();
        this.carregarTodos();
      },
      error: () => {
        this.salvando = false;
      }
    });
  }

  marcarRevisado(topico: TopicoRevisao): void {
    if (!topico.id) {
      return;
    }

    this.service.revisar(topico.id).subscribe({
      next: () => {
        this.carregarTopicosHoje();
        this.carregarTodos();
      },
      error: () => {}
    });
  }

  excluir(topico: TopicoRevisao): void {
    if (!topico.id) {
      return;
    }

    if (!confirm('Deseja realmente excluir este tópico? Você vai perder todo o controle de revisões associado a ele.')) {
      return;
    }

    this.service.excluir(topico.id).subscribe({
      next: () => {
        this.carregarTopicosHoje();
        this.carregarTodos();
      },
      error: () => {}
    });
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------
  campoInvalido(campo: string): boolean {
    const control = this.form.get(campo);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
