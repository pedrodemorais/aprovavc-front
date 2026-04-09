import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EditalService } from '../services/edital.service';
import { EditalFormPayload } from '../services/edital.service';
import { Edital } from '../models/Edital';
import { Materia } from '../models/materia.model';
import { MateriaService } from '../services/materia.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { EditalTemplateDTO, EstruturaTemplateDTO } from 'src/app/core/area-admin/dto/edital-admin.dto';
import { TreeNode } from 'primeng/api';
import { CanComponentDeactivate } from '../guards/estudo-em-andamento.guard';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

@Component({
  selector: 'app-editais',
  templateUrl: './editais.component.html',
  styleUrls: ['./editais.component.css']
})
export class EditaisComponent implements OnInit, OnDestroy, CanComponentDeactivate {

  carregando = false;
  salvando = false;
  erro?: string;
  mensagemSucesso?: string;
  definindoAtivoId: number | null = null;
  private tentativaAutoAtivarPadrao = false;
private mensagemTimeout: any; // para guardar o setTimeout

  editais: Edital[] = [];
  materias: Materia[] = [];
  editalTreeNodes: TreeNode[] = [];
  selectedEditalNodes: TreeNode[] | null = [];
  currentTreeNodeKey: string | null = null;
  editingNodeKey: string | null = null;
  editingLabel = '';
  materiasDisponiveis: Materia[] = [];
  materiasSelecionadas: Materia[] = [];

  form!: FormGroup;
  editalEmEdicao?: Edital | null;
  editalSelecionado?: Edital | null;
  mostrarFormulario = false;
  mostrarModalVincularMaterias = false;
  temMudancasNaoSalvas = false;
  private ignorarMudancasFormulario = false;
  private formChangesSub?: Subscription;

