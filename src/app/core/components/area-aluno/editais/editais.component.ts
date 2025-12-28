import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { EditalService } from '../services/edital.service';
import { EditalFormPayload } from '../services/edital.service';
import { Edital } from '../models/Edital';
import { Materia } from '../models/materia.model';
import { MateriaService } from '../services/materia.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { EditalTemplateDTO } from 'src/app/core/area-admin/dto/edital-admin.dto';

@Component({
  selector: 'app-editais',
  templateUrl: './editais.component.html',
  styleUrls: ['./editais.component.css']
})
export class EditaisComponent implements OnInit, OnDestroy {

  carregando = false;
  salvando = false;
  erro?: string;
  mensagemSucesso?: string;
  definindoAtivoId: number | null = null;
private mensagemTimeout: any; // para guardar o setTimeout

  editais: Edital[] = [];
  materias: Materia[] = [];

  form!: FormGroup;
  editalEmEdicao?: Edital | null;

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
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
    this.carregarEditais();
  }

  ngOnDestroy(): void {
    this.limparImagensTemplates();
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
      const areaOk = this.areaFiltro === 'todas' || t.area === this.areaFiltro;
      const abrangenciaOk = this.abrangenciaFiltro === 'todas' || t.abrangencia === this.abrangenciaFiltro;
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
      const valor = (t as any)?.[campo];
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

  abrirModalTemplates(): void {
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

  definirComoEmEstudo(edital: Edital): void {
    if (!edital?.id) {
      return;
    }

    this.definindoAtivoId = edital.id;
    this.erro = undefined;
    this.mensagemSucesso = undefined;

    this.editalService.definirComoAtivo(edital.id).subscribe({
      next: () => {
        this.definindoAtivoId = null;
        this.mensagemSucesso = `Edital \"${edital.nome}\" definido como o edital em estudo.`;
        this.iniciarTimeoutMensagem();
        this.carregarEditais();
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao definir edital ativo:', err);
        this.definindoAtivoId = null;
        this.erro = 'Erro ao definir o edital como ativo. Tente novamente.';
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
        this.iniciarTimeoutMensagem();
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

}
