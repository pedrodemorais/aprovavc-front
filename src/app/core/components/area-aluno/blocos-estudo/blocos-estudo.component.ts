import { Component, HostListener, OnInit, QueryList, ViewChildren } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Dropdown } from 'primeng/dropdown';

import { BlocosEstudoService } from '../services/blocos-estudo.service';
import { MateriaService } from '../services/materia.service';

import { BlocoEstudoDTO, BlocoEstudoItemDTO } from '../../dto/blocos-estudo.dto';
import { Materia } from '../models/materia.model';

type MateriaOption = { label: string; value: number };

type BlocoItemForm = FormGroup<{
  id: FormControl<number | null>;
  materiaEstudoId: FormControl<number>;
  materiaNome: FormControl<string | null>;
  ordem: FormControl<number>;
  peso: FormControl<number | null>;
}>;

type BlocoForm = FormGroup<{
  minutosDisponiveis: FormControl<number>;
  itens: FormArray<BlocoItemForm>;
}>;

@Component({
  selector: 'app-blocos-estudo',
  templateUrl: './blocos-estudo.component.html',
  styleUrls: ['./blocos-estudo.component.css'],
  providers: [MessageService]
})
export class BlocosEstudoComponent implements OnInit {
  blocos: BlocoEstudoDTO[] = [];
  abaAtiva = 0;

  form!: BlocoForm;

  materiasOptions: MateriaOption[] = [];
  materiasMap = new Map<number, string>();
  materiaSelecionadaId: number | null = null;
  dropdownMateriasAberto = false;
  @ViewChildren('materiaDropdown') materiaDropdowns!: QueryList<Dropdown>;

  salvando = false;
  carregandoBlocos = false;
  carregandoMaterias = false;

  constructor(
    private fb: FormBuilder,
    private blocosService: BlocosEstudoService,
    private materiaService: MateriaService,
    private message: MessageService
  ) {}

