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
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { MarcaService } from 'src/app/site/services/marca.service';
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
  selector: 'app-marca-cadastro',
  templateUrl: './marca-cadastro.component.html',
  styleUrls: ['./marca-cadastro.component.css']
})
export class MarcaCadastroComponent implements OnInit, OnDestroy, AfterViewInit {

  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success' | 'error' | 'info' | 'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>();
  @Output() MarcaCarregadaChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>();
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();

  private _isModoConsulta = false;
  @Input()
  set isModoConsulta(valor: boolean) { this._isModoConsulta = valor; }
  get isModoConsulta(): boolean { return this._isModoConsulta; }

  temDadosParaExcluir = false;
  marcaForm: FormGroup = new FormGroup({});
  listaMarcas: any[] = [];
  exibirTabelaPesquisa = false;
  marcaCarregada = false;
  mensagemStatus = '';

  // --- navegação ---
  private navIndex = -1;                     // índice atual na lista
  get canNavigate(): boolean {               // habilita barra de navegação?
    return Array.isArray(this.listaMarcas) && this.listaMarcas.length > 0 && this.navIndex >= 0;
  }
  get isFirstDisabled(): boolean { return !this.canNavigate || this.navIndex <= 0; }
  get isLastDisabled(): boolean { return !this.canNavigate || this.navIndex >= this.listaMarcas.length - 1; }

