import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { CanComponentDeactivate } from '../guards/estudo-em-andamento.guard';
import { EditalFormPayload, EditalService } from '../services/edital.service';
import { MateriaService } from '../services/materia.service';
import { Materia } from '../models/materia.model';

@Component({
  selector: 'app-cadastro-editais',
  templateUrl: './cadastro-editais.component.html',
  styleUrls: ['./cadastro-editais.component.css']
})
export class CadastroEditaisComponent implements OnInit, OnDestroy, CanComponentDeactivate {

  carregandoMaterias = false;
  salvando = false;
  erro?: string;
  mensagemSucesso?: string;
  private mensagemTimeout: any;

  form!: FormGroup;
  materias: Materia[] = [];
  materiasDisponiveis: Materia[] = [];
  materiasSelecionadas: Materia[] = [];
  temMudancasNaoSalvas = false;
  private ignorarMudancasFormulario = false;
  private formChangesSub?: Subscription;

  constructor(
    private editalService: EditalService,
    private materiaService: MateriaService,
    private fb: FormBuilder,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
  }

  ngOnDestroy(): void {
    this.formChangesSub?.unsubscribe();
    if (this.mensagemTimeout) {
      clearTimeout(this.mensagemTimeout);
    }
  }

  private montarForm(): void {
    this.form = this.fb.group({
      nome: ['', [Validators.required, Validators.maxLength(150)]],
      cargo: ['', [Validators.maxLength(150)]],
      descricao: [''],
      dataProva: [null],
      materiasIds: [[], [Validators.required]]
    });
    this.monitorarMudancasFormulario();
  }

  private monitorarMudancasFormulario(): void {
    this.formChangesSub?.unsubscribe();
    this.formChangesSub = this.form.valueChanges.subscribe(() => {
      if (this.ignorarMudancasFormulario) {
        return;
      }
      this.temMudancasNaoSalvas = true;
    });
  }

  private aplicarSemRastrearMudancas<T>(acao: () => T): T {
    this.ignorarMudancasFormulario = true;
    try {
      return acao();
    } finally {
      this.ignorarMudancasFormulario = false;
    }
  }

  private carregarMaterias(): void {
    this.carregandoMaterias = true;
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
        this.atualizarPickListMaterias();
        this.carregandoMaterias = false;
      },
      error: (err) => {
        console.error('[CADASTRO-EDITAIS] Erro ao carregar matérias:', err);
        this.erro = 'Erro ao carregar suas matérias.';
        this.carregandoMaterias = false;
      }
    });
  }

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.erro = 'Preencha os campos obrigatórios para salvar.';
      this.mensagemSucesso = undefined;
      this.iniciarTimeoutMensagem();
      return;
    }

    this.salvando = true;
    this.erro = undefined;
    this.mensagemSucesso = undefined;

    const raw = this.form.value;
    const materiasIds: number[] = (raw.materiasIds || []).map((v: any) => Number(v));

    const payload: EditalFormPayload = {
      nome: raw.nome,
      cargo: raw.cargo,
      descricao: raw.descricao,
      dataProva: raw.dataProva,
      materiasIds
    };

    this.editalService.criar(payload).subscribe({
      next: () => {
        this.salvando = false;
      this.mensagemSucesso = 'Edital salvo com sucesso.';
        this.iniciarTimeoutMensagem();
        this.resetarFormulario();
      },
      error: (err) => {
        console.error('[CADASTRO-EDITAIS] Erro ao salvar edital:', err);
        this.salvando = false;
        this.erro = 'Erro ao salvar edital. Tente novamente.';
      }
    });
  }

  cancelar(): void {
    this.router.navigate(['/area-restrita/editais']);
  }

  private resetarFormulario(): void {
    this.aplicarSemRastrearMudancas(() => {
      this.form.reset({
        nome: '',
        cargo: '',
        descricao: '',
        dataProva: null,
        materiasIds: []
      });
    });
    this.materiasSelecionadas = [];
    this.atualizarPickListMaterias();
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.temMudancasNaoSalvas = false;
  }

  campoInvalido(nome: string): boolean {
    const c = this.form.get(nome);
    return !!(c && c.invalid && (c.dirty || c.touched));
  }

  onPickListMateriasChange(): void {
    const ids = (this.materiasSelecionadas || []).map(m => m.id).filter((id): id is number => !!id);
    const control = this.form.get('materiasIds');
    if (!control) return;
    control.setValue(ids);
    control.markAsDirty();
    control.updateValueAndValidity();
  }

  private atualizarPickListMaterias(): void {
    const ids = (this.form?.get('materiasIds')?.value as number[] | null) ?? [];
    const idsSet = new Set(ids);

    this.materiasSelecionadas = [];
    ids.forEach((id) => {
      const materia = this.materias.find(m => m.id === id);
      if (materia) this.materiasSelecionadas.push(materia);
    });

    this.materiasDisponiveis = (this.materias || []).filter(m => !idsSet.has(m.id as number));
  }

  private iniciarTimeoutMensagem(): void {
    if (this.mensagemTimeout) {
      clearTimeout(this.mensagemTimeout);
    }

    this.mensagemTimeout = setTimeout(() => {
      this.mensagemSucesso = '';
      this.erro = '';
      this.mensagemTimeout = null;
    }, 4000);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.temMudancasNaoSalvas) {
      return;
    }
    event.preventDefault();
    event.returnValue = 'Você possui alterações não salvas.';
  }

  canDeactivate(): boolean {
    if (!this.temMudancasNaoSalvas) {
      return true;
    }
    return window.confirm('Você possui alterações não salvas. Deseja sair sem salvar?');
  }
}
