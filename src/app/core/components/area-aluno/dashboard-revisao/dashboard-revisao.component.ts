import { Component, OnInit } from '@angular/core';
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
export class DashboardRevisaoComponent implements OnInit {

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

        this.usandoTemplatesNaoPublicados = !publicados.length && all.length > 0;
        this.templates = publicados.length ? publicados : all;
        this.templatesCarregando = false;

        if (!this.templateSelecionadoId && this.templates.length) {
          const first = this.templates[0];
          this.templateSelecionadoId = first.id;
          this.nomeEditalTemplate = first.nome || '';
          this.nomeEditalPersonalizado = false;
        }
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

}