  // controle/estado
  private destroy$ = new Subject<void>();
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private marcaService: MarcaService,
    private comunicacaoService: ComunicacaoService,
    private messageService: MessageService
  ) {}

  ngAfterViewInit(): void { setTimeout(() => this.cdr.reattach()); }

  ngOnInit(): void {
    this.comunicacaoService.emitirTitulo('Cadastro de Marca');
    this.inicializarFormularios();
    this.isModoConsulta = true;

    // emite estado de "pode excluir" apenas quando o ID mudar
    this.marcaForm.get('id')!.valueChanges.pipe(
      map(v => !!v),
      startWith(!!this.marcaForm.get('id')!.value),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(tem => {
      this.temDadosParaExcluir = tem;
      this.temDadosParaExcluirChange.emit(tem);
    });

    // SALVAR
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
            case 'onUltimo':
              this.onUltimo();
              break;
            case 'onProximo':
              this.onProximo();
              break;
            case 'onAnterior':
              this.onAnterior();
              break;
            case 'onPrimeiro':
              this.onPrimeiro();
              break;
            default:
              console.warn('Ação desconhecida:', acao);
          }
        })
      )
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }

  onNovo(): void {
    this.marcaForm.reset();
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.marcaForm.markAsPristine();
    this.marcaForm.markAsUntouched();
    this.setExibirTabelaPesquisa(false);
    this.navIndex = -1; // desabilita navegação até selecionar/buscar de novo
    this.marcaForm.patchValue({ id: null, nome: '' });
    this.mensagemStatus = 'Pronto para novo cadastro.';
    setTimeout(() => this.mensagemStatus = '', 3000);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // --------- AÇÕES DA TELA ---------

  onImprimir(): void {
    this.messageService.add({ severity: 'info', summary: 'Impressão', detail: 'Funcionalidade ainda não implementada.' });
  }

  private setExibirTabelaPesquisa(valor: boolean): void {
    this.exibirTabelaPesquisa = valor;
    this.mostrarTelaDePesquisa.emit(valor);
  }

  onPesquisar(): void {
    if (!this.isModoConsulta) {
      this.marcaForm.reset();
      this.isModoConsulta = true;
      this.modoConsultaChange.emit(true);
      this.listaMarcas = [];
      this.setExibirTabelaPesquisa(false);
      this.MarcaCarregadaChange.emit(false);
      this.temDadosParaExcluir = false;
      this.navIndex = -1;
      return;
    }

    const nome: string = (this.marcaForm.get('nome')?.value ?? '').toString().trim();

    if (!nome) {
      this.marcaService.buscarTodasMarcas().pipe(takeUntil(this.destroy$)).subscribe({
        next: (res: any) => {
          const lista = Array.isArray(res) ? res : (res ? [res] : []);
          this.listaMarcas = lista;
          this.setExibirTabelaPesquisa(lista.length > 0);
          this.navIndex = -1; // aguardando seleção
          if (lista.length === 0) {
            this.enviarMensagem.emit({ mensagem: 'Nenhuma marca encontrada.', tipo: 'info' });
            this.mensagemStatus = 'Nenhuma marca encontrada.';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Erro ao buscar todas as marcas', err);
          this.enviarMensagem.emit({ mensagem: 'Erro ao buscar marcas. Tente novamente.', tipo: 'error' });
          this.mensagemStatus = 'Erro ao buscar marcas. Tente novamente.';
        }
      });
      return;
    }

    this.marcaService.buscarMarca(nome).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        const lista = Array.isArray(res) ? res : (res ? [res] : []);
        this.listaMarcas = lista;
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

  resetarParaModoCadastro(): void {
    this.listaMarcas = [];
    this.setExibirTabelaPesquisa(false);
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.navIndex = -1;
  }

  selecionarMarca(marca: any): void {
    if (!marca) return;

    this.marcaForm.patchValue({ id: marca.id, nome: marca.nome });

    // posiciona navegação no item selecionado
    const idx = this.listaMarcas.findIndex(m => m?.id === marca.id);
    this.navIndex = idx >= 0 ? idx : 0;

    const temDados = !!this.marcaForm.get('id')?.value;
    this.temDadosParaExcluir = temDados;
    this.temDadosParaExcluirChange.emit(temDados);
    this.MarcaCarregadaChange.emit(true);

    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);

    this.listaMarcas = this.listaMarcas ?? [];
    this.setExibirTabelaPesquisa(false);
  }

  // --------- NAVEGAÇÃO ---------

  private carregarRegistroPorIndex(index: number): void {
    if (!this.listaMarcas?.length) return;
    if (index < 0 || index > this.listaMarcas.length - 1) return;

    this.navIndex = index;
    const item = this.listaMarcas[this.navIndex];
    if (!item) return;

    // patch do formulário
    this.marcaForm.patchValue({ id: item.id, nome: item.nome });

    // como é navegação, continua em modo edição
    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);
    this.MarcaCarregadaChange.emit(true);
    this.temDadosParaExcluir = !!item.id;
    this.temDadosParaExcluirChange.emit(this.temDadosParaExcluir);
    this.cdr.markForCheck();
  }

  /** Carrega a lista (se ainda não existir) e navega para o índice informado.
 *  index: 0 = primeiro, -1 = último, ou qualquer índice válido.
 */
private carregarListaEVa(index: number): void {
  // Se já temos a lista carregada, só navega
  if (this.listaMarcas?.length) {
    const target = index === -1 ? this.listaMarcas.length - 1 : index;
    this.carregarRegistroPorIndex(target);
    return;
  }

  // Caso ainda não tenha lista, busca todas e navega
  this.marcaService.buscarTodasMarcas().subscribe({
    next: (res: any) => {
      const lista = Array.isArray(res) ? res : (res ? [res] : []);
      this.listaMarcas = lista;

      if (!this.listaMarcas.length) {
        this.enviarMensagem.emit({ mensagem: 'Nenhuma marca encontrada.', tipo: 'info' });
        return;
      }

      const target = index === -1 ? this.listaMarcas.length - 1 : index;
      this.setExibirTabelaPesquisa(false); // fecha a tabela de pesquisa
      this.carregarRegistroPorIndex(target);
    },
    error: (err) => {
      console.error('Erro ao carregar lista para navegação', err);
      this.enviarMensagem.emit({ mensagem: 'Erro ao carregar marcas.', tipo: 'error' });
    }
  });
}


  onPrimeiro(): void {
   
  this.carregarListaEVa(0);
  }

onAnterior(): void {
  // Se não tem lista ainda, traga e vá ao primeiro
  if (!this.listaMarcas?.length) {
    this.carregarListaEVa(0);
    return;
  }
  const idx = Math.max(0, (this.navIndex ?? 0) - 1);
  this.carregarRegistroPorIndex(idx);
}

onProximo(): void {
  // Se não tem lista ainda, traga e vá ao primeiro
  if (!this.listaMarcas?.length) {
    this.carregarListaEVa(0);
    return;
  }
  const max = this.listaMarcas.length - 1;
  const idx = Math.min(max, (this.navIndex ?? -1) + 1 < 0 ? 0 : (this.navIndex + 1));
  this.carregarRegistroPorIndex(idx);
}


onUltimo(): void {
  // Vai para o último, mesmo sem pesquisa prévia
  this.carregarListaEVa(-1);
}

  // --------- SALVAR ---------

  private onSalvar$(): Observable<void> {
    this.marcaForm.markAllAsTouched();
    if (this.marcaForm.invalid) {
      this.enviarMensagem.emit({ mensagem: '⚠️ Preencha todos os campos obrigatórios.', tipo: 'warning' });
      return EMPTY;
    }

    if (this.isSaving) return EMPTY;
    this.isSaving = true;

    const formData = this.marcaForm.value;
    const req$ = formData.id
      ? this.marcaService.atualizarMarca(formData)
      : this.marcaService.cadastrarMarca(formData);

    return req$.pipe(
      tap((resp: any) => {
        // mantém lista e índice atualizados se for update
        if (formData.id && this.canNavigate) {
          this.listaMarcas[this.navIndex] = { ...this.listaMarcas[this.navIndex], ...formData };
        }
        // se for create e a API retornar o objeto, você pode opcionalmente inserir na lista:
        // if (!formData.id && resp?.id) { this.listaMarcas.push(resp); this.navIndex = this.listaMarcas.length - 1; }

        this.enviarMensagem.emit({
          mensagem: formData.id ? 'Marca atualizada com sucesso!' : 'Marca cadastrada com sucesso!',
          tipo: 'success'
        });
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: formData.id ? 'Marca atualizada.' : 'Marca cadastrada.'
        });

        this.marcaForm.reset();
        this.isModoConsulta = false;
        this.modoConsultaChange.emit(false);
        this.marcaCarregada = false;
        this.MarcaCarregadaChange.emit(false);
        this.temDadosParaExcluir = false;
        this.temDadosParaExcluirChange.emit(false);
        this.cdr.markForCheck();
      }),
      catchError((error) => {
        const msg = error?.error?.message ?? 'Erro ao salvar marca.';
        console.error('Erro ao salvar marca:', msg, error);
        this.enviarMensagem.emit({ mensagem: msg, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Falha ao salvar', detail: msg });
        return EMPTY;
      }),
      finalize(() => { this.isSaving = false; })
    );
  }

  // --------- EXCLUSÃO ---------

  onExcluir(): void {
    const id = this.marcaForm.value?.id;
    if (!id) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione uma marca para excluir.' });
      return;
    }
    const confirmar = confirm('Tem certeza que deseja excluir esta marca?');
    if (!confirmar) return;

    this.marcaService.deletarMarca(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.enviarMensagem.emit({ mensagem: 'Marca excluída com sucesso!', tipo: 'success' });
        this.messageService.add({ severity: 'success', summary: 'Excluída', detail: 'Marca excluída com sucesso.' });

        // remove da lista de navegação e reposiciona
        const removeIdx = this.listaMarcas.findIndex(m => m?.id === id);
        if (removeIdx >= 0) this.listaMarcas.splice(removeIdx, 1);

        if (this.listaMarcas.length > 0) {
          const novoIdx = Math.min(this.navIndex, this.listaMarcas.length - 1);
          this.carregarRegistroPorIndex(novoIdx);
        } else {
          this.marcaForm.reset();
          this.temDadosParaExcluir = false;
          this.temDadosParaExcluirChange.emit(false);
          this.navIndex = -1;
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        let mensagem = 'Erro ao excluir marca.';
        if (error?.error?.message) mensagem = error.error.message;
        else if (error?.error) mensagem = error.error;
        this.enviarMensagem.emit({ mensagem, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Falha ao excluir', detail: mensagem });
      }
    });
  }

  // --------- FORM ---------

  inicializarFormularios(): void {
    this.marcaForm = this.fb.group({
      id: [''],
      nome: ['', [Validators.required]]
    });
  }
}
