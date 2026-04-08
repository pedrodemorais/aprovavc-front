import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  editalId: number | null = null;
  carregandoEdital = false;
  private editalCarregado = false;
  temMudancasNaoSalvas = false;
  private ignorarMudancasFormulario = false;
  private formChangesSub?: Subscription;
  private readonly rascunhoKey = 'cadastro-editais:rascunho';
  private permitirSaidaSemAviso = false;
  private rascunhoPendente: {
    editalId: number | null;
    nome: string;
    cargo: string;
    descricao: string;
    dataProva: string | null;
    materiasIds: number[];
  } | null = null;

  constructor(
    private editalService: EditalService,
    private materiaService: MateriaService,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarRascunhoLocal();
    this.route.paramMap.subscribe((params) => {
      const raw = params.get('id');
      const id = raw ? Number(raw) : null;
      const novoId = Number.isFinite(id) ? id : null;
      if (novoId !== this.editalId) {
        this.editalCarregado = false;
      }
      this.editalId = novoId;
      if (this.editalId) {
        this.carregarEdital();
      } else {
        this.editalCarregado = false;
        this.resetarFormulario();
        this.aplicarRascunhoSeDisponivel();
      }
    });
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
        if (this.editalId && !this.editalCarregado) {
          this.carregarEdital();
        }
        this.aplicarRascunhoSeDisponivel();
      },
      error: (err) => {
        console.error('[CADASTRO-EDITAIS] Erro ao carregar matérias:', err);
        this.erro = 'Erro ao carregar suas matérias.';
        this.carregandoMaterias = false;
      }
    });
  }

  private carregarEdital(): void {
    if (!this.editalId || this.carregandoEdital) {
      return;
    }
    this.carregandoEdital = true;
    this.editalService.buscarPorId(this.editalId).subscribe({
      next: (edital) => {
        const materiasIds = (edital?.materias || [])
          .map((m) => m?.materiaId)
          .filter((id): id is number => Number.isFinite(id as number));

        this.aplicarSemRastrearMudancas(() => {
          this.form.patchValue({
            nome: edital?.nome || '',
            cargo: edital?.cargo || '',
            descricao: edital?.descricao || '',
            dataProva: edital?.dataProva || null,
            materiasIds
          });
        });

        this.editalCarregado = true;
        this.temMudancasNaoSalvas = false;
        this.atualizarPickListMaterias();
        this.aplicarRascunhoSeDisponivel();
        this.carregandoEdital = false;
      },
      error: (err) => {
        console.error('[CADASTRO-EDITAIS] Erro ao carregar edital:', err);
        this.erro = 'Erro ao carregar o edital.';
        this.carregandoEdital = false;
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

    const obs = this.editalId
      ? this.editalService.atualizar(this.editalId, payload)
      : this.editalService.criar(payload);

    obs.subscribe({
      next: () => {
        this.salvando = false;
        this.mensagemSucesso = this.editalId ? 'Edital atualizado com sucesso.' : 'Edital salvo com sucesso.';
        this.iniciarTimeoutMensagem();
        this.limparRascunhoLocal();
        if (this.editalId) {
          this.temMudancasNaoSalvas = false;
        } else {
          this.resetarFormulario();
        }
      },
      error: (err) => {
        console.error('[CADASTRO-EDITAIS] Erro ao salvar edital:', err);
        this.salvando = false;
        this.erro = 'Erro ao salvar edital. Tente novamente.';
      }
    });
  }

  cancelar(): void {
    this.limparRascunhoLocal();
    this.router.navigate(['/area-restrita/editais']);
  }

  irParaCadastroMateria(): void {
    this.salvarRascunhoLocal();
    this.permitirSaidaSemAviso = true;
    this.router.navigate(['/area-restrita/cad-materias'], {
      queryParams: { voltarPara: 'cadastro-editais', editalId: this.editalId ?? null }
    });
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
    if (this.permitirSaidaSemAviso) {
      this.permitirSaidaSemAviso = false;
      return true;
    }
    if (!this.temMudancasNaoSalvas) {
      return true;
    }
    return window.confirm('Você possui alterações não salvas. Deseja sair sem salvar?');
  }

  private salvarRascunhoLocal(): void {
    const raw = this.form.getRawValue();
    const draft = {
      editalId: this.editalId ?? null,
      nome: raw.nome || '',
      cargo: raw.cargo || '',
      descricao: raw.descricao || '',
      dataProva: raw.dataProva || null,
      materiasIds: (raw.materiasIds || []).map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v))
    };
    localStorage.setItem(this.rascunhoKey, JSON.stringify(draft));
    this.rascunhoPendente = draft;
  }

  private carregarRascunhoLocal(): void {
    const raw = localStorage.getItem(this.rascunhoKey);
    if (!raw) {
      this.rascunhoPendente = null;
      return;
    }
    try {
      const draft = JSON.parse(raw);
      this.rascunhoPendente = {
        editalId: Number.isFinite(draft?.editalId) ? draft.editalId : null,
        nome: draft?.nome || '',
        cargo: draft?.cargo || '',
        descricao: draft?.descricao || '',
        dataProva: draft?.dataProva ?? null,
        materiasIds: Array.isArray(draft?.materiasIds) ? draft.materiasIds : []
      };
    } catch {
      this.rascunhoPendente = null;
    }
  }

  private aplicarRascunhoSeDisponivel(): void {
    if (!this.rascunhoPendente) {
      return;
    }
    const draft = this.rascunhoPendente;
    if (draft.editalId !== (this.editalId ?? null)) {
      return;
    }
    this.aplicarSemRastrearMudancas(() => {
      this.form.patchValue({
        nome: draft.nome,
        cargo: draft.cargo,
        descricao: draft.descricao,
        dataProva: draft.dataProva,
        materiasIds: draft.materiasIds
      });
    });
    this.temMudancasNaoSalvas = true;
    this.atualizarPickListMaterias();
    this.rascunhoPendente = null;
  }

  private limparRascunhoLocal(): void {
    localStorage.removeItem(this.rascunhoKey);
    this.rascunhoPendente = null;
  }
}