  ngOnInit(): void {
    // cria um form "vazio" para o template não quebrar antes do load
    this.form = this.fb.group({
      minutosDisponiveis: this.fb.control(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      itens: this.fb.array<BlocoItemForm>([])
    });

    this.carregarMaterias();
    this.carregarBlocos();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Node | null;
    for (const dropdown of this.materiaDropdowns?.toArray() || []) {
      if (!dropdown?.overlayVisible) continue;
      const container = dropdown.el?.nativeElement as HTMLElement | null;
      const panel = dropdown.panel as HTMLElement | null;
      if (target && (container?.contains(target) || panel?.contains(target))) {
        return;
      }
      dropdown.hide();
    }
  }

  get itensFormArray(): FormArray<BlocoItemForm> {
    return this.form.controls.itens;
  }

  carregarMaterias(): void {
    this.carregandoMaterias = true;

    this.materiaService.listarMaterias()
      .pipe(finalize(() => (this.carregandoMaterias = false)))
      .subscribe({
        next: (materias: Materia[]) => {
          const materiasComId = materias.filter(
            (m): m is Materia & { id: number } => m.id != null
          );

          this.materiasOptions = materiasComId
            .map(m => ({ label: m.nome, value: m.id }))
            .sort((a, b) => a.label.localeCompare(b.label));

          this.materiasMap = new Map(materiasComId.map(m => [m.id, m.nome]));
        },
        error: () => {
          this.message.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao carregar matérias.' });
        }
      });
  }

carregarBlocos(): void {
  this.carregandoBlocos = true;

  this.blocosService.listarBlocos()
    .pipe(finalize(() => (this.carregandoBlocos = false)))
    .subscribe({
      next: (blocos) => {
        const lista = (blocos || []).slice().sort((a, b) => a.numero - b.numero);

        // ✅ SE A API VEIO VAZIA: cria 7 blocos pra UI não ficar em branco
        if (lista.length === 0) {
          this.blocos = this.criarBlocosPadrao();
          this.abaAtiva = 0;
          this.montarForm(this.blocos[0]);

          this.message.add({
            severity: 'warn',
            summary: 'Atenção',
            detail: 'Nenhum bloco veio do backend. Exibindo 7 blocos padrão (salvar pode depender do backend já ter criado esses blocos).'
          });
          return;
        }

        this.blocos = lista;
        this.abaAtiva = Math.min(this.abaAtiva, this.blocos.length - 1);
        this.montarForm(this.blocos[this.abaAtiva]);
      },
      error: () => {
        // ✅ EM ERRO TAMBÉM cria fallback (pra não ficar tela vazia)
        this.blocos = this.criarBlocosPadrao();
        this.abaAtiva = 0;
        this.montarForm(this.blocos[0]);

        this.message.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao carregar blocos. Mostrando blocos padrão.' });
      }
    });
}

private criarBlocosPadrao(): BlocoEstudoDTO[] {
  return Array.from({ length: 7 }, (_, i) => ({
    id: 0,
    numero: i + 1,
    minutosDisponiveis: 0,
    ativo: true,
    itens: []
  } as BlocoEstudoDTO));
}

  montarForm(bloco: BlocoEstudoDTO): void {
    this.form = this.fb.group({
      minutosDisponiveis: this.fb.control(bloco.minutosDisponiveis ?? 0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)]
      }),
      itens: this.fb.array<BlocoItemForm>([])
    });

    const itensOrdenados = [...(bloco.itens || [])].sort((a, b) => a.ordem - b.ordem);
    itensOrdenados.forEach((item) => this.itensFormArray.push(this.criarItemForm(item)));

    this.recalcularOrdem();
    this.form.markAsPristine();
    this.materiaSelecionadaId = null;
  }

  criarItemForm(item: Partial<BlocoEstudoItemDTO> & { materiaEstudoId: number }): BlocoItemForm {
    return this.fb.group({
      id: this.fb.control<number | null>(item.id ?? null),
      materiaEstudoId: this.fb.control<number>(item.materiaEstudoId, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      materiaNome: this.fb.control<string | null>(item.materiaNome ?? null),
      ordem: this.fb.control<number>(item.ordem ?? 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)]
      }),
      peso: this.fb.control<number | null>(item.peso ?? null)
    });
  }

  trocarAba(index: number): void {
    this.abaAtiva = index;
    const bloco = this.blocos[this.abaAtiva];
    if (bloco) this.montarForm(bloco);
  }

  adicionarMateria(): void {
    if (this.materiaSelecionadaId == null) return;

    const jaExiste = this.itensFormArray.controls.some(ctrl =>
      ctrl.controls.materiaEstudoId.value === this.materiaSelecionadaId
    );

    if (jaExiste) {
      this.message.add({ severity: 'warn', summary: 'Atenção', detail: 'Essa matéria já está no bloco.' });
      return;
    }

    const ordemNova = this.itensFormArray.length + 1;

    this.itensFormArray.push(
      this.criarItemForm({
        materiaEstudoId: this.materiaSelecionadaId,
        materiaNome: this.nomeMateria(this.materiaSelecionadaId),
        ordem: ordemNova
      })
    );

    this.form.markAsDirty();
    this.materiaSelecionadaId = null;
  }

  fecharDropdownMaterias(index?: number): void {
    const lista = this.materiaDropdowns?.toArray() || [];
    if (index == null) {
      for (const dropdown of lista) {
        if (dropdown?.overlayVisible) dropdown.hide();
      }
      return;
    }
    const dropdown = lista[index];
    if (dropdown?.overlayVisible) dropdown.hide();
  }

  onDropdownMateriasShow(): void {
    this.dropdownMateriasAberto = true;
  }

  onDropdownMateriasHide(): void {
    this.dropdownMateriasAberto = false;
  }

  removerItem(index: number): void {
    this.itensFormArray.removeAt(index);
    this.recalcularOrdem();
    this.form.markAsDirty();
  }

  // ✅ move no FormArray (correto) usando dragIndex/dropIndex
  onRowReorder(event: any): void {
    const dragIndex = event?.dragIndex;
    const dropIndex = event?.dropIndex;

    if (dragIndex == null || dropIndex == null || dragIndex === dropIndex) {
      this.recalcularOrdem();
      return;
    }

    const ctrl = this.itensFormArray.at(dragIndex);
    this.itensFormArray.removeAt(dragIndex);
    this.itensFormArray.insert(dropIndex, ctrl);

    this.recalcularOrdem();
    this.form.markAsDirty();
  }

  recalcularOrdem(): void {
    this.itensFormArray.controls.forEach((ctrl, idx) => {
      ctrl.controls.ordem.setValue(idx + 1);
    });
  }

  salvar(): void {
    const blocoNumero = this.blocos[this.abaAtiva]?.numero ?? (this.abaAtiva + 1);

    const minutosDisponiveis = this.form.controls.minutosDisponiveis.value ?? 0;

    const itensPayload = this.itensFormArray.controls.map((ctrl, idx) => ({
      id: ctrl.controls.id.value ?? undefined,
      materiaEstudoId: ctrl.controls.materiaEstudoId.value,
      ordem: idx + 1,
      peso: ctrl.controls.peso.value ?? undefined
    }));

    const payload = { minutosDisponiveis, itens: itensPayload };

    this.salvando = true;

    this.blocosService.atualizarBloco(blocoNumero, payload)
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: (blocoAtualizado) => {
          const idx = this.blocos.findIndex(b => b.numero === blocoNumero);
          if (idx >= 0) this.blocos[idx] = blocoAtualizado;

          this.montarForm(blocoAtualizado);
          this.message.add({ severity: 'success', summary: 'OK', detail: `Bloco ${blocoNumero} salvo.` });
        },
        error: (err) => {
          this.message.add({
            severity: 'error',
            summary: 'Erro',
            detail: err?.error?.message || 'Falha ao salvar.'
          });
        }
      });
  }

  nomeMateria(id: number): string {
    return this.materiasMap.get(id) || `Matéria #${id}`;
  }

  minutosParaTexto(minutos?: number | null): string {
    const m = Math.max(0, minutos ?? 0);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r} min`;
    if (r === 0) return `${h}h`;
    return `${h}h ${r}min`;
  }
}
