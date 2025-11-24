import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  OnDestroy,
  Output,
  AfterViewInit
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { CategoriaService } from 'src/app/site/services/categoria.service';
import { MessageService } from 'primeng/api';

import { Subject, EMPTY, merge, Observable } from 'rxjs';
import {
  takeUntil,
  exhaustMap,
  map,
  startWith,
  distinctUntilChanged,
  tap,
  catchError,
  finalize
} from 'rxjs/operators';

@Component({
  selector: 'app-categoria-cadastro',
  templateUrl: './categoria-cadastro.component.html',
  styleUrls: ['./categoria-cadastro.component.css']
})
export class CategoriaCadastroComponent implements OnInit, OnDestroy, AfterViewInit {

  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>();
  @Output() CategoriaCarregadaChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>();
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();

  private _isModoConsulta = false;
  @Input()
  set isModoConsulta(valor: boolean) { this._isModoConsulta = valor; }
  get isModoConsulta(): boolean { return this._isModoConsulta; }

  temDadosParaExcluir = false;
  categoriaForm: FormGroup = new FormGroup({});
  listaCategorias: any[] = [];
  exibirTabelaPesquisa = false;
  categoriaCarregada = false;
  mensagemStatus = '';
 
categoriaSelecionada: any | null = null; // <-- ADICIONE ESTA LINHA


  // --- navegação ---
  private navIndex = -1;
  get canNavigate(): boolean {
    return Array.isArray(this.listaCategorias) && this.listaCategorias.length > 0 && this.navIndex >= 0;
  }
  get isFirstDisabled(): boolean {
    // afrouxado para permitir clique e disparar lazy-load
    return Array.isArray(this.listaCategorias) && this.listaCategorias.length > 0
      ? this.navIndex <= 0
      : false;
  }
  get isLastDisabled(): boolean {
    // afrouxado para permitir clique e disparar lazy-load
    return Array.isArray(this.listaCategorias) && this.listaCategorias.length > 0
      ? this.navIndex >= this.listaCategorias.length - 1
      : false;
  }

