import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  AfterViewInit
} from '@angular/core';
import {
  AbstractControl, FormArray, FormBuilder, FormGroup, ValidationErrors, Validators, ValidatorFn
} from '@angular/forms';
import { HttpParams } from '@angular/common/http';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subject, EMPTY, merge, Observable } from 'rxjs';
import {
  takeUntil, exhaustMap, map, startWith, distinctUntilChanged, tap, catchError, finalize
} from 'rxjs/operators';

import { ClienteService } from 'src/app/site/services/cliente.service';
import { MunicipioService } from 'src/app/site/services/municio.service';
import { ComunicacaoService } from 'src/app/site/comunicacao.service';
import { DateUtilService } from 'src/app/shared/data-util.service';

/* ====== Validator: WhatsApp OU Telefone obrigatório ====== */
export function telefoneOuWhatsAppObrigatorio(): ValidatorFn {
  return (form: AbstractControl): ValidationErrors | null => {
    const whatsApp = form.get('whatsApp')?.value;
    const telefone = form.get('telefone')?.value;
    return (!whatsApp && !telefone) ? { telefoneOuWhatsApp: true } : null;
  };
}

@Component({
  selector: 'app-cliente-cadastro',
  templateUrl: './cliente-cadastro.component.html',
  styleUrls: ['./cliente-cadastro.component.css'],
})
export class ClienteCadastroComponent implements OnInit, OnDestroy, AfterViewInit {

  /* ====== Outputs (mesmo contrato do Marca/Categoria) ====== */
  @Output() enviarMensagem = new EventEmitter<{ mensagem: string; tipo: 'success'|'error'|'info'|'warning' }>();
  @Output() modoConsultaChange = new EventEmitter<boolean>();
  @Output() ClienteCarregadoChange = new EventEmitter<boolean>();
  @Output() temDadosParaExcluirChange = new EventEmitter<boolean>();
  @Output() mostrarTelaDePesquisa = new EventEmitter<boolean>();

  /* ====== Modo consulta ====== */
  private _isModoConsulta = false;
  listaMarcas: any;
  
  @Input() set isModoConsulta(v: boolean) { this._isModoConsulta = v; }
  get isModoConsulta(): boolean { return this._isModoConsulta; }

  /* ====== Form & estado ====== */
  clienteForm: FormGroup = new FormGroup({});
  mensagemStatus = '';
  temDadosParaExcluir = false;

  exibirDialogPesquisa = false; // precisa existir e começar como false


  /* ====== Pesquisa ====== */
  listaClientes: any[] = [];
  clienteSelecionado: any = null;
  exibirTabelaPesquisa = false;   // controla visibilidade da tabela (igual Marca/Categoria)

  /* ====== Navegação ====== */
  private navIndex = -1;
  get canNavigate(): boolean {
    return Array.isArray(this.listaClientes) && this.listaClientes.length > 0 && this.navIndex >= 0;
  }
  get isFirstDisabled(): boolean { return !this.canNavigate || this.navIndex <= 0; }
  get isLastDisabled(): boolean { return !this.canNavigate || this.navIndex >= this.listaClientes.length - 1; }

  /* ====== Outros ====== */
  private destroy$ = new Subject<void>();
  isSaving = false;

  listaDeUfs: string[] = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  listaMunicipios: any[] = [];
  opcoesTipoDePessoa = [
    { label: 'Física', value: 'Física' },
    { label: 'Jurídica', value: 'Jurídica' }
  ];
  ativo = [
    { label: 'Ativo', value: true },
    { label: 'Inativo', value: false }
  ];

