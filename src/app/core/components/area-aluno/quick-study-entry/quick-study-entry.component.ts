import { AfterViewInit, Component, HostListener, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { EditalService } from '../services/edital.service';
import { Materia } from '../models/materia.model';
import { MateriaService } from '../services/materia.service';
import { QuickStudyService } from '../services/quick-study.service';

interface MateriaOption extends Materia {
  isRecent?: boolean;
}

interface TopicoOption {
  id: number;
  descricao: string;
  nivel: number;
}

@Component({
  selector: 'app-quick-study-entry',
  templateUrl: './quick-study-entry.component.html',
  styleUrls: ['./quick-study-entry.component.css']
})
export class QuickStudyEntryComponent implements OnInit, AfterViewInit {
  topicoOpen = false;

  readonly quickTimes = [15, 30, 60];
  readonly form = this.fb.group({
    materiaId: [null as number | null, [Validators.required]],
    topicoId: [null as number | null, [Validators.required]],
    tempoMinutos: [30, [Validators.required, Validators.min(1), Validators.max(600)]],
    observacao: ['', [Validators.maxLength(1200)]]
  });

  loading = false;
  loadingTopicos = false;
  submitting = false;
  feedbackSuccess = '';
  feedbackError = '';

  materias: Materia[] = [];
  materiaOptions: MateriaOption[] = [];
  topicoOptions: TopicoOption[] = [];
  selectedTopicoLabel = '';

  private readonly storageRecentMaterias = 'quick-study:recent-materias';

  constructor(
    private fb: FormBuilder,
    private materiaService: MateriaService,
    private editalService: EditalService,
    private quickStudyService: QuickStudyService,
    private location: Location
  ) {}

  ngOnInit(): void {
    this.loadMaterias();
    this.form.controls.materiaId.valueChanges.subscribe((materiaId) => {
      const id = Number(materiaId || 0);
      this.topicoOptions = [];
      this.form.controls.topicoId.setValue(null);
      if (id > 0) {
        this.loadTopicos(id);
      }
    });
  }

  ngAfterViewInit(): void {}

  get materiaIdInvalid(): boolean {
    const control = this.form.controls.materiaId;
    return control.invalid && (control.touched || control.dirty);
  }

  get topicoInvalid(): boolean {
    const control = this.form.controls.topicoId;
    return control.invalid && (control.touched || control.dirty);
  }

  get tempoInvalid(): boolean {
    const control = this.form.controls.tempoMinutos;
    return control.invalid && (control.touched || control.dirty);
  }

  applyQuickTime(minutes: number): void {
    this.form.controls.tempoMinutos.setValue(minutes);
    this.form.controls.tempoMinutos.markAsDirty();
  }

  submit(): void {
    this.feedbackError = '';
    this.feedbackSuccess = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const materiaId = Number(this.form.value.materiaId || 0);
    const topicoId = Number(this.form.value.topicoId || 0);
    const tempoEstudadoMinutos = Number(this.form.value.tempoMinutos || 0);
    const observacao = String(this.form.value.observacao || '').trim();

    if (materiaId <= 0 || topicoId <= 0 || tempoEstudadoMinutos <= 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.quickStudyService.register({
      materiaId,
      topicoId,
      tempoEstudadoMinutos,
      observacao: observacao || undefined
    })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          this.feedbackSuccess = observacao
            ? 'Estudo registrado e anotacao salva no topico'
            : 'Estudo registrado e sua revisao foi atualizada';
          this.persistRecentMateria(materiaId);
          this.resetFormAfterSuccess(materiaId);
        },
        error: (error: HttpErrorResponse) => {
          this.feedbackError = this.getErrorMessage(error);
        }
      });
  }

  goBack(): void {
    this.location.back();
  }

  private loadMaterias(): void {
    this.loading = true;
    this.editalService.listarComInclude(['materias'])
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (editais) => {
          const listaEditais = Array.isArray(editais) ? editais : [];
          const editalAtivo: any = listaEditais.find((e: any) => e?.ativo) || null;
          const materiasEdital = (editalAtivo?.materias || []) as Array<{ materiaId?: number; materiaNome?: string; ativo?: boolean }>;
          this.materias = materiasEdital
            .filter((m) => Number(m?.materiaId || 0) > 0 && m?.ativo !== false)
            .map((m) => ({
              id: Number(m.materiaId),
              nome: String(m.materiaNome || '').trim()
            }))
            .filter((m) => !!m.nome);
          this.materiaOptions = this.buildMateriaOptions(this.materias);
          const selectedId = Number(this.form.value.materiaId || 0);
          if (selectedId <= 0 && this.materiaOptions.length) {
            this.form.controls.materiaId.setValue(Number(this.materiaOptions[0].id || 0) || null);
            return;
          }
          if (selectedId > 0) this.loadTopicos(selectedId);
        },
        error: () => {
          this.materias = [];
          this.materiaOptions = [];
          this.topicoOptions = [];
        }
      });
  }

  private loadTopicos(materiaId: number): void {
    this.loadingTopicos = true;
    this.materiaService.listarTopicos(materiaId)
      .pipe(finalize(() => (this.loadingTopicos = false)))
      .subscribe({
        next: (topicos) => {
          const roots = this.prepararRaizesTopicos((topicos || []) as any[]);
          this.topicoOptions = this.flattenTopicos(roots);
          if (this.topicoOptions.length) {
            this.form.controls.topicoId.setValue(this.topicoOptions[0].id);
          }
          this.selectedTopicoLabel = this.topicoOptions[0]?.descricao || '';
        },
        error: () => {
          this.topicoOptions = [];
        }
      });
  }

  private flattenTopicos(topicos: any[], depth = 0, visited = new Set<number>()): TopicoOption[] {
    const result: TopicoOption[] = [];
    for (const topico of topicos || []) {
      const id = Number(topico?.id ?? topico?.topicoId ?? topico?.idTopico ?? topico?.subtopicoId ?? 0);
      const descricaoBase = String(topico?.descricao || '').trim();
      if (id > 0 && visited.has(id)) {
        continue;
      }
      if (id > 0 && descricaoBase) {
        visited.add(id);
        result.push({ id, descricao: descricaoBase, nivel: depth });
      }
      const filhos = this.obterFilhos(topico);
      if (filhos.length) {
        result.push(...this.flattenTopicos(filhos, depth + 1, visited));
      }
    }
    return result;
  }

  private obterFilhos(topico: any): any[] {
    const filhos = topico?.filhos ?? topico?.subtopicos ?? topico?.children ?? [];
    return Array.isArray(filhos) ? filhos : [];
  }

  private prepararRaizesTopicos(topicos: any[]): any[] {
    const lista = Array.isArray(topicos) ? topicos.filter(Boolean) : [];
    if (!lista.length) return [];

    const possuiArvore = lista.some((item) => this.obterFilhos(item).length > 0);
    if (possuiArvore) {
      return lista;
    }

    const getId = (item: any) => Number(item?.id ?? item?.topicoId ?? item?.idTopico ?? item?.subtopicoId ?? 0);
    const getParentId = (item: any) => Number(
      item?.topicoPaiId ??
      item?.paiId ??
      item?.topicoPai?.id ??
      item?.pai?.id ??
      0
    );

    const byId = new Map<number, any>();
    for (const item of lista) {
      const id = getId(item);
      if (id > 0) {
        byId.set(id, { ...item, filhos: [] });
      }
    }

    const roots: any[] = [];
    for (const item of lista) {
      const id = getId(item);
      if (id <= 0) continue;

      const node = byId.get(id);
      const parentId = getParentId(item);
      if (parentId > 0 && byId.has(parentId)) {
        byId.get(parentId).filhos.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots.length ? roots : lista;
  }

  private buildMateriaOptions(materias: Materia[]): MateriaOption[] {
    const recentIds = this.loadRecentMateriaIds();
    const recentMap = new Map<number, number>();
    recentIds.forEach((id, index) => recentMap.set(id, index));

    const validMaterias = (materias || []).filter((m) => Number(m?.id || 0) > 0);
    const sorted = [...validMaterias].sort((a, b) => {
      const aId = Number(a.id || 0);
      const bId = Number(b.id || 0);
      const aRecent = recentMap.has(aId);
      const bRecent = recentMap.has(bId);
      if (aRecent && bRecent) return (recentMap.get(aId) || 0) - (recentMap.get(bId) || 0);
      if (aRecent) return -1;
      if (bRecent) return 1;
      return String(a.nome || '').localeCompare(String(b.nome || ''));
    });

    return sorted.map((m) => ({
      ...m,
      isRecent: recentMap.has(Number(m.id || 0))
    }));
  }

  private resetFormAfterSuccess(lastMateriaId: number): void {
    this.form.reset({
      materiaId: lastMateriaId,
      topicoId: this.topicoOptions.length ? this.topicoOptions[0].id : null,
      tempoMinutos: 30,
      observacao: ''
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.selectedTopicoLabel = this.topicoOptions.find((t) => t.id === this.form.value.topicoId)?.descricao || '';
  }

  toggleTopico(event: MouseEvent): void {
    if (!this.form.value.materiaId || this.loadingTopicos) return;
    event.stopPropagation();
    this.topicoOpen = !this.topicoOpen;
  }

  selectTopico(topico: TopicoOption, event: MouseEvent): void {
    event.stopPropagation();
    this.form.controls.topicoId.setValue(topico.id);
    this.form.controls.topicoId.markAsDirty();
    this.selectedTopicoLabel = topico.descricao;
    this.topicoOpen = false;
  }

  @HostListener('document:click')
  closeTopico(): void {
    this.topicoOpen = false;
  }

  private loadRecentMateriaIds(): number[] {
    const raw = localStorage.getItem(this.storageRecentMaterias);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => Number(item))
        .filter((id) => Number.isFinite(id) && id > 0)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  private persistRecentMateria(materiaId: number): void {
    const list = this.loadRecentMateriaIds().filter((id) => id !== materiaId);
    const next = [materiaId, ...list].slice(0, 5);
    localStorage.setItem(this.storageRecentMaterias, JSON.stringify(next));
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (!error) return 'Nao foi possivel registrar agora. Tente novamente.';
    if (error.status === 400) return 'Dados invalidos. Revise materia, topico e tempo.';
    if (error.status === 401) return 'Sessao expirada. Faca login novamente.';
    if (error.status === 402) return 'Assinatura inativa para registrar estudo.';
    if (error.status === 404) return 'Endpoint de registro nao encontrado.';
    return 'Nao foi possivel registrar agora. Tente novamente.';
  }
}