  // ====== TEMPLATES (NOVO EDITAL)
  mostrarModalTemplates = false;
  templates: EditalTemplateDTO[] = [];
  templatesCarregando = false;
  templatesErro?: string;
  usandoTemplatesNaoPublicados = false;
  templateSelecionadoId: number | null = null;
  nomeEditalTemplate = '';
  nomeEditalPersonalizado = false;
  clonandoTemplate = false;
  mensagemTemplateOk?: string;
  templateImagemUrls: Record<number, string> = {};
  private templateImagemObjectUrls = new Map<number, string>();
  areaFiltro = 'todas';
  abrangenciaFiltro = 'todas';
  areasDisponiveis: string[] = [];
  abrangenciasDisponiveis: string[] = [];
  modoImportacao = false;
  importandoTemplate = false;
  private materiasImportadasPendentes?: string[];

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
    private editalTemplateService: EditalTemplateService,
    private fb: FormBuilder,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
    this.carregarEditais();
  }

  ngOnDestroy(): void {
    this.limparImagensTemplates();
    this.formChangesSub?.unsubscribe();
  }

  private montarForm(): void {
    this.form = this.fb.group({
      id: [null],
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
      this.marcarMudancasPendentes();
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

  private marcarMudancasPendentes(): void {
    this.temMudancasNaoSalvas = true;
  }

  private resetarMudancasPendentes(): void {
    this.temMudancasNaoSalvas = false;
  }

  // ============= LOADS =============

  private carregarMaterias(): void {
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
        this.atualizarPickListMaterias();
        this.aplicarMateriasImportadasPendentes();
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

    this.editalService.listarComInclude(['materias', 'topicos']).subscribe({
      next: (lista) => {
        const editaisRecebidos = lista || [];
        if (this.tentativaAutoAtivarPadrao) {
          this.editais = editaisRecebidos;
          this.montarArvoreEditais();
          this.carregando = false;
          return;
        }

        this.editalService.garantirEditalPadraoAtivo(editaisRecebidos).subscribe({
          next: (ativouPadrao) => {
            if (ativouPadrao) {
              this.tentativaAutoAtivarPadrao = true;
              this.carregarEditais();
              return;
            }

            this.editais = editaisRecebidos;
            this.montarArvoreEditais();
            this.carregando = false;
          },
          error: () => {
            this.editais = editaisRecebidos;
            this.montarArvoreEditais();
            this.carregando = false;
          }
        });
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar editais:', err);
        this.erro = 'Erro ao carregar seus editais.';
        this.carregando = false;
      }
    });
  }

  // ============= TEMPLATES =============

  carregarTemplates(): void {
    if (this.templatesCarregando) return;

    this.templatesCarregando = true;
    this.templatesErro = undefined;
    this.mensagemTemplateOk = undefined;

    this.editalTemplateService.listarTemplates().subscribe({
      next: (lista) => {
        const all = lista || [];
        const publicados = all.filter(t => t.publicado);

        this.usandoTemplatesNaoPublicados = all.some(t => !t.publicado);
        this.templates = publicados;
        this.templatesCarregando = false;

        if (!this.templateSelecionadoId && this.templates.length) {
          const first = this.templates[0];
          this.templateSelecionadoId = first.id;
          this.nomeEditalTemplate = first.nome || '';
          this.nomeEditalPersonalizado = false;
        }

        this.areasDisponiveis = this.extrairValoresUnicos(this.templates, 'area');
        this.abrangenciasDisponiveis = this.extrairValoresUnicos(this.templates, 'abrangencia');

        this.limparImagensTemplates();
        this.carregarImagensTemplates(this.templates);
      },
      error: (err) => {
        console.error('[EDITAIS-TEMPLATES] Erro ao carregar templates:', err);
        this.templatesErro = 'Não foi possível carregar os templates.';
        this.templatesCarregando = false;
      }
    });
  }

  selecionarTemplate(template: EditalTemplateDTO): void {
    this.templateSelecionadoId = template.id;

    if (!this.nomeEditalPersonalizado) {
      this.nomeEditalTemplate = template.nome || '';
    }
  }

  get templatesFiltrados(): EditalTemplateDTO[] {
    return (this.templates || []).filter((t) => {
      const areaOk = this.areaFiltro === 'todas' || this.getTemplateArea(t) === this.areaFiltro;
      const abrangenciaOk =
        this.abrangenciaFiltro === 'todas' || this.getTemplateAbrangencia(t) === this.abrangenciaFiltro;
      return areaOk && abrangenciaOk;
    });
  }

  limparFiltrosTemplates(): void {
    this.areaFiltro = 'todas';
    this.abrangenciaFiltro = 'todas';
  }

  private extrairValoresUnicos(templates: EditalTemplateDTO[], campo: 'area' | 'abrangencia'): string[] {
    const valores = new Set<string>();
    for (const t of templates || []) {
      const valor = campo === 'area' ? this.getTemplateArea(t) : this.getTemplateAbrangencia(t);
      if (valor) {
        valores.add(valor);
      }
    }
    return Array.from(valores).sort((a, b) => a.localeCompare(b));
  }

  onNomeEditalTemplateChange(): void {
    this.nomeEditalPersonalizado = true;
  }

  clonarTemplateSelecionado(): void {
    if (!this.templateSelecionadoId) {
      this.templatesErro = 'Selecione um template antes de continuar.';
      return;
    }

    this.clonandoTemplate = true;
    this.templatesErro = undefined;
    this.mensagemTemplateOk = undefined;

    const nomeEdital = this.nomeEditalTemplate?.trim() || undefined;

    this.editalTemplateService.clonarTemplate(this.templateSelecionadoId, { nomeEdital }).subscribe({
      next: () => {
        this.clonandoTemplate = false;
        this.mensagemTemplateOk = 'Edital criado com sucesso.';
        this.nomeEditalTemplate = '';
        this.nomeEditalPersonalizado = false;
        this.templateSelecionadoId = null;
        this.materiaService.notificarMateriasAlteradas();
        this.carregarEditais();
        this.fecharModalTemplates();
      },
      error: (err) => {
        console.error('[EDITAIS-TEMPLATES] Erro ao clonar template:', err);
        this.templatesErro = 'Não foi possível criar o edital pelo template.';
        this.clonandoTemplate = false;
      }
    });
  }

  private carregarImagensTemplates(templates: EditalTemplateDTO[]): void {
    for (const t of templates || []) {
      if (!t?.id) continue;
      this.carregarImagemTemplate(t.id);
    }
  }

  private carregarImagemTemplate(templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        this.removerImagemTemplate(templateId);

        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.templateImagemObjectUrls.set(templateId, objectUrl);
          this.templateImagemUrls[templateId] = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.templateImagemUrls[templateId] = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.removerImagemTemplate(templateId);
          });
      },
      error: () => {
        this.removerImagemTemplate(templateId);
      }
    });
  }

  onTemplateImagemErro(templateId: number): void {
    this.removerImagemTemplate(templateId);
  }

  private removerImagemTemplate(templateId: number): void {
    const objectUrl = this.templateImagemObjectUrls.get(templateId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.templateImagemObjectUrls.delete(templateId);
    }
    delete this.templateImagemUrls[templateId];
  }

  private limparImagensTemplates(): void {
    for (const objectUrl of this.templateImagemObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.templateImagemObjectUrls.clear();
    this.templateImagemUrls = {};
  }

  private lerBlobComoTexto(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  private parseImagemResponse(texto: string): { dados?: string; contentType?: any } | null {
    const raw = (texto || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizarContentType(contentType: any): string {
    if (!contentType) return 'image/png';
    if (typeof contentType === 'string') return contentType;
    const type = contentType.type || contentType.mainType || 'image';
    const subtype = contentType.subtype || contentType.subType || 'png';
    return `${type}/${subtype}`;
  }

  // ============= FORM HELPERS =============

  get tituloFormulario(): string {
    return this.form.get('id')?.value ? 'Editar edital' : 'Novo edital';
  }

  novoEdital(): void {
    this.aplicarSemRastrearMudancas(() => {
      this.form.reset({
        id: null,
        nome: '',
        cargo: '',
        descricao: '',
        dataProva: null,
        materiasIds: []
      });
    });
    this.editalEmEdicao = null;
    this.editalSelecionado = undefined;
    this.selectedEditalNodes = [];
    this.mensagemSucesso = undefined;
    this.erro = undefined;
    this.mostrarFormulario = true;
    this.atualizarPickListMaterias();
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.resetarMudancasPendentes();
    this.materiasImportadasPendentes = undefined;
  }

  limparFormulario(): void {
    this.aplicarSemRastrearMudancas(() => {
      this.form.reset({
        id: null,
        nome: '',
        cargo: '',
        descricao: '',
        dataProva: null,
        materiasIds: []
      });
    });
    this.editalEmEdicao = null;
    this.editalSelecionado = undefined;
    this.selectedEditalNodes = [];
    this.mensagemSucesso = undefined;
    this.erro = undefined;
    this.mostrarFormulario = false;
    this.atualizarPickListMaterias();
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.resetarMudancasPendentes();
    this.materiasImportadasPendentes = undefined;
  }

  get labelAcaoPrincipal(): string {
    if (this.salvando) {
      return 'Salvando...';
    }
    return '+ Novo edital';
  }

  get podeExcluirEdital(): boolean {
    if (this.obterEditalSelecionadoParaAcao()) {
      return true;
    }
    const formId = this.form.get('id')?.value as number | null;
    return !!formId;
  }

  acaoPrincipal(): void {
    this.router.navigate(['/area-restrita/cadastro-editais']);
  }

  abrirModalTemplates(importacao = false): void {
    this.modoImportacao = importacao;
    this.mostrarModalTemplates = true;
    this.mensagemTemplateOk = undefined;
    this.templatesErro = undefined;
    this.limparFiltrosTemplates();
    this.carregarTemplates();
  }

  fecharModalTemplates(): void {
    this.mostrarModalTemplates = false;
    this.mensagemTemplateOk = undefined;
    this.templatesErro = undefined;
    this.limparImagensTemplates();
    this.modoImportacao = false;
    this.importandoTemplate = false;
  }

  editar(edital: Edital, mostrarFormularioAoEditar = true): void {
    this.editalEmEdicao = edital;
    this.editalSelecionado = edital;
    this.mostrarFormulario = mostrarFormularioAoEditar;

    const materiasIds = edital.materias?.map(m => m.materiaId) || [];

    this.aplicarSemRastrearMudancas(() => {
      this.form.patchValue({
        id: edital.id,
        nome: edital.nome,
        cargo: edital.cargo || '',
        descricao: edital.descricao,
        dataProva: edital.dataProva,
        materiasIds
      });
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.resetarMudancasPendentes();

    if (!edital?.id) {
      return;
    }

    if (!mostrarFormularioAoEditar) {
      this.mensagemSucesso = undefined;
      this.erro = undefined;
      this.atualizarPickListMaterias();
      return;
    }

    this.editalService.buscarPorId(edital.id).subscribe({
      next: (detalhe) => {
        if (!detalhe || this.temMudancasNaoSalvas) {
          return;
        }

        const materiasDetalhe = (detalhe.materias?.length ? detalhe.materias : edital.materias) || [];
        const materiasIdsDetalhe = materiasDetalhe.map(m => m.materiaId);

        this.editalSelecionado = { ...edital, ...detalhe, materias: materiasDetalhe };
        this.editalEmEdicao = this.editalSelecionado;
        this.atualizarEditalNaLista(this.editalSelecionado);

        this.aplicarSemRastrearMudancas(() => {
          this.form.patchValue({
            id: detalhe.id,
            nome: detalhe.nome ?? edital.nome,
            cargo: detalhe.cargo ?? edital.cargo ?? '',
            descricao: detalhe.descricao ?? edital.descricao,
            dataProva: detalhe.dataProva ?? edital.dataProva,
            materiasIds: materiasIdsDetalhe
          });
        });

        this.form.markAsPristine();
        this.form.markAsUntouched();
        this.resetarMudancasPendentes();
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar edital por ID:', err);
      }
    });

    this.mensagemSucesso = undefined;
    this.erro = undefined;
    this.atualizarPickListMaterias();
  }

  excluir(edital: Edital): void {
    console.log('[EDITAIS] excluir()', edital);
    if (!edital.id) {
      return;
    }

    const confirmou = window.confirm(`Excluir o edital "${edital.nome}"?`);
    if (!confirmou) {
      return;
    }

    const materias = (edital.materias || []).filter((m) => !!m?.materiaId);
    const desvincularMateriasDelete$: any = materias.length
      ? forkJoin(
          materias.map((m) =>
            this.editalService
              .atualizarStatusMateria(edital.id as number, m.materiaId, false)
              .pipe(catchError(() => of(null)))
          )
        )
      : of(null);

    desvincularMateriasDelete$.subscribe({
      next: () => {
        console.log('[EDITAIS] materias desvinculadas');
        console.log('[EDITAIS] chamando DELETE', edital.id);
        this.editalService.excluir(edital.id as number).subscribe({
          next: () => {
            this.mensagemSucesso = 'Edital excluido com sucesso.';
            this.carregarEditais();
            this.novoEdital();
          },
          error: (err: any) => {
            console.error('[EDITAIS] Erro ao excluir edital:', err);
            this.erro = 'Erro ao excluir edital. Tente novamente.';
          }
        });
      },
      error: (err: any) => {
        console.error('[EDITAIS] Erro ao desvincular materias:', err);
        this.erro = 'Erro ao desvincular materias do edital.';
      }
    });
    return;
  }

/*
    const desvincularMaterias$ = (edital.materias || []).length
      ? forkJoin(
          (edital.materias || []).map((m) =>
            this.editalService
              .atualizarStatusMateria(edital.id as number, m.materiaId, false)
              .pipe(catchError(() => of(null)))
          )
        )
      : of(null);

    desvincularMaterias$
      .pipe(
        switchMap(() => this.editalService.excluir(edital.id as number))
      )
      .subscribe({
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
*/

  definirComoEmEstudo(edital: Edital): void {
    if (!edital?.id) {
      return;
    }

    if (this.definindoAtivoId) {
      return;
    }

    this.definindoAtivoId = edital.id;
    this.erro = undefined;
    this.mensagemSucesso = undefined;

    const acao$ = edital.ativo
      ? this.editalService.desmarcarEdital(edital.id)
      : this.editalService.selecionarEdital(edital.id);

    acao$.subscribe({
      next: () => {
        const novoAtivo = !edital.ativo;
        edital.ativo = novoAtivo;
        this.atualizarEditalAtivoLocal(edital.id!, novoAtivo);
        this.mensagemSucesso = edital.ativo
          ? `Edital "${edital.nome}" marcado como em estudo.`
          : `Edital "${edital.nome}" desmarcado.`;
        this.iniciarTimeoutMensagem();
        this.definindoAtivoId = null;
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao alterar edital em estudo:', err);
        this.definindoAtivoId = null;
        this.erro = 'Erro ao atualizar o edital. Tente novamente.';
      }
    });
  }

  private atualizarEditalAtivoLocal(editalId: number, ativo: boolean): void {
    const encontrado = (this.editais || []).find(e => e.id === editalId);
    if (encontrado) {
      encontrado.ativo = ativo;
    }
    (this.editalTreeNodes || []).forEach((node) => {
      if (node.data?.tipo !== 'EDITAL') {
        return;
      }
      if (node.data?.editalId === editalId) {
        node.data.ativo = ativo;
        return;
      }
    });
  }

  importarTemplateSelecionado(): void {
    if (!this.templateSelecionadoId) {
      return;
    }
    this.importandoTemplate = true;
    forkJoin({
      estrutura: this.editalTemplateService.buscarEstrutura(this.templateSelecionadoId),
      template: this.editalTemplateService.buscarTemplate(this.templateSelecionadoId)
    })
      .pipe(
        switchMap(({ estrutura, template }) =>
          this.garantirMateriasTemplate(estrutura).pipe(
            switchMap(() => this.materiaService.listarMaterias()),
            tap((lista) => {
              this.materias = lista || [];
              this.atualizarPickListMaterias();
            }),
            tap(() => this.aplicarEstruturaImportada(estrutura, template))
          )
        )
      )
      .subscribe({
        next: () => {
          this.importandoTemplate = false;
          this.fecharModalTemplates();
          this.mostrarModalVincularMaterias = true;
        },
        error: (err) => {
          console.error('[EDITAIS] Erro ao importar template:', err);
          this.templatesErro = 'Não foi possível importar este edital.';
          this.importandoTemplate = false;
        }
      });
  }

  private aplicarEstruturaImportada(estrutura: EstruturaTemplateDTO, template?: EditalTemplateDTO): void {
    const nomeTemplate = estrutura.nomeTemplate?.trim() || '';
    const nomeBase = nomeTemplate || template?.nome?.trim() || this.form.get('nome')?.value;
    const dataProvaTemplate =
      (template as any)?.dataProva ||
      (template as any)?.dataProvaEdital ||
      (estrutura as any)?.dataProva ||
      null;
    const nomesTemplate = this.obterMateriasTemplate(estrutura)
      .map((m) => this.normalizarTexto(this.extrairNomeMateriaTemplate(m)))
      .filter((nome): nome is string => !!nome);

    const ids = (this.materias || [])
      .filter((materia) => this.correspondeMateriaTemplate(materia.nome || '', nomesTemplate))
      .map((materia) => materia.id as number);

    this.form.patchValue({
      id: null,
      nome: nomeBase,
      cargo: this.getTemplateCargo(template) || this.form.get('cargo')?.value || '',
      dataProva: dataProvaTemplate,
      materiasIds: ids
    });

    if (!this.materias.length && nomesTemplate.length) {
      this.materiasImportadasPendentes = nomesTemplate;
    }

    this.form.markAsDirty();
    this.marcarMudancasPendentes();
    this.atualizarPickListMaterias();
  }

  private aplicarMateriasImportadasPendentes(): void {
    if (!this.materiasImportadasPendentes?.length) {
      return;
    }
    const nomesTemplate = this.materiasImportadasPendentes;
    this.materiasImportadasPendentes = undefined;

    const ids = (this.materias || [])
      .filter((materia) => this.correspondeMateriaTemplate(materia.nome || '', nomesTemplate))
      .map((materia) => materia.id as number);

    this.form.patchValue({ materiasIds: ids });
    this.form.markAsDirty();
    this.marcarMudancasPendentes();
    this.atualizarPickListMaterias();
  }

  private garantirMateriasTemplate(estrutura: EstruturaTemplateDTO) {
    const materiasTemplate = this.obterMateriasTemplate(estrutura)
      .map((m) => {
        const nome = this.extrairNomeMateriaTemplate(m).trim();
        return {
          normal: this.normalizarTexto(nome),
          original: nome
        };
      })
      .filter((item) => item.normal);

    if (!materiasTemplate.length) {
      return of(void 0);
    }

    const nomesUnicos = new Map<string, string>();
    for (const item of materiasTemplate) {
      if (!nomesUnicos.has(item.normal)) {
        nomesUnicos.set(item.normal, item.original);
      }
    }

    const criarFaltantes = (materias: Materia[]) => {
      const existentes = new Set(
        (materias || []).map((m) => this.normalizarTexto(m.nome || ''))
      );
      const faltantes = Array.from(nomesUnicos.entries())
        .filter(([normal]) => !existentes.has(normal))
        .map(([, original]) => original)
        .filter((nome) => !!nome);

      if (!faltantes.length) {
        return of(void 0);
      }

      return forkJoin(
        faltantes.map((nome) => this.materiaService.salvarMateria({ nome }))
      ).pipe(map(() => void 0));
    };

    if (!this.materias.length) {
      return this.materiaService.listarMaterias().pipe(
        tap((lista) => {
          this.materias = lista || [];
        }),
        switchMap((lista) => criarFaltantes(lista || []))
      );
    }

    return criarFaltantes(this.materias);
  }

  private obterMateriasTemplate(estrutura: EstruturaTemplateDTO): any[] {
    return (
      estrutura.materias ||
      (estrutura as any).materiasTemplate ||
      (estrutura as any).disciplinas ||
      (estrutura as any).materiasEdital ||
      []
    );
  }

  private extrairNomeMateriaTemplate(materia: any): string {
    if (!materia) {
      return '';
    }
    if (typeof materia === 'string') {
      return materia;
    }
    return (
      materia.nome ||
      materia.descricao ||
      materia.materiaNome ||
      materia.nomeMateria ||
      materia.titulo ||
      materia.name ||
      materia.label ||
      materia.materia?.nome ||
      materia.materia?.descricao ||
      ''
    );
  }

  private normalizarTexto(valor: string): string {
    return (valor || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private getTemplateArea(template?: EditalTemplateDTO | null): string {
    if (!template) return '';
    return template.areaNome || template.area || '';
  }

  private getTemplateAbrangencia(template?: EditalTemplateDTO | null): string {
    if (!template) return '';
    return (template.abrangencia as any) || '';
  }

  private getTemplateCargo(template?: EditalTemplateDTO | null): string {
    if (!template) return '';
    return template.cargoNome || template.cargo || '';
  }

  private correspondeMateriaTemplate(nomeMateria: string, nomesTemplate: string[]): boolean {
    const normal = this.normalizarTexto(nomeMateria);
    if (!normal || !nomesTemplate.length) {
      return false;
    }

    return nomesTemplate.some((nomeTemplate) => {
      if (!nomeTemplate) {
        return false;
      }
      return (
        normal === nomeTemplate ||
        normal.includes(nomeTemplate) ||
        nomeTemplate.includes(normal)
      );
    });
  }

  selecionarEdital(edital: Edital): void {
    this.editalSelecionado = edital;
  }

  onEditalLinhaClick(node: TreeNode, event?: Event): void {
    if (this.editingNodeKey && this.editingNodeKey !== String(node?.key || '')) {
      this.cancelarEdicaoNode();
    }
    const target = event?.target instanceof Element ? event.target : null;
    const clicouToggler = !!target?.closest('.p-tree-toggler, .p-tree-toggler-icon');
    const clicouAcao = !!target?.closest('.status-switch, .edital-tree-action-btn');

    if (!clicouToggler && !clicouAcao) {
      event?.stopPropagation();
    }

    if (clicouToggler || clicouAcao) {
      return;
    }

    this.currentTreeNodeKey = String(node?.key || '');

    const editalId = node?.data?.editalId as number | undefined;
    if (!editalId) return;
    if (node?.data?.tipo === 'EDITAL') {
      this.toggleEdital(editalId);
      this.montarArvoreEditais();
    }

    const encontrado = this.editais.find(e => e.id === editalId);
    if (encontrado) {
      this.editalSelecionado = encontrado;
      this.editar(encontrado, false);
    }
  }

  iniciarEdicaoNode(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    if (!node?.data || node.data.tipo === 'EDITAL') {
      return;
    }
    this.currentTreeNodeKey = String(node?.key || '');
    this.editingNodeKey = String(node?.key || '');
    this.editingLabel = String(node?.label || node?.data?.label || '').trim();
  }

  cancelarEdicaoNode(): void {
    this.editingNodeKey = null;
    this.editingLabel = '';
  }

  onEditNodeKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.cancelarEdicaoNode();
    }
  }

  confirmarEdicaoNode(node: TreeNode): void {
    const label = String(this.editingLabel || '').trim();
    if (!label || !node?.data) {
      this.cancelarEdicaoNode();
      return;
    }

    if (node.data.tipo === 'MATERIA') {
      const materiaId = Number(node.data?.materiaId || 0);
      const materiaAtual = this.materias.find((m) => Number(m?.id || 0) === materiaId);
      if (!materiaAtual) {
        this.erro = 'Nao foi possivel localizar a materia para editar.';
        this.cancelarEdicaoNode();
        return;
      }

      this.materiaService.salvarMateria({ ...materiaAtual, nome: label }).subscribe({
        next: () => {
          node.label = label;
          node.data.label = label;
          materiaAtual.nome = label;
          const edital = this.editais.find((e) => Number(e?.id || 0) === Number(node.data?.editalId || 0));
          const materiaEdital = edital?.materias?.find((m) => Number(m?.materiaId || 0) === materiaId);
          if (materiaEdital) {
            materiaEdital.materiaNome = label;
          }
          this.cancelarEdicaoNode();
          this.mensagemSucesso = 'Materia atualizada com sucesso.';
          this.iniciarTimeoutMensagem();
          this.forcarAtualizacaoArvore();
        },
        error: () => {
          this.erro = 'Erro ao atualizar a materia.';
          this.cancelarEdicaoNode();
        }
      });
      return;
    }

    if (node.data.tipo === 'TOPICO') {
      const materiaId = Number(node.data?.materiaId || 0);
      const topicoId = Number(node.data?.topicoId || 0);
      const editalId = Number(node.data?.editalId || 0);
      const payload: any = {
        id: topicoId,
        descricao: label,
        ativo: node.data?.ativo !== false
      };

      const parentTopicoId = Number(node.parent?.data?.tipo === 'TOPICO' ? node.parent?.data?.topicoId || 0 : 0);
      if (parentTopicoId > 0) {
        payload.topicoPaiId = parentTopicoId;
      }

      this.materiaService.salvarTopico(materiaId, payload).subscribe({
        next: () => {
          node.label = label;
          node.data.label = label;
          this.atualizarDescricaoTopicoLocal(editalId, materiaId, topicoId, label);
          this.cancelarEdicaoNode();
          this.mensagemSucesso = 'Topico atualizado com sucesso.';
          this.iniciarTimeoutMensagem();
          this.forcarAtualizacaoArvore();
        },
        error: () => {
          this.erro = 'Erro ao atualizar o topico.';
          this.cancelarEdicaoNode();
        }
      });
    }
  }

  private atualizarDescricaoTopicoLocal(
    editalId: number,
    materiaId: number,
    topicoId: number,
    descricao: string
  ): void {
    const edital = this.editais.find((e) => Number(e?.id || 0) === editalId);
    const materia = edital?.materias?.find((m) => Number(m?.materiaId || 0) === materiaId);
    if (!materia) {
      return;
    }

    const atualizar = (topicos: any[]): boolean => {
      for (const topico of topicos || []) {
        const idAtual = Number(
          topico?.id ??
          topico?.topicoId ??
          topico?.subtopicoId ??
          topico?.idTopico ??
          topico?.idSubtopico ??
          0
        );

        if (idAtual === topicoId) {
          topico.descricao = descricao;
          return true;
        }

        const filhos = topico?.subtopicos || topico?.filhos || [];
        if (filhos.length && atualizar(filhos)) {
          return true;
        }
      }
      return false;
    };

    atualizar(materia.topicos || []);
  }

  ativarConteudo(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    this.currentTreeNodeKey = String(node?.key || '');
    if (!node?.data) return;
    if (node.data.tipo === 'MATERIA') {
      this.adicionarNodeNaSelecao(node);
      this.atualizarStatusMateriaNode(node, true);
      return;
    }
    if (node.data.tipo === 'TOPICO') {
      this.marcarTopicoComFilhos(node);
    }
  }

  desativarConteudo(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    this.currentTreeNodeKey = String(node?.key || '');
    if (!node?.data) return;
    if (node.data.tipo === 'MATERIA') {
      this.removerNodeDaSelecao(node);
      this.atualizarStatusMateriaNode(node, false);
      return;
    }
    if (node.data.tipo === 'TOPICO') {
      this.desmarcarTopicoComFilhos(node);
    }
  }

  onEditalTreeSelect(event: any): void {
    const node = event?.node as TreeNode | undefined;
    if (!node?.data) return;
    this.definirEditalSelecionadoPorNode(node);
    if (node.data.tipo === 'EDITAL') {
      const editalId = node.data.editalId as number | undefined;
      const encontrado = (this.editais || []).find(e => e.id === editalId);
      if (encontrado && !encontrado.ativo) {
        this.definirComoEmEstudo(encontrado);
      }
      return;
    }
    if (node.data.tipo === 'MATERIA') {
      this.atualizarStatusMateriaNode(node, true);
      return;
    }
    if (node.data.tipo === 'TOPICO') {
      this.marcarTopicoComFilhos(node);
    }
  }

  onEditalTreeSelectionChange(value: TreeNode[] | TreeNode | null): void {
    if (Array.isArray(value)) {
      this.selectedEditalNodes = value;
      return;
    }
    if (value) {
      this.selectedEditalNodes = [value];
      return;
    }
    this.selectedEditalNodes = [];
  }

  isNodeAtivo(node?: TreeNode): boolean {
    if (!node?.data) return false;
    if (node.data.tipo === 'EDITAL') {
      return node.data?.ativo === true;
    }
    return this.isNodeSelecionado(node);
  }

  onEditalTreeUnselect(event: any): void {
    const node = event?.node as TreeNode | undefined;
    if (!node?.data) return;
    this.definirEditalSelecionadoPorNode(node);
    if (node.data.tipo === 'EDITAL') {
      const editalId = node.data.editalId as number | undefined;
      const encontrado = (this.editais || []).find(e => e.id === editalId);
      if (encontrado && encontrado.ativo) {
        this.definirComoEmEstudo(encontrado);
      }
      return;
    }
    if (node.data.tipo === 'MATERIA') {
      this.atualizarStatusMateriaNode(node, false);
      return;
    }
    if (node.data.tipo === 'TOPICO') {
      this.desmarcarTopicoComFilhos(node);
    }
  }

  private desmarcarTopicoComFilhos(node: TreeNode): void {
    this.marcarMudancasPendentes();
    this.removerNodeDaSelecao(node);
    this.atualizarStatusTopicoNode(node, false);
    this.desmarcarPaisSeNecessario(node);

    if (!node.children?.length) {
      return;
    }

    for (const child of node.children) {
      if (child?.data?.tipo === 'TOPICO') {
        this.desmarcarTopicoComFilhos(child);
      }
    }
  }

  private removerNodeDaSelecao(node?: TreeNode): void {
    if (!node?.key) {
      return;
    }
    const selecionados = this.selectedEditalNodes || [];
    if (!selecionados.length) {
      return;
    }
    this.selectedEditalNodes = selecionados.filter((item) => item.key !== node.key);
  }

  private marcarTopicoComFilhos(node: TreeNode): void {
    this.marcarMudancasPendentes();
    this.adicionarNodeNaSelecao(node);
    this.atualizarStatusTopicoNode(node, true);
    this.marcarPaisSeNecessario(node);

    if (!node.children?.length) {
      return;
    }

    for (const child of node.children) {
      if (child?.data?.tipo === 'TOPICO') {
        this.marcarTopicoComFilhos(child);
      }
    }
  }

  private adicionarNodeNaSelecao(node?: TreeNode): void {
    if (!node?.key) {
      return;
    }
    const selecionados = this.selectedEditalNodes || [];
    if (selecionados.some((item) => item.key === node.key)) {
      return;
    }
    this.selectedEditalNodes = [...selecionados, node];
  }

  private marcarPaisSeNecessario(node: TreeNode): void {
    let parent = node.parent as TreeNode | undefined;
    while (parent && parent.data?.tipo === 'TOPICO') {
      this.adicionarNodeNaSelecao(parent);
      this.atualizarStatusTopicoNode(parent, true);
      parent = parent.parent as TreeNode | undefined;
    }
  }

  private desmarcarPaisSeNecessario(node: TreeNode): void {
    let parent = node.parent as TreeNode | undefined;
    while (parent && parent.data?.tipo === 'TOPICO') {
      const temFilhoSelecionado = (parent.children || []).some((child) => this.isNodeSelecionado(child));
      if (temFilhoSelecionado) {
        break;
      }
      this.removerNodeDaSelecao(parent);
      this.atualizarStatusTopicoNode(parent, false);
      parent = parent.parent as TreeNode | undefined;
    }
  }

  private isNodeSelecionado(node?: TreeNode): boolean {
    if (!node?.key) return false;
    return (this.selectedEditalNodes || []).some((n) => n.key === node.key);
  }

  onEditalTreeExpand(event: any): void {
    const node = event?.node as TreeNode | undefined;
    if (!node?.data || node.data.tipo !== 'MATERIA') return;
    if (node.children && node.children.length) return;

    const materiaId = node.data.materiaId as number;
    if (!materiaId) return;

    this.materiaService.listarTopicos(materiaId).subscribe({
      next: (lista) => {
        const selecionados: TreeNode[] = [];
        node.children = this.construirTopicosTreeNodes(
          lista || [],
          node.data.editalId,
          materiaId,
          '',
          selecionados
        );
        if (selecionados.length) {
          const atual = this.selectedEditalNodes || [];
          const mapa = new Map<string, TreeNode>();
          atual.forEach(item => {
            if (item.key) {
              mapa.set(item.key, item);
            }
          });
          selecionados.forEach(item => {
            if (item.key && !mapa.has(item.key)) {
              mapa.set(item.key, item);
            }
          });
          this.selectedEditalNodes = Array.from(mapa.values());
        }
      },
      error: () => {
        node.children = [];
      }
    });
  }

  acaoDefinirComoEmEstudoSelecionado(): void {
    if (!this.editalSelecionado) return;
    this.definirComoEmEstudo(this.editalSelecionado);
  }

  toggleEditalEmEstudo(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    const editalId = node?.data?.editalId as number | undefined;
    if (!editalId) return;
    const encontrado = (this.editais || []).find(e => e.id === editalId);
    if (!encontrado) return;
    this.definirComoEmEstudo(encontrado);
  }

  acaoEditarSelecionado(): void {
    if (!this.editalSelecionado?.id) return;
    this.router.navigate(['/area-restrita/cadastro-editais', this.editalSelecionado.id]);
  }

  acaoExcluirSelecionado(): void {
    console.log('[EDITAIS] acaoExcluirSelecionado');
    const edital = this.obterEditalSelecionadoParaAcao();
    const editalId = edital?.id ?? (this.form.get('id')?.value as number | null);
    if (!editalId) {
      this.erro = 'Selecione um edital para excluir.';
      return;
    }

    if (edital?.id) {
      this.excluir(edital);
      return;
    }

    this.editalService.buscarPorId(editalId).subscribe({
      next: (detalhe) => {
        const resolvido = detalhe
          ? { ...detalhe, id: detalhe.id ?? editalId }
          : ({ id: editalId, nome: '', materias: [] } as Edital);
        this.excluir(resolvido);
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar edital para excluir:', err);
        this.erro = 'Erro ao preparar exclusao do edital. Tente novamente.';
      }
    });
  }

  abrirModalVincularMaterias(): void {
    if (!this.editalSelecionado) return;
    this.editar(this.editalSelecionado, false);
    this.erro = undefined;
    this.mensagemSucesso = undefined;
    this.mostrarModalVincularMaterias = true;
  }

  abrirModalVincularMateriasParaNovoEdital(): void {
    this.novoEdital();
    this.erro = undefined;
    this.mensagemSucesso = undefined;
    this.mostrarModalVincularMaterias = true;
  }

  fecharModalVincularMaterias(): void {
    this.mostrarModalVincularMaterias = false;
    this.mostrarFormulario = false;
  }

  private montarArvoreEditais(): void {
    const nodes: TreeNode[] = [];
    const selecionados: TreeNode[] = [];

    (this.editais || []).forEach((edital) => {
      const editalId = edital.id as number;
      const materias = edital.materias || [];

      const editalAberto = this.editaisAbertos.has(editalId);
      const materiaNodes = materias.map((m) => {
        const topicos = m.topicos || [];
        const selecionadosAntes = selecionados.length;
        const node: TreeNode = {
          key: `edital-${editalId}-materia-${m.materiaId}`,
          label: m.materiaNome,
          styleClass: 'materia-node',
          data: {
            tipo: 'MATERIA',
            editalId,
            materiaId: m.materiaId,
            ativo: m.ativo === undefined ? true : m.ativo,
            percentualEstudado: m.percentualEstudado,
            nivelDominio: m.nivelDominio
          },
          selectable: true,
          expanded: editalAberto,
          leaf: topicos.length === 0,
          children: this.construirTopicosTreeNodes(topicos, editalId, m.materiaId, '', selecionados, editalAberto)
        };
        const selecionadosDepois = selecionados.length;
        if (selecionadosDepois > selecionadosAntes) {
          node.data.ativo = true;
          selecionados.push(node);
        }
        return node;
      });

      const editalNode: TreeNode = {
        key: `edital-${editalId}`,
        label: edital.nome,
        styleClass: 'edital-node',
        data: {
          tipo: 'EDITAL',
          editalId,
          ativo: edital.ativo,
          dataProva: edital.dataProva,
          percentualEstudadoGeral: edital.percentualEstudadoGeral,
          nivelDominioGeral: edital.nivelDominioGeral
        },
        selectable: false,
        expanded: editalAberto,
        children: materiaNodes
      };

      nodes.push(editalNode);
    });

    this.editalTreeNodes = nodes;
    this.selectedEditalNodes = selecionados;
  }

  private atualizarEditalNaLista(editalAtualizado: Edital): void {
    if (!editalAtualizado?.id) {
      return;
    }
    const idx = (this.editais || []).findIndex((e) => e.id === editalAtualizado.id);
    if (idx < 0) {
      return;
    }
    this.editais[idx] = { ...this.editais[idx], ...editalAtualizado };
    this.montarArvoreEditais();
  }

  private forcarAtualizacaoArvore(): void {
    this.editalTreeNodes = [...(this.editalTreeNodes || [])];
  }

  private atualizarStatusMateriaNode(node: TreeNode, ativo: boolean): void {
    const editalId = node.data?.editalId as number | undefined;
    const materiaId = node.data?.materiaId as number | undefined;
    if (!editalId || !materiaId) return;

    this.editalService.atualizarStatusMateria(editalId, materiaId, ativo).subscribe({
      next: () => {
        node.data.ativo = ativo;
        const edital = this.editais.find(e => e.id === editalId);
        const materia = edital?.materias?.find(m => m.materiaId === materiaId);
        if (materia) {
          (materia as any).ativo = ativo;
        }
      },
      error: () => {
        if (ativo) {
          this.selectedEditalNodes = (this.selectedEditalNodes || []).filter(n => n.key !== node.key);
        } else {
          const atual = this.selectedEditalNodes || [];
          if (!atual.some(n => n.key === node.key)) {
            this.selectedEditalNodes = [...atual, node];
          }
        }
      }
    });
  }

  private atualizarStatusTopicoNode(node: TreeNode, ativo: boolean): void {
    const editalId = node.data?.editalId as number | undefined;
    const topicoId = node.data?.topicoId as number | undefined;
    if (!editalId || !topicoId) return;

    this.editalService.atualizarStatusTopico(editalId, topicoId, ativo).subscribe({
      next: () => {
        node.data.ativo = ativo;
      },
      error: () => {
        if (ativo) {
          this.selectedEditalNodes = (this.selectedEditalNodes || []).filter(n => n.key !== node.key);
        } else {
          const atual = this.selectedEditalNodes || [];
          if (!atual.some(n => n.key === node.key)) {
            this.selectedEditalNodes = [...atual, node];
          }
        }
      }
    });
  }

  private definirEditalSelecionadoPorNode(node?: TreeNode): void {
    const editalId = node?.data?.editalId as number | undefined;
    if (!editalId) return;
    const encontrado = this.editais.find(e => e.id === editalId);
    if (!encontrado) return;
    this.editalSelecionado = encontrado;
    const formId = this.form.get('id')?.value as number | null;
    if (formId !== editalId) {
      this.editar(encontrado, false);
    }
  }

  private obterEditalSelecionadoParaAcao(): Edital | null {
    if (this.editalSelecionado?.id) {
      return this.editalSelecionado;
    }
    if (this.editalEmEdicao?.id) {
      return this.editalEmEdicao;
    }
    const formId = this.form.get('id')?.value as number | null;
    if (formId) {
      const encontrado = (this.editais || []).find(e => e.id === formId);
      if (encontrado) {
        return encontrado;
      }
    }
    const node = (this.selectedEditalNodes || []).find(n => n?.data?.tipo === 'EDITAL')
      || (this.selectedEditalNodes || []).find(n => n?.data?.editalId);
    const editalId = node?.data?.editalId as number | undefined;
    if (!editalId) {
      return null;
    }
    return (this.editais || []).find(e => e.id === editalId) || null;
  }

  private construirTopicosTreeNodes(
    topicos: any[],
    editalId: number,
    materiaId: number,
    caminho: string,
    selecionados: TreeNode[] = [],
    expandido = false
  ): TreeNode[] {
    return (topicos || []).map((t, index) => {
      const id =
        t.id ?? t.topicoId ?? t.subtopicoId ?? t.idTopico ?? t.idSubtopico ?? index;
      const novoCaminho = caminho ? `${caminho}.${index}` : String(index);
      const filhos = t.subtopicos || t.filhos || [];
      const filhosNodes = this.construirTopicosTreeNodes(filhos, editalId, materiaId, novoCaminho, selecionados, expandido);
      const ativoFilhos = filhosNodes.some((f) => f?.data?.ativo);
      const ativo = (t.ativo === undefined ? true : t.ativo) || ativoFilhos;
      const node: TreeNode = {
        key: `topico-${editalId}-${materiaId}-${novoCaminho}-${id}`,
        label: t.descricao,
        styleClass: 'topico-node',
        data: {
          tipo: 'TOPICO',
          materiaId,
          topicoId: id,
          editalId,
          ativo
        },
        selectable: true,
        expanded: expandido,
        children: filhosNodes
      };
      if (ativo) {
        selecionados.push(node);
      }
      return node;
    });
  }

  // ============= SUBMIT =============

  salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.erro = 'Preencha os campos obrigat\u00f3rios para salvar.';
      this.mensagemSucesso = undefined;
      this.iniciarTimeoutMensagem();
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
      cargo: raw.cargo,
      descricao: raw.descricao,
      dataProva: raw.dataProva,   // já vem 'yyyy-MM-dd'
      materiasIds
    };

    const rawId = raw.id as number | null | undefined;
    const id = rawId ?? (this.editalSelecionado?.id ?? null);

    const obs = id
      ? this.editalService.atualizar(id, payload)
      : this.editalService.criar(payload);

    obs.subscribe({
      next: () => {
        this.salvando = false;
        this.mensagemSucesso = 'Edital salvo com sucesso.';
        this.iniciarTimeoutMensagem();
        this.resetarMudancasPendentes();
        this.carregarEditais();
        this.mostrarModalVincularMaterias = false;
        this.mostrarFormulario = false;
        if (!id) {
          this.novoEdital();
          this.mostrarFormulario = false;
        }
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao salvar edital:', err);
        this.salvando = false;
        this.erro = 'Erro ao salvar edital. Tente novamente.';
      }
    });
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
  
  private iniciarTimeoutMensagem(): void {
  // se já tiver um timeout pendente, limpa pra não acumular
  if (this.mensagemTimeout) {
    clearTimeout(this.mensagemTimeout);
  }

  this.mensagemTimeout = setTimeout(() => {
    this.mensagemSucesso = '';
    this.erro = '';
    this.mensagemTimeout = null;
  }, 4000); // 4 segundos – ajusta se quiser mais/menos tempo
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

  getDominioEdital(edital?: Edital | null): number {
    const dominio = Number(edital?.nivelDominioGeral ?? 0) || 0;
    const progresso = Number(edital?.percentualEstudadoGeral ?? 0) || 0;
    return Math.min(dominio, progresso);
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

  // Verifica se a matéria está selecionada no form
// Verifica se a matéria está selecionada no form
isMateriaSelecionada(id?: number): boolean {
  // se não tiver id, não tem como estar selecionada
  if (id == null) {
    return false;
  }

  const control = this.form.get('materiasIds');
  if (!control) {
    return false;
  }

  const selecionadas = (control.value as number[] | null) ?? [];
  return selecionadas.includes(id);
}

// Alterna seleção ao clicar no chip
  toggleMateriaSelecionada(id?: number): void {
  // se não tiver id, não faz nada
  if (id == null) {
    return;
  }

  const control = this.form.get('materiasIds');
  if (!control) {
    return;
  }

  let selecionadas = (control.value as number[] | null) ?? [];

  if (selecionadas.includes(id)) {
    // remove
    selecionadas = selecionadas.filter(x => x !== id);
  } else {
    // adiciona
    selecionadas = [...selecionadas, id];
  }

  control.setValue(selecionadas);
  control.markAsDirty();
  control.updateValueAndValidity();
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

}