  /* ====== Touch helpers (mantive os seus) ====== */
  startX = 0; startY = 0;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private dateUtil: DateUtilService,
    private clienteService: ClienteService,
    private municipioService: MunicipioService,
    private comunicacaoService: ComunicacaoService
  ) {}

  ngAfterViewInit(): void { setTimeout(() => this.cdr.reattach()); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  ngOnInit(): void {
    this.comunicacaoService.emitirTitulo('Cadastro de Clientes');
    this.inicializarFormularios();
    this.isModoConsulta = true;

    // Habilita/Desabilita botão Excluir conforme o ID
    this.clienteForm.get('id')!.valueChanges.pipe(
      map(v => !!v),
      startWith(!!this.clienteForm.get('id')!.value),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(tem => {
      this.temDadosParaExcluir = tem;
      this.temDadosParaExcluirChange.emit(tem);
    });

    /* ====== Assinaturas de ações globais ====== */
    // SALVAR via barra padrão
    this.comunicacaoService.salvar$.pipe(
      exhaustMap(() => this.onSalvar$()),
      takeUntil(this.destroy$)
    ).subscribe();

    // Demais ações + navegação
    merge(
      this.comunicacaoService.novo$.pipe(tap(() => this.onNovo())),
      this.comunicacaoService.pesquisar$.pipe(tap(() => this.onPesquisar())),
      this.comunicacaoService.excluir$.pipe(tap(() => this.confirmarExclusao())),
      this.comunicacaoService.imprimir$.pipe(tap(() => this.onImprimir())),
      this.comunicacaoService.proximo$.pipe(tap(() => this.onProximo())),
      this.comunicacaoService.acao$.pipe(tap(acao => {
        switch (acao) {
          case 'onPrimeiro': this.onPrimeiro(); break;
          case 'onAnterior': this.onAnterior(); break;
          case 'onProximo' : this.onProximo();  break;
          case 'onUltimo'  : this.onUltimo();   break;
        }
      }))
    ).pipe(takeUntil(this.destroy$)).subscribe();
  }
  onImprimir(): void {
    throw new Error('Method not implemented.');
  }

  get isPessoaJuridica(): boolean {
  return this.clienteForm?.get('tipoDePessoa')?.value === 'Jurídica';
}

  /* ========= Pesquisa ========= */

  private setExibirTabelaPesquisa(v: boolean): void {
    this.exibirTabelaPesquisa = v;
    this.mostrarTelaDePesquisa.emit(v);
  }

onPesquisar(): void {
  if (!this.isModoConsulta) {
    this.clienteForm.reset();
    this.isModoConsulta = true;
    this.modoConsultaChange.emit(true);
    this.listaClientes = [];
    this.setExibirTabelaPesquisa(false);
    this.ClienteCarregadoChange.emit(false);
    this.temDadosParaExcluir = false;
    this.navIndex = -1;
    return;
  }

  const filtros = {
    nomeFantasia   : this.clienteForm.get('nomeFantasia')?.value,
    razaoSocial    : this.clienteForm.get('razaoSocial')?.value,
    tipoDePessoa   : this.clienteForm.get('tipoDePessoa')?.value,
    telefone       : this.clienteForm.get('telefone')?.value,
    whatsApp       : this.clienteForm.get('whatsApp')?.value,
    email          : this.clienteForm.get('email')?.value,
    documentoCpfCnpj: this.clienteForm.get('documentoCpfCnpj')?.value,
    documentoRgIe  : this.clienteForm.get('documentoRgIe')?.value
  };

  let params = new HttpParams();
  Object.entries(filtros).forEach(([k, v]) => { if (v != null && v !== '') params = params.set(k, v as any); });

  this.clienteService.buscarComFiltros(params).pipe(takeUntil(this.destroy$)).subscribe({
    next: (dados) => {
      const lista = this.dateUtil.formatarDatasEmArray(dados, ['dataNascimento'], false) || [];
      this.listaClientes = Array.isArray(lista) ? lista : (lista ? [lista] : []);
      this.setExibirTabelaPesquisa(this.listaClientes.length > 0); // <- LIGA a tabela quando tem dado
      this.navIndex = -1;

      if (this.listaClientes.length === 0) {
        this.enviarMensagem.emit({ mensagem: 'Nenhum cliente encontrado.', tipo: 'info' });
        this.mensagemStatus = 'Nenhum cliente encontrado.';
      }
      this.cdr.markForCheck();
    },
    error: () => {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Erro ao buscar clientes.' });
    }
  });
}

  /* ========= Seleção / preenchimento ========= */

  onRowClick(cliente: any) { this.selecionarCliente(cliente); }

  private preencherMunicipioEForm(cliente: any): void {
    const uf = cliente.endereco?.municipio?.uf;
    const municipioNome = cliente.endereco?.municipio?.municipioIbge;

    this.municipioService.getMunicipiosPorEstado(uf).subscribe({
      next: (data) => {
        this.listaMunicipios = data || [];
        const municipioEncontrado = this.listaMunicipios.find(m => m.nome === municipioNome);

        this.clienteForm.patchValue({
          id: cliente.id,
          tipoDePessoa: cliente.tipoDePessoa,
          dataNascimento: cliente.dataNascimento,
          nomeFantasia: cliente.nomeFantasia,
          razaoSocial: cliente.razaoSocial,
          documentoCpfCnpj: cliente.documentoCpfCnpj,
          documentoRgIe: cliente.documentoRgIe,
          email: cliente.email,
          whatsApp: cliente.whatsApp,
          telefone: cliente.telefone,
          site: cliente.site,
          ativo: cliente.ativo,
          observacao: cliente.observacao,
          endereco: {
            id: cliente.endereco?.id,
            logradouro: cliente.endereco?.logradouro,
            numero: cliente.endereco?.numero,
            complemento: cliente.endereco?.complemento,
            bairro: cliente.endereco?.bairro,
            cep: cliente.endereco?.cep,
            municipio: {
              id: cliente.endereco?.municipio?.id,
              codigoIbge: cliente.endereco?.municipio?.codigoIbge,
              municipioIbge: municipioEncontrado?.nome || '',
              uf: uf
            }
          }
        });

        // pós-patch: já entrou em modo edição e fecha tabela
          this.setExibirTabelaPesquisa(false);
        this.isModoConsulta = false;
        this.modoConsultaChange.emit(false);
        this.ClienteCarregadoChange.emit(true);
        this.temDadosParaExcluir = !!cliente.id;
        this.temDadosParaExcluirChange.emit(this.temDadosParaExcluir);
        this.setExibirTabelaPesquisa(false);
        this.listaClientes = this.listaClientes ?? [];
        this.cdr.markForCheck();
      },
      error: (e) => console.error('Erro ao carregar municípios:', e)
    });
  }

  selecionarCliente(cliente: any) {
    if (!cliente) return;

    // posiciona o índice para navegação
    const idx = this.listaClientes.findIndex(c => c?.id === cliente.id);
    this.navIndex = idx >= 0 ? idx : 0;

    this.preencherMunicipioEForm(cliente);
  }

  /* ========= Navegação ========= */

  private ensureListAndGo(target: 'first'|'last'): void {
    // Se não há lista, carrega tudo sem filtros e navega
    if (this.listaClientes?.length) {
      if (target === 'first') this.carregarRegistroPorIndex(0);
      else this.carregarRegistroPorIndex(this.listaClientes.length - 1);
      return;
    }

    // carrega todos (sem filtros)
    const params = new HttpParams();
    this.clienteService.buscarComFiltros(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (dados) => {
        const lista = this.dateUtil.formatarDatasEmArray(dados, ['dataNascimento'], false) || [];
        this.listaClientes = Array.isArray(lista) ? lista : (lista ? [lista] : []);
        if (!this.listaClientes.length) {
          this.enviarMensagem.emit({ mensagem: 'Nenhum cliente encontrado.', tipo: 'info' });
          return;
        }
        this.setExibirTabelaPesquisa(false);
        if (target === 'first') this.carregarRegistroPorIndex(0);
        else this.carregarRegistroPorIndex(this.listaClientes.length - 1);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Erro ao carregar clientes.' })
    });
  }

  private carregarRegistroPorIndex(index: number): void {
    if (!this.listaClientes?.length) return;
    if (index < 0 || index > this.listaClientes.length - 1) return;

    this.navIndex = index;
    const item = this.listaClientes[this.navIndex];
    if (!item) return;

    this.preencherMunicipioEForm(item);
  }

  onPrimeiro(): void {
    if (this.isFirstDisabled && !this.listaClientes.length) {
      this.ensureListAndGo('first'); // carrega e navega
      return;
    }
    if (!this.isFirstDisabled) this.carregarRegistroPorIndex(0);
  }

  onAnterior(): void {
    if (this.isFirstDisabled) return;
    this.carregarRegistroPorIndex(this.navIndex - 1);
  }

  onProximo(): void {
    if (this.isLastDisabled) return;
    this.carregarRegistroPorIndex(this.navIndex + 1);
  }

  onUltimo(): void {
    if (this.isLastDisabled && !this.listaClientes.length) {
      this.ensureListAndGo('last'); // carrega e navega
      return;
    }
    if (!this.isLastDisabled) this.carregarRegistroPorIndex(this.listaMarcas.length - 1 as any); // safeguard se copiar/colar
    this.carregarRegistroPorIndex(this.listaClientes.length - 1);
  }

  /* ========= Novo / Salvar / Excluir ========= */

  onNovo(): void {
    this.clienteForm.reset();
    this.clienteForm.markAsPristine();
    this.clienteForm.markAsUntouched();

    this.isModoConsulta = false;
    this.modoConsultaChange.emit(false);

    this.setExibirTabelaPesquisa(false);
    this.navIndex = -1;

    this.clienteForm.patchValue({ id: null, ativo: true });
    this.mensagemStatus = 'Pronto para novo cadastro.';
    setTimeout(() => this.mensagemStatus = '', 3000);
  }

  private onSalvar$(): Observable<void> {
    this.clienteForm.markAllAsTouched();
    if (this.clienteForm.invalid) {
      this.enviarMensagem.emit({ mensagem: 'Preencha todos os campos obrigatórios.', tipo: 'warning' });
      return EMPTY;
    }
    if (this.isSaving) return EMPTY;
    this.isSaving = true;

    let formValue = { ...this.clienteForm.value };
    formValue = this.dateUtil.formatarDatasEmObjeto(formValue, ['dataNascimento'], true);

    const req$ = formValue.id
      ? this.clienteService.atualizar(formValue.id, formValue)
      : this.clienteService.cadastrarCliente(formValue);

    return req$.pipe(
      tap((resp: any) => {
        // Atualiza/insere na lista para a navegação ficar consistente
        if (formValue.id && this.canNavigate) {
          this.listaClientes[this.navIndex] = { ...this.listaClientes[this.navIndex], ...formValue };
        } else if (!formValue.id && resp?.id) {
          this.listaClientes.push(resp);
          this.navIndex = this.listaClientes.length - 1;
        }

        this.enviarMensagem.emit({
          mensagem: formValue.id ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!',
          tipo: 'success'
        });
        this.messageService.add({
          severity: 'success',
          summary: 'Sucesso',
          detail: formValue.id ? 'Cliente atualizado.' : 'Cliente cadastrado.'
        });

        this.clienteForm.reset();
        this.isModoConsulta = false;
        this.modoConsultaChange.emit(false);
        this.temDadosParaExcluir = false;
        this.temDadosParaExcluirChange.emit(false);
        this.ClienteCarregadoChange.emit(false);
        this.cdr.markForCheck();
      }),
      catchError((error) => {
        const msg = error?.error?.message ?? 'Não foi possível salvar o cliente.';
        this.enviarMensagem.emit({ mensagem: msg, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg });
        return EMPTY;
      }),
      finalize(() => { this.isSaving = false; })
    );
  }

  confirmarExclusao(): void {
    const id = this.clienteForm.get('id')?.value;
    if (!id) {
      this.messageService.add({ severity: 'warn', summary: 'Atenção', detail: 'Selecione um cliente para excluir.' });
      return;
    }
    this.confirmationService.confirm({
      message: 'Tem certeza que deseja excluir este cliente?',
      header: 'Confirmação',
      icon: 'pi pi-exclamation-triangle',
      accept: () => this.onExcluir()
    });
  }

  onExcluir(): void {
    const id = this.clienteForm.get('id')?.value;
    if (!id) return;

    this.clienteService.deletarCliente(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.enviarMensagem.emit({ mensagem: 'Cliente excluído com sucesso!', tipo: 'success' });
        this.messageService.add({ severity: 'success', summary: 'Excluído', detail: 'Cliente removido.' });

        // remove da lista e reposiciona
        const idx = this.listaClientes.findIndex(c => c?.id === id);
        if (idx >= 0) this.listaClientes.splice(idx, 1);

        if (this.listaClientes.length > 0) {
          const novoIdx = Math.min(this.navIndex, this.listaClientes.length - 1);
          this.carregarRegistroPorIndex(novoIdx);
        } else {
          this.clienteForm.reset();
          this.temDadosParaExcluir = false;
          this.temDadosParaExcluirChange.emit(false);
          this.navIndex = -1;
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Não foi possível excluir o cliente.';
        this.enviarMensagem.emit({ mensagem: msg, tipo: 'error' });
        this.messageService.add({ severity: 'error', summary: 'Erro', detail: msg });
      }
    });
  }

  /* ========= Form ========= */

  inicializarFormularios(): void {
    this.clienteForm = this.fb.group({
      id: [''],
      tipoDePessoa: ['', Validators.required],
      dataNascimento: [''],
      nomeFantasia: ['', Validators.required],
      razaoSocial: [''],
      documentoCpfCnpj: [''],
      documentoRgIe: [''],
      email: ['', [Validators.email]],
      whatsApp: [''],
      telefone: [''],
      site: [''],
      endereco: this.fb.group({
        id: [''],
        logradouro: [''],
        numero: [''],
        complemento: [''],
        bairro: [''],
        cep: [''],
        municipio: this.fb.group({
          id: [''],
          codigoIbge: [''],
          municipioIbge: ['', Validators.required],
          uf: ['', [Validators.required, Validators.minLength(2)]],
        }),
      }),
      ativo: [true],
      observacao: [''],
    }, { validators: telefoneOuWhatsAppObrigatorio() });
  }

  /* ========= Helpers (mantive os seus) ========= */

  onTouchStart(e: TouchEvent) { this.startX = e.touches[0].clientX; this.startY = e.touches[0].clientY; }
  onTouchEnd(e: TouchEvent, cliente: any) {
    const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
    if (Math.abs(endX - this.startX) < 10 && Math.abs(endY - this.startY) < 10) this.selecionarCliente(cliente);
  }

  onUfChange(event: Event): void {
    const uf = (event.target as HTMLSelectElement).value;
    const municipioControl = this.clienteForm.get('endereco.municipio.municipioIbge');
    if (uf) {
      this.municipioService.getMunicipiosPorEstado(uf).subscribe({
        next: (data) => { this.listaMunicipios = data || []; municipioControl?.enable(); },
        error: () => { this.listaMunicipios = []; municipioControl?.disable(); }
      });
    } else {
      this.listaMunicipios = [];
      municipioControl?.disable();
    }
  }

  verificarCamposInvalidos(form: FormGroup | FormArray, path: string = ''): void {
    Object.keys(form.controls).forEach(campo => {
      const ctrl = form.get(campo);
      const full = path ? `${path}.${campo}` : campo;
      if (ctrl instanceof FormGroup || ctrl instanceof FormArray) this.verificarCamposInvalidos(ctrl, full);
      else if (ctrl?.invalid) console.warn(`❌ Campo inválido: ${full}`, ctrl.errors);
    });
  }
}
