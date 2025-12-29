import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalaEstudoService } from '../services/sala-estudo.service';
import { MateriaService } from '../services/materia.service';
import { EditalService  } from '../services/edital.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { Materia } from '../models/materia.model';
import { Edital } from '../models/Edital';
import { EditalTemplateDTO } from 'src/app/core/area-admin/dto/edital-admin.dto';
import { AuthService } from 'src/app/site/services/auth.service';
@Component({
  selector: 'app-dashboard-revisao',
  templateUrl: './dashboard-revisao.component.html',
  styleUrls: ['./dashboard-revisao.component.css']
})
export class DashboardRevisaoComponent implements OnInit, OnDestroy {

  carregando = false;
  erro?: string;

  revisoes: RevisaoDashboardItem[] = [];
  materias: Materia[] = [];
  editais: Edital[] = [];
  activeEditais: Edital[] = [];
  mostrarGuia = false;

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

  usuarioNome = 'Usuário';
  editalAtivoNome = 'Nenhum edital selecionado';
  activeEditalImagemUrls: Record<number, string> = {};
  private activeEditalImagemObjectUrls = new Map<number, string>();
  modulosHoje = 1;
  revisoesHoje = 0;
  revisoesVencemHoje = 0;
  conteudoNovoSugerido = 'Direito Adm - Atos';
  sequenciaDias = 4;
  tempoSemana = '3h20';
  planoDisponivel = false;

  // totais para o resumo superior
  totalVencidas = 0;
  totalHoje = 0;
  totalFuturas = 0;

  constructor(
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarUsuarioNome();
    this.carregarDados();
  }

  ngOnDestroy(): void {
    this.limparImagensTemplates();
    this.limparImagensEditaisAtivos();
  }

  private carregarDados(): void {
    this.carregando = true;
    this.erro = undefined;

    forkJoin({
      revisoes: this.salaEstudoService.listarRevisoesDashboard(),
      materias: this.materiaService.listarMaterias(),
      editais: this.editalService.listar()
    }).subscribe({
      next: ({ revisoes, materias, editais }) => {
        this.revisoes = revisoes || [];
        this.materias = materias || [];
        this.editais = editais || [];
        this.atualizarTotais();
        this.atualizarEditalAtivoNome();
        this.carregando = false;

        if (!this.editais.length || !this.materias.length) {
          this.carregarTemplates();
        }
      },
      error: (err) => {
        console.error('[DASH-REVISAO] Erro ao carregar dados:', err);
        this.erro = 'Erro ao carregar seus dados.';
        this.carregando = false;
      }
    });
  }

  private carregarUsuarioNome(): void {
    this.authService.getUserData().subscribe({
      next: (user) => {
        const nome = user?.nome || user?.nomeAluno || '';
        this.usuarioNome = this.primeiroNome(nome) || this.usuarioNome;
      },
      error: () => {
        const nomeToken = this.authService.getUserNameFromToken() || '';
        this.usuarioNome = this.primeiroNome(nomeToken) || this.usuarioNome;
      }
    });
  }

  private primeiroNome(nomeCompleto: string): string {
    const nome = (nomeCompleto || '').trim();
    if (!nome) return '';
    return nome.split(/\s+/)[0] || '';
  }

