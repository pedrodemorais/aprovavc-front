import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SalaEstudoService, BibliotecaResumoDTO } from '../services/sala-estudo.service';
import { Topico } from '../models/topico.model';
import { Materia } from '../models/materia.model';

type ResumoItem = {
  topicoId: number;
  topicoDescricao: string;
  materiaId: number;
  materiaNome: string;
};

@Component({
  selector: 'app-biblioteca-resumo',
  templateUrl: './biblioteca-resumo.component.html',
  styleUrls: ['./biblioteca-resumo.component.css']
})
export class BibliotecaResumoComponent implements OnInit {
  materia?: Materia;
  topico?: Topico;
  anotacoesHtml: SafeHtml | null = null;
  carregando = false;
  carregandoResumo = false;
  erro?: string;
  resumos: ResumoItem[] = [];
  resumoIndex = -1;
  materiaFiltroId: number | null = null;
  private topicoIdInicial: number | null = null;
  private filaTopicosIds: number[] = [];
  private origemHoje = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private salaEstudoService: SalaEstudoService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const topicoId = Number(params.get('topicoId'));
      this.topicoIdInicial = Number.isFinite(topicoId) && topicoId > 0 ? topicoId : null;
      const queryMap = this.route.snapshot.queryParamMap;
      const materiaId = Number(queryMap.get('materiaId'));
      this.materiaFiltroId = Number.isFinite(materiaId) && materiaId > 0 ? materiaId : null;
      this.filaTopicosIds = this.parseTopicosQuery(queryMap.get('topicos'));
      this.origemHoje = String(queryMap.get('origem') || '').toLowerCase() === 'hoje';
      this.carregarResumosDisponiveis();
    });
  }

  voltar(): void {
    if (this.origemHoje) {
      this.router.navigate(['/area-restrita/hoje']);
      return;
    }
    this.router.navigate(['/area-restrita/biblioteca']);
  }

  irAnterior(): void {
    if (this.resumoIndex <= 0) return;
    this.definirResumoAtual(this.resumoIndex - 1);
  }

  irProximo(): void {
    if (this.resumoIndex < 0 || this.resumoIndex >= this.resumos.length - 1) return;
    this.definirResumoAtual(this.resumoIndex + 1);
  }

  get progressoFilaLabel(): string {
    if (!this.resumos.length || this.resumoIndex < 0) return '-/-';
    return `${this.resumoIndex + 1}/${this.resumos.length}`;
  }

  get podeIrAnterior(): boolean {
    return this.resumoIndex > 0;
  }

  get podeIrProximo(): boolean {
    return this.resumoIndex >= 0 && this.resumoIndex < this.resumos.length - 1;
  }

  get progressoPercentual(): number {
    if (!this.resumos.length || this.resumoIndex < 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((this.resumoIndex + 1) / this.resumos.length) * 100)));
  }

  private carregarResumo(topicoId: number): void {
    this.carregandoResumo = true;
    this.salaEstudoService.buscarAnotacoes(topicoId).subscribe({
      next: (resp) => {
        const anotacoes = resp?.anotacoes || '';
        this.anotacoesHtml = this.sanitizer.bypassSecurityTrustHtml(anotacoes);
        this.carregandoResumo = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar resumo:', err);
        this.erro = 'Erro ao carregar resumo.';
        this.carregandoResumo = false;
      }
    });
  }

  private carregarResumosDisponiveis(): void {
    this.carregando = true;
    this.erro = undefined;
    this.resumos = [];
    this.resumoIndex = -1;

    this.salaEstudoService.listarBibliotecaResumos({
      materiaId: this.filaTopicosIds.length ? null : this.materiaFiltroId
    }).subscribe({
      next: (lista: BibliotecaResumoDTO[]) => {
        const mapeados = (lista || []).map((item) => ({
          topicoId: item.topicoId,
          topicoDescricao: item.topicoDescricao,
          materiaId: item.materiaId,
          materiaNome: item.materiaNome
        }));
        this.resumos = this.aplicarFilaPriorizada(mapeados);
        this.carregando = false;
        if (!this.resumos.length) {
          return;
        }
        const idxInicial = this.topicoIdInicial
          ? this.resumos.findIndex((r) => r.topicoId === this.topicoIdInicial)
          : 0;
        this.definirResumoAtual(idxInicial >= 0 ? idxInicial : 0);
      },
      error: () => {
        this.erro = 'Erro ao carregar resumos.';
        this.carregando = false;
      }
    });
  }

  private definirResumoAtual(indice: number): void {
    if (indice < 0 || indice >= this.resumos.length) {
      return;
    }
    this.resumoIndex = indice;
    const item = this.resumos[indice];
    this.materia = { id: item.materiaId, nome: item.materiaNome };
    this.topico = {
      id: item.topicoId,
      descricao: item.topicoDescricao,
      nivel: 0,
      ativo: true,
      filhos: []
    } as Topico;
    this.topicoIdInicial = item.topicoId;
    this.router.navigate(
      ['/area-restrita/biblioteca/resumo', item.topicoId],
      {
        queryParams: {
          materiaId: item.materiaId,
          topicos: this.filaTopicosIds.length ? this.filaTopicosIds.join(',') : null,
          origem: this.origemHoje ? 'hoje' : null
        }
      }
    );
    this.carregarResumo(item.topicoId);
  }

  private aplicarFilaPriorizada(lista: ResumoItem[]): ResumoItem[] {
    if (!this.filaTopicosIds.length) {
      return lista;
    }

    const porTopicoId = new Map<number, ResumoItem>();
    (lista || []).forEach((item) => {
      const topicoId = Number(item?.topicoId || 0);
      if (topicoId > 0) porTopicoId.set(topicoId, item);
    });

    return this.filaTopicosIds
      .map((topicoId) => porTopicoId.get(topicoId))
      .filter((item): item is ResumoItem => !!item);
  }

  private parseTopicosQuery(raw: string | null): number[] {
    const texto = String(raw || '').trim();
    if (!texto) return [];
    const saida: number[] = [];
    const vistos = new Set<number>();
    texto.split(',').forEach((parte) => {
      const id = Number(String(parte || '').trim());
      if (!Number.isFinite(id) || id <= 0 || vistos.has(id)) return;
      vistos.add(id);
      saida.push(id);
    });
    return saida;
  }

}
