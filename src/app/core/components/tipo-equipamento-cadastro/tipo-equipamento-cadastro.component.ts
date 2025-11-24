import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { EMPTY, Observable, Subject, merge } from 'rxjs';
import { catchError, distinctUntilChanged, exhaustMap, finalize, map, startWith, takeUntil, tap } from 'rxjs/operators';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { TipoEquipamentoService, TipoEquipamento } from 'src/app/site/services/tipo-equipamento.service';

@Component({
  selector: 'app-tipo-equipamento-cadastro',
  templateUrl: './tipo-equipamento-cadastro.component.html',
  styleUrls: ['./tipo-equipamento-cadastro.component.css']
})
export class TipoEquipamentoCadastroComponent implements OnInit, OnDestroy {
  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>();
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();

  debugOn = true;               // deixa true enquanto depura
  loading = false;
  isModoConsulta = true;

  form: FormGroup = this.fb.group({
    id: [''],
    nome: ['', Validators.required],
    descricao: [''],
    vidaUtilMeses: [null as number | null],
    periodicidadeManutencaoDias: [null as number | null],
    ativo: [true]
  });

  lista: TipoEquipamento[] = [];
  exibirTabelaPesquisa = false;

  private navIndex = -1;
  private destroy$ = new Subject<void>();

  get canNavigate(): boolean { return this.lista.length > 0 && this.navIndex >= 0; }
  get isFirstDisabled(): boolean { return !this.canNavigate || this.navIndex <= 0; }
  get isLastDisabled(): boolean  { return !this.canNavigate || this.navIndex >= this.lista.length - 1; }

  constructor(
    private fb: FormBuilder,
    private srv: TipoEquipamentoService,
    private bus: ComunicacaoService,
    private cdr: ChangeDetectorRef,
    private msg: MessageService
  ) {}

  // ---------- LOG helpers ----------
  private log(tag: string, data?: any) {
    console.log(`[TipoEquipamentoCad] ${tag}`, data ?? '');
  }
  private snapshot(where: string) {
    console.log(`[TipoEquipamentoCad] DoCheck snapshot ${where}`, {
      exibirTabelaPesquisa: this.exibirTabelaPesquisa,
      isModoConsulta: this.isModoConsulta,
      listaLen: this.lista?.length ?? 0
    });
  }