  private atualizarTotais(): void {
    const vencidas = this.revisoes.filter(r => r.status === 'VENCIDA').length;
    const vencemHoje = this.revisoes.filter(r => r.status === 'EM_DIA').length;
    const futuras = this.revisoes.filter(r => r.status === 'FUTURA').length;

    this.totalVencidas = vencidas;
    this.totalHoje = vencemHoje;
    this.totalFuturas = futuras;

    this.revisoesHoje = vencidas + vencemHoje;
    this.revisoesVencemHoje = vencemHoje;
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

  private atualizarEditalAtivoNome(): void {
    const ativos = (this.editais || []).filter(e => e?.ativo && e?.id);
    this.activeEditais = ativos;
    if (!ativos.length) {
      this.editalAtivoNome = 'Nenhum edital selecionado';
      this.limparImagensEditaisAtivos();
      return;
    }

    const nomes = ativos.map(e => e.nome).filter(Boolean);
    this.editalAtivoNome = nomes.length ? nomes.join(' / ') : 'Edital selecionado';
    console.log('[DASH-REVISAO] Editais ativos:', ativos.map(e => ({
      id: e.id,
      nome: e.nome,
      imagem: (e as any)?.imagem ?? null,
      imagemBytesTipo: typeof (e as any)?.imagemBytes,
      imagemBytesTamanho: Array.isArray((e as any)?.imagemBytes)
        ? (e as any).imagemBytes.length
        : ((e as any)?.imagemBytes?.length || null)
    })));
    this.carregarImagensEditaisAtivos();
  }

  get editaisAtivosVisiveis(): Edital[] {
    return (this.activeEditais || []).slice(0, 3);
  }

  get editaisAtivosRestantes(): number {
    return Math.max(0, (this.activeEditais?.length || 0) - 3);
  }

  private carregarImagensEditaisAtivos(): void {
    this.limparImagensEditaisAtivos();
    for (const edital of this.activeEditais || []) {
      if (!edital?.id) continue;
      if (this.definirImagemEditalAtivoPorBytes(edital)) {
        continue;
      }

      const templateId = this.obterTemplateIdDoEdital(edital);
      if (!templateId) continue;
      this.carregarImagemEditalAtivo(edital.id, templateId);
    }
  }

  private obterTemplateIdDoEdital(edital: Edital): number | null {
    const anyEdital = edital as any;
    const templateId =
      anyEdital?.templateId ??
      anyEdital?.editalTemplateId ??
      anyEdital?.template?.id ??
      null;
    const idNum = Number(templateId);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }

  private carregarImagemEditalAtivo(editalId: number, templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        this.removerImagemEditalAtivo(editalId);

        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.activeEditalImagemObjectUrls.set(editalId, objectUrl);
          this.activeEditalImagemUrls[editalId] = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.activeEditalImagemUrls[editalId] = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.removerImagemEditalAtivo(editalId);
          });
      },
      error: () => {
        this.removerImagemEditalAtivo(editalId);
      }
    });
  }

  private definirImagemEditalAtivoPorBytes(edital: Edital): boolean {
    const anyEdital = edital as any;
    const bytes =
      anyEdital?.imagemBytes ??
      anyEdital?.imagem_bytes ??
      anyEdital?.imagemBase64 ??
      null;
    if (!bytes || !edital?.id) {
      return false;
    }

    let base64: string | null = null;
    if (typeof bytes === 'string') {
      base64 = bytes.trim();
    } else if (Array.isArray(bytes)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes));
    } else if (Array.isArray(bytes?.data)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes.data));
    }

    if (!base64) {
      return false;
    }

    if (base64.startsWith('data:image')) {
      this.activeEditalImagemUrls[edital.id] = base64;
      return true;
    }

    const contentType = this.inferirContentTypeImagem(anyEdital?.imagem);
    this.activeEditalImagemUrls[edital.id] = `data:${contentType};base64,${base64}`;
    return true;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private inferirContentTypeImagem(caminho?: string | null): string {
    const nome = (caminho || '').toLowerCase();
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    if (nome.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
  }

  onEditalAtivoImagemErro(editalId: number): void {
    this.removerImagemEditalAtivo(editalId);
  }

  private removerImagemEditalAtivo(editalId: number): void {
    const objectUrl = this.activeEditalImagemObjectUrls.get(editalId);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.activeEditalImagemObjectUrls.delete(editalId);
    }
    delete this.activeEditalImagemUrls[editalId];
  }

  private limparImagensEditaisAtivos(): void {
    for (const objectUrl of this.activeEditalImagemObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.activeEditalImagemObjectUrls.clear();
    this.activeEditalImagemUrls = {};
  }

  irParaSala(item: RevisaoDashboardItem): void {
    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId } } // se quiser já mandar o tópico
    );
  }

  irParaEditais(): void {
    this.router.navigate(['/area-restrita/editais']);
  }

  irParaBlocosEstudo(): void {
    this.router.navigate(['/area-restrita/blocos-estudo']);
  }

  getEditalCargo(edital: Edital): string {
    return String((edital as any)?.cargo || '').trim();
  }

  abrirGuia(): void {
    this.mostrarGuia = true;
  }

  fecharGuia(): void {
    this.mostrarGuia = false;
  }

  // =========================
  // TEMPLATES DE EDITAL (ONBOARDING)
  // =========================

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

        this.limparImagensTemplates();
        this.carregarImagensTemplates(this.templates);
      },
      error: (err) => {
        console.error('[DASH-TEMPLATES] Erro ao carregar templates:', err);
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
        this.carregarDados();
      },
      error: (err) => {
        console.error('[DASH-TEMPLATES] Erro ao clonar template:', err);
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

}