  // controle/estado
  private destroy$ = new Subject<void>();
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private categoriaService: CategoriaService,
    private comunicacaoService: ComunicacaoService,
    private messageService: MessageService
  ) {}

  ngAfterViewInit(): void {
    setTimeout(() => this.cdr.reattach());
  }

  ngOnInit(): void {
    this.comunicacaoService.emitirTitulo('Cadastro de Categoria');
    this.inicializarFormularios();
    this.isModoConsulta = true;

    // Emite "pode excluir" quando o ID mudar
    this.categoriaForm.get('id')!.valueChanges.pipe(
      map(v => !!v),
      startWith(!!this.categoriaForm.get('id')!.value),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(tem => {
      this.temDadosParaExcluir = tem;
      this.temDadosParaExcluirChange.emit(tem);
    });

    // SALVAR (reativo)
    this.comunicacaoService.salvar$.pipe(
      exhaustMap(() => this.onSalvar$()),
      takeUntil(this.destroy$)
    ).subscribe();

    // OUTRAS AÇÕES
    merge(
      this.comunicacaoService.excluir$.pipe(tap(() => this.onExcluir())),
      this.comunicacaoService.pesquisar$.pipe(tap(() => this.onPesquisar())),
      this.comunicacaoService.imprimir$.pipe(tap(() => this.onImprimir())),
      this.comunicacaoService.novo$.pipe(tap(() => this.onNovo())),
      this.comunicacaoService.proximo$.pipe(tap(() => this.onProximo())),
      this.comunicacaoService.acao$.pipe(
        tap(acao => {
          switch (acao) {
            case 'onUltimo':   this.onUltimo();   break;
            case 'onProximo':  this.onProximo();  break;
            case 'onAnterior': this.onAnterior(); break;
            case 'onPrimeiro': this.onPrimeiro(); break;
          }
        })
      )
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --------- AÇÕES DA TELA ---------

  onImprimir(): void {
    this.messageService.add({ severity: 'info', summary: 'Impressão', detail: 'Funcionalidade ainda não implementada.' });
  }

  onNovo(): void {
    this.categoriaForm.reset();
    this.subcategorias.clear();
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.categoriaForm.markAsPristine();
    this.categoriaForm.markAsUntouched();
    this.setExibirTabelaPesquisa(false);
    this.navIndex = -1;
    this.categoriaForm.patchValue({ id: null, nome: '' });
    this.mensagemStatus = 'Pronto para novo cadastro.';
    setTimeout(() => this.mensagemStatus = '', 3000);
  }

  private setExibirTabelaPesquisa(valor: boolean): void {
    this.exibirTabelaPesquisa = valor;
    this.mostrarTelaDePesquisa.emit(valor);
  }

  onPesquisar(): void {
    // Se estiver editando, volta para consulta e limpa
    if (!this.isModoConsulta) {
      this.categoriaForm.reset();
      this.subcategorias.clear();
      this.isModoConsulta = true;
      this.modoConsultaChange.emit(true);
      this.listaCategorias = [];
      this.setExibirTabelaPesquisa(false);
      this.CategoriaCarregadaChange.emit(false);
      this.temDadosParaExcluir = false;
      this.navIndex = -1;
      return;
    }

    const nome: string = (this.categoriaForm.get('nome')?.value ?? '').toString().trim();

    if (!nome) {
      this.categoriaService.buscarTodasCategorias().pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: any) => {
          const lista = Array.isArray(res) ? res : (res ? [res] : []);
          this.listaCategorias = lista;
          this.setExibirTabelaPesquisa(lista.length > 0);
          this.navIndex = -1;
          if (lista.length === 0) {
            this.enviarMensagem.emit({ mensagem: 'Nenhuma categoria encontrada.', tipo: 'info' });
            this.mensagemStatus = 'Nenhuma categoria encontrado.';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Erro ao buscar categorias', err);
          this.enviarMensagem.emit({ mensagem: 'Erro ao buscar categorias. Tente novamente.', tipo: 'error' });
          this.mensagemStatus = 'Erro ao buscar categorias. Tente novamente.';
        }
      });
      return;
    }

    this.categoriaService.buscarCategoria(nome).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const lista = Array.isArray(res) ? res : (res ? [res] : []);
        this.listaCategorias = lista;
        this.setExibirTabelaPesquisa(lista.length > 0);
        this.navIndex = -1;
        if (lista.length === 0) {
          this.enviarMensagem.emit({ mensagem: 'Nenhuma categoria encontrada.', tipo: 'info' });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Erro ao buscar categoria por nome', err);
        this.enviarMensagem.emit({ mensagem: 'Erro ao buscar categoria. Tente novamente.', tipo: 'error' });
      }
    });
  }

  resetarParaModoCadastro(): void {
    this.listaCategorias = [];
    this.setExibirTabelaPesquisa(false);
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.navIndex = -1;
  }

  selecionarCategoria(categoria: any): void {
    if (!categoria) return;
    this.mapCategoriaToForm(categoria);

    // posiciona navegação no item selecionado
    const idx = this.listaCategorias.findIndex(m => m?.id === categoria.id);
    this.navIndex = idx >= 0 ? idx : 0;

    const temDados = !!this.categoriaForm.get('id')?.value;
    this.temDadosParaExcluir = temDados;
    this.temDadosParaExcluirChange.emit(temDados);
    this.CategoriaCarregadaChange.emit(true);

    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);

    this.listaCategorias = this.listaCategorias ?? [];
    this.setExibirTabelaPesquisa(false);
  }

  // --------- NAVEGAÇÃO (com lazy-load) ---------

  private carregarRegistroPorIndex(index: number): void {
    if (!this.listaCategorias?.length) return;
    if (index < 0 || index > this.listaCategorias.length - 1) return;

    this.navIndex = index;
    const item = this.listaCategorias[this.navIndex];
    if (!item) return;

    this.mapCategoriaToForm(item);

    // navegação mantém modo edição
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.CategoriaCarregadaChange.emit(true);
    this.temDadosParaExcluir = !!item.id;
    this.temDadosParaExcluirChange.emit(this.temDadosParaExcluir);
    this.cdr.markForCheck();
  }

  /** Carrega a lista (se necessário) e navega para o índice.
   * index: 0 = primeiro, -1 = último, ou qualquer índice válido.
   */
  private carregarListaEVa(index: number): void {
    if (this.listaCategorias?.length) {
      const target = index === -1 ? this.listaCategorias.length - 1 : index;
      this.carregarRegistroPorIndex(target);
      return;
    }

    this.categoriaService.buscarTodasCategorias().subscribe({
      next: (res: any) => {
        const lista = Array.isArray(res) ? res : (res ? [res] : []);
        this.listaCategorias = lista;

        if (!this.listaCategorias.length) {
          this.enviarMensagem.emit({ mensagem: 'Nenhuma categoria encontrada.', tipo: 'info' });
          return;
        }

        const target = index === -1 ? this.listaCategorias.length - 1 : index;
        this.setExibirTabelaPesquisa(false);
        this.carregarRegistroPorIndex(target);
      },
      error: (err) => {
        console.error('Erro ao carregar lista para navegação', err);
        this.enviarMensagem.emit({ mensagem: 'Erro ao carregar categorias.', tipo: 'error' });
      }
    });
  }

  onPrimeiro(): void { this.carregarListaEVa(0); }
  onUltimo(): void { this.carregarListaEVa(-1); }

  onAnterior(): void {
    if (!this.listaCategorias?.length) { this.carregarListaEVa(0); return; }
    const idx = Math.max(0, (this.navIndex ?? 0) - 1);
    this.carregarRegistroPorIndex(idx);
  }

  onProximo(): void {
    if (!this.listaCategorias?.length) { this.carregarListaEVa(0); return; }
    const max = this.listaCategorias.length - 1;
    const idx = Math.min(max, (this.navIndex ?? -1) + 1 < 0 ? 0 : (this.navIndex + 1));
    this.carregarRegistroPorIndex(idx);
  }

  // --------- SALVAR (reativo) ---------

  private onSalvar$(): Observable<void> {
    this.categoriaForm.markAllAsTouched();
    if (this.categoriaForm.invalid) {
      this.enviarMensagem.emit({ mensagem: '⚠️ Preencha todos os campos obrigatórios.', tipo: 'warning' });
      return EMPTY;
    }

    if (this.isSaving) return EMPTY;
    this.isSaving = true;

    const formData = this.categoriaForm.value;
    const req$ = formData.id
      ? this.categoriaService.atualizarCategoria(formData)
      : this.categoriaService.cadastrarCategoria(formData);

    return req$.pipe(
      tap((resp: any) => {
        // Atualiza lista local se estiver navegando
        if (formData.id && this.canNavigate) {
          // merge local mantendo subcategorias
          this.listaCategorias[this.navIndex] = {
            ...this.listaCategorias[this.navIndex],
            ...formData,
            subcategorias: [...(formData.subcategorias ?? [])]
          };
        }
        // Se criou e a API retorna o objeto, pode inserir na lista para já navegar depois
        if (!formData.id && resp?.id) {
          this.listaCategorias = this.listaCategorias ?? [];
          this.listaCategorias.push(resp);
          this.navIndex = this.listaCategorias.length - 1;
        }

        this.enviarMensagem.emit({
          mensagem: formData.id ? 'Categoria atualizada com sucesso!' : 'Categoria cadastrada com sucesso!',
          tipo: 'success'
        });
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: formData.id ? 'Categoria atualizada.' : 'Categoria cadastrada.'
        });

        this.categoriaForm.reset();
        this.subcategorias.clear();
        this.isModoConsulta = false;
        this.modoConsultaChange.emit(false);
        this.categoriaCarregada = false;
        this.CategoriaCarregadaChange.emit(false);
        this.temDadosParaExcluir = false;
        this.temDadosParaExcluirChange.emit(false);
        this.cdr.markForCheck();
      }),
      catchError((error) => {
        const msg = error?.error?.message ?? 'Erro ao salvar categoria/subcategoria.';
        console.error('Erro ao salvar categoria:', msg, error);
        this.enviarMensagem.emit({ mensagem: msg, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Falha ao salvar', detail: msg });
        return EMPTY;
      }),
      finalize(() => { this.isSaving = false; })
    );
  }

  // --------- EXCLUSÃO ---------

  onExcluir(): void {
    const id = this.categoriaForm.value?.id;
    if (!id) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione uma categoria para excluir.' });
      return;
    }
    const confirmar = confirm('Tem certeza que deseja excluir esta categoria?');
    if (!confirmar) return;

    this.categoriaService.deletarCategoria(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.enviarMensagem.emit({ mensagem: 'Categoria excluída com sucesso!', tipo: 'success' });
        this.messageService.add({ severity: 'success', summary: 'Excluída', detail: 'Categoria excluída com sucesso.' });

        // remove da lista e reposiciona
        const removeIdx = this.listaCategorias.findIndex(m => m?.id === id);
        if (removeIdx >= 0) this.listaCategorias.splice(removeIdx, 1);

        if (this.listaCategorias.length > 0) {
          const novoIdx = Math.min(this.navIndex, this.listaCategorias.length - 1);
          this.carregarRegistroPorIndex(novoIdx);
        } else {
          this.categoriaForm.reset();
          this.subcategorias.clear();
          this.temDadosParaExcluir = false;
          this.temDadosParaExcluirChange.emit(false);
          this.navIndex = -1;
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        let mensagem = 'Erro ao excluir categoria.';
        if (error?.error?.message) mensagem = error.error.message;
        else if (error?.error) mensagem = error.error;
        this.enviarMensagem.emit({ mensagem, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Falha ao excluir', detail: mensagem });
      }
    });
  }

  // --------- FORM / HELPERS ---------

  inicializarFormularios(): void {
    this.categoriaForm = this.fb.group({
      id: [''],
      nome: ['', [Validators.required]],
      subcategorias: this.fb.array([])
    });
  }

  get subcategorias(): FormArray {
    return this.categoriaForm.get('subcategorias') as FormArray;
  }

  private buildSubcategorias(subs: any[] = []): void {
    this.subcategorias.clear();
    (subs || []).forEach(sub => {
      this.subcategorias.push(this.fb.group({
        id: [sub?.id || ''],
        nome: [sub?.nome || '', Validators.required]
      }));
    });
  }

  private mapCategoriaToForm(categoria: any): void {
    this.categoriaForm.patchValue({
      id: categoria.id,
      nome: categoria.nome
    });
    this.buildSubcategorias(categoria.subcategorias || []);
  }

  novaSubcategoria(nome: string = ''): FormGroup {
    return this.fb.group({
      id: [''],
      nome: [nome, Validators.required]
    });
  }

  adicionarSubcategoria(): void {
    this.subcategorias.push(this.novaSubcategoria());
  }

  removerSubcategoria(index: number): void {
    this.subcategorias.removeAt(index);
  }
}