  ngOnInit(): void {
    this.bus.emitirTitulo('Cadastro de Tipo de Equipamento');
    this.isModoConsulta = true;

    this.form.get('id')!.valueChanges.pipe(
      map(v => !!v),
      startWith(!!this.form.get('id')!.value),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(canDelete => {
      this.log('id valueChanges -> canDelete', canDelete);
      this.temDadosParaExcluirChange.emit(canDelete);
    });

    this.bus.salvar$
      .pipe(exhaustMap(() => this.onSalvar$()), takeUntil(this.destroy$))
      .subscribe();

    merge(
      this.bus.novo$.pipe(tap(() => this.onNovo())),
      this.bus.excluir$.pipe(tap(() => this.onExcluir())),
      this.bus.pesquisar$.pipe(tap(() => this.onPesquisar())),
      this.bus.acao$.pipe(tap(a => {
        if (a === 'onPrimeiro') this.onPrimeiro();
        if (a === 'onAnterior') this.onAnterior();
        if (a === 'onProximo')  this.onProximo();
        if (a === 'onUltimo')   this.onUltimo();
      }))
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private setExibirTabelaPesquisa(v: boolean): void {
    this.exibirTabelaPesquisa = v;
    this.log('setExibirTabelaPesquisa', v);
    // NÃO emita para o pai enquanto depura (para garantir que ninguém esconda a tela)
    // this.mostrarTelaDePesquisa.emit(v);
  }

  onPesquisar(): void {
    if (!this.isModoConsulta) {
      this.form.reset();
      this.isModoConsulta = true;
      this.modoConsultaChange.emit(true);
      this.lista = [];
      this.setExibirTabelaPesquisa(false);
   
      this.navIndex = -1;
      return;
    }

    const nome: string = (this.form.get('nome')?.value ?? '').toString().trim();

    if (!nome) {
      this.srv.buscar('').pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: any) => {
          const lista = Array.isArray(res) ? res : (res ? [res] : []);
          this.lista = lista;
          this.setExibirTabelaPesquisa(lista.length > 0);
          this.navIndex = -1; // aguardando seleção
          if (lista.length === 0) {
            this.enviarMensagem.emit({ mensagem: 'Nenhuma marca encontrada.', tipo: 'info' });
           
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Erro ao buscar todas as marcas', err);
          this.enviarMensagem.emit({ mensagem: 'Erro ao buscar marcas. Tente novamente.', tipo: 'error' });
       
        }
      });
      return;
    }

    this.srv.buscar(nome).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const lista = Array.isArray(res) ? res : (res ? [res] : []);
        this.lista = lista;
        this.setExibirTabelaPesquisa(lista.length > 0);
        this.navIndex = -1; // aguardando seleção
        if (lista.length === 0) {
          this.enviarMensagem.emit({ mensagem: 'Nenhuma marca encontrada.', tipo: 'info' });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Erro ao buscar marca por nome', err);
        this.enviarMensagem.emit({ mensagem: 'Erro ao buscar marca. Tente novamente.', tipo: 'error' });
      }
    });
  }

  selecionar(item: TipoEquipamento | null): void {
    if (!item) return;
    this.form.patchValue({
      ...item,
      id: item.id != null ? String(item.id) : null,
      vidaUtilMeses: typeof item.vidaUtilMeses === 'number' ? item.vidaUtilMeses : null,
      periodicidadeManutencaoDias: typeof item.periodicidadeManutencaoDias === 'number' ? item.periodicidadeManutencaoDias : null
    });
    this.navIndex = this.lista.findIndex(x => x.id === item.id);
    this.setExibirTabelaPesquisa(false);
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.cdr.detectChanges();
  }

  onNovo(): void {
    this.form.reset({ ativo: true });
    this.setExibirTabelaPesquisa(false);
    this.navIndex = -1;
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
  }

  private onSalvar$(): Observable<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.enviarMensagem.emit({ mensagem: 'Preencha os obrigatórios.', tipo: 'warning' });
      return EMPTY;
    }

    const dto = this.form.value as Partial<TipoEquipamento>;
    const req$: Observable<TipoEquipamento> = dto.id ? this.srv.atualizar(dto) : this.srv.criar(dto);

    return req$.pipe(
      tap((resp: TipoEquipamento) => {
        this.msg.add({ severity: 'success', summary: 'Sucesso', detail: dto.id ? 'Atualizado.' : 'Cadastrado.' });

        if (dto.id && this.canNavigate) {
          this.lista[this.navIndex] = { ...this.lista[this.navIndex], ...dto };
        } else if (!dto.id && resp?.id) {
          this.lista = [...this.lista, resp];
          this.navIndex = this.lista.length - 1;
        }

        this.form.reset({ ativo: true });
        this.isModoConsulta = false;
        this.modoConsultaChange.emit(false);
      }),
      catchError((err: any) => {
        this.msg.add({ severity: 'error', summary: 'Erro', detail: err?.error?.message || 'Falha ao salvar.' });
        return EMPTY;
      }),
      map(() => void 0)
    );
  }

  onExcluir(): void {
    const id = this.form.get('id')?.value as number | null;
    if (!id) {
      this.msg.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione um tipo.' });
      return;
    }

    this.srv.deletar(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.msg.add({ severity: 'success', summary: 'Excluído', detail: 'Tipo removido.' });

        const i = this.lista.findIndex(x => x.id === id);
        if (i >= 0) this.lista.splice(i, 1);

        if (this.lista.length) {
          this.selecionar(this.lista[Math.min(this.navIndex, this.lista.length - 1)]);
        } else {
          this.form.reset({ ativo: true });
          this.navIndex = -1;
        }
      },
      error: (err: any) => this.msg.add({
        severity: 'error',
        summary: 'Erro',
        detail: err?.error?.message || 'Não foi possível excluir (talvez em uso).'
      })
    });
  }

  // Navegação
  private carregarPorIndex(i: number): void {
    if (!this.lista.length) return;
    this.selecionar(this.lista[i]);
  }
  onPrimeiro(): void { if (this.lista.length) this.carregarPorIndex(0); else this.onPesquisar(); }
  onAnterior(): void { if (this.navIndex > 0) this.carregarPorIndex(this.navIndex - 1); }
  onProximo(): void { if (this.navIndex < this.lista.length - 1) this.carregarPorIndex(this.navIndex + 1); }
  onUltimo(): void { if (this.lista.length) this.carregarPorIndex(this.lista.length - 1); else this.onPesquisar(); }

  // util
  trackById = (_: number, it: TipoEquipamento) => it?.id ?? _;
}
