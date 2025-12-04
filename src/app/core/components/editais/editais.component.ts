import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EditalService, EditalFormPayload } from 'src/app/core/services/edital.service';
import { Edital } from '../../models/Edital';
import { Materia } from 'src/app/core/models/materia.model';
import { MateriaService } from 'src/app/core/services/materia.service';

@Component({
  selector: 'app-editais',
  templateUrl: './editais.component.html',
  styleUrls: ['./editais.component.css']
})
export class EditaisComponent implements OnInit {

  carregando = false;
  salvando = false;
  erro?: string;
  mensagemSucesso?: string;

  editais: Edital[] = [];
  materias: Materia[] = [];

  form!: FormGroup;
  editalEmEdicao?: Edital | null;

  // ====== ESTADO DE UI (COLAPSE) ======
  // quais editais estão abertos
  private editaisAbertos = new Set<number>();

  // quais matérias (por edital) estão abertas: chave "editalId-materiaId"
  private materiasAbertas = new Set<string>();

  // tópicos carregados por matéria
  topicosPorMateria: { [materiaId: number]: any[] } = {};

  // loading / erro por matéria
  carregandoTopicos: { [materiaId: number]: boolean } = {};
  erroTopicos: { [materiaId: number]: string | undefined } = {};

  constructor(
    private editalService: EditalService,
    private materiaService: MateriaService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
    this.carregarEditais();
  }

  private montarForm(): void {
    this.form = this.fb.group({
      id: [null],
      nome: ['', [Validators.required, Validators.maxLength(150)]],
      descricao: [''],
      dataProva: [null],
      materiasIds: [[], [Validators.required]]
    });
  }

  // ============= LOADS =============

  private carregarMaterias(): void {
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar matérias:', err);
        this.erro = 'Erro ao carregar suas matérias.';
      }
    });
  }

  private carregarEditais(): void {
    this.carregando = true;
    this.erro = undefined;

    this.editalService.listar().subscribe({
      next: (lista) => {
        this.editais = lista || [];
        this.carregando = false;
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar editais:', err);
        this.erro = 'Erro ao carregar seus editais.';
        this.carregando = false;
      }
    });
  }

  // ============= FORM HELPERS =============

  get tituloFormulario(): string {
    return this.form.get('id')?.value ? 'Editar edital' : 'Novo edital';
  }

  novoEdital(): void {
    this.form.reset({
      id: null,
      nome: '',
      descricao: '',
      dataProva: null,
      materiasIds: []
    });
    this.editalEmEdicao = null;
    this.mensagemSucesso = undefined;
    this.erro = undefined;
  }

  editar(edital: Edital): void {
    this.editalEmEdicao = edital;

    const materiasIds = edital.materias?.map(m => m.materiaId) || [];

    this.form.patchValue({
      id: edital.id,
      nome: edital.nome,
      descricao: edital.descricao,
      dataProva: edital.dataProva,
      materiasIds
    });

    this.mensagemSucesso = undefined;
    this.erro = undefined;
  }

  excluir(edital: Edital): void {
    if (!edital.id) {
      return;
    }

    const confirmou = window.confirm(`Excluir o edital "${edital.nome}"?`);
    if (!confirmou) {
      return;
    }

    this.editalService.excluir(edital.id).subscribe({
      next: () => {
        this.mensagemSucesso = 'Edital excluído com sucesso.';
        this.carregarEditais();
        this.novoEdital();
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao excluir edital:', err);
        this.erro = 'Erro ao excluir edital. Tente novamente.';
      }
    });
  }

  // ============= SUBMIT =============

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.salvando = true;
    this.erro = undefined;
    this.mensagemSucesso = undefined;

    const raw = this.form.value;

    // select múltiplo devolve strings → garante number[]
    const materiasIds: number[] = (raw.materiasIds || []).map((v: any) => Number(v));

    const payload: EditalFormPayload = {
      nome: raw.nome,
      descricao: raw.descricao,
      dataProva: raw.dataProva,   // já vem 'yyyy-MM-dd'
      materiasIds
    };

    const id = raw.id as number | null;

    const obs = id
      ? this.editalService.atualizar(id, payload)
      : this.editalService.criar(payload);

    obs.subscribe({
      next: () => {
        this.salvando = false;
        this.mensagemSucesso = 'Edital salvo com sucesso.';
        this.carregarEditais();
        if (!id) {
          this.novoEdital();
        }
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao salvar edital:', err);
        this.salvando = false;
        this.erro = 'Erro ao salvar edital. Tente novamente.';
      }
    });
  }

  // ============= UI helpers =============

  campoInvalido(nome: string): boolean {
    const c = this.form.get(nome);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  formatData(iso?: string | null): string {
    if (!iso) {
      return '-';
    }

    const partes = iso.split('-');
    if (partes.length !== 3) {
      return iso;
    }

    const ano = partes[0];
    const mes = partes[1];
    const dia = partes[2];

    return `${dia}/${mes}/${ano}`;
  }

  // ============= COLAPSE: EDITAL =============

  isEditalAberto(id?: number | null): boolean {
    if (!id) {
      return false;
    }
    return this.editaisAbertos.has(id);
  }

  toggleEdital(id?: number | null): void {
    if (!id) {
      return;
    }

    if (this.editaisAbertos.has(id)) {
      this.editaisAbertos.delete(id);
    } else {
      this.editaisAbertos.add(id);
    }
  }

  // ============= COLAPSE: MATÉRIA + TOPICOS =============

  private keyMateria(editalId: number | undefined | null, materiaId: number): string {
    return `${editalId || 0}-${materiaId}`;
  }

  isMateriaAberta(editalId: number | undefined | null, materiaId: number): boolean {
    const key = this.keyMateria(editalId, materiaId);
    return this.materiasAbertas.has(key);
  }

  toggleMateria(editalId: number | undefined | null, materiaId: number): void {
    if (!materiaId) {
      return;
    }

    const key = this.keyMateria(editalId, materiaId);

    if (this.materiasAbertas.has(key)) {
      this.materiasAbertas.delete(key);
      return;
    }

    this.materiasAbertas.add(key);

    // se ainda não carregou os tópicos desta matéria, busca agora
    if (!this.topicosPorMateria[materiaId]) {
      this.carregarTopicosMateria(materiaId);
    }
  }

  private carregarTopicosMateria(materiaId: number): void {
    this.carregandoTopicos[materiaId] = true;
    this.erroTopicos[materiaId] = undefined;

    this.materiaService.listarTopicos(materiaId).subscribe({
      next: (lista) => {
        this.topicosPorMateria[materiaId] = lista || [];
        this.carregandoTopicos[materiaId] = false;
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar tópicos da matéria', materiaId, err);
        this.erroTopicos[materiaId] = 'Erro ao carregar tópicos desta matéria.';
        this.carregandoTopicos[materiaId] = false;
      }
    });
  }
}
