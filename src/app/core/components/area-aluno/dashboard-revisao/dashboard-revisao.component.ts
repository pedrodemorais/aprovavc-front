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

  // totais para o resumo superior
  totalVencidas = 0;
  totalHoje = 0;
  totalFuturas = 0;

  constructor(
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarDados();
  }

  ngOnDestroy(): void {
    this.limparImagensTemplates();
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

  private atualizarTotais(): void {
    this.totalVencidas = this.revisoes.filter(r => r.status === 'VENCIDA').length;
    this.totalHoje     = this.revisoes.filter(r => r.status === 'EM_DIA').length;
    this.totalFuturas  = this.revisoes.filter(r => r.status === 'FUTURA').length;
  }

  irParaSala(item: RevisaoDashboardItem): void {
    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId } } // se quiser ja mandar o topico
    );
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
        this.templatesErro = 'Nao foi possivel carregar os templates.';
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
        this.templatesErro = 'Nao foi possivel criar o edital pelo template.';
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
