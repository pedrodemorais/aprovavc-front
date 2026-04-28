import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SalaEstudoService, BibliotecaResumoDTO } from '../services/sala-estudo.service';
import { Topico } from '../models/topico.model';
import { Materia } from '../models/materia.model';
import { RevisaoHojeService } from 'src/app/core/services/revisao-hoje.service';
import { EditalService } from '../services/edital.service';
import { Edital } from '../models/Edital';

type ResumoItem = {
  topicoId: number;
  topicoDescricao: string;
  materiaId: number;
  materiaNome: string;
};

type EscopoEditalAtivo = {
  materiaOrder: Map<number, number>;
  topicoOrder: Map<number, number>;
  topicosPorMateria: Map<number, Set<number>>;
};

@Component({
  selector: 'app-biblioteca-resumo',
  templateUrl: './biblioteca-resumo.component.html',
  styleUrls: ['./biblioteca-resumo.component.css']
})
export class BibliotecaResumoComponent implements OnInit {
  materia?: Materia;
  topico?: Topico;
  anotacoesHtml: string | null = null;
  anotacoesHtmlSeguro: SafeHtml | null = null;
  carregando = false;
  carregandoResumo = false;
  marcandoRevisado = false;
  erro?: string;
  resumos: ResumoItem[] = [];
  resumoIndex = -1;
  materiaFiltroId: number | null = null;
  origemHoje = false;
  private topicoIdInicial: number | null = null;
  private filaTopicosIds: number[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private salaEstudoService: SalaEstudoService,
    private revisaoHojeService: RevisaoHojeService,
    private editalService: EditalService,
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

  marcarRevisado(): void {
    if (this.marcandoRevisado || this.resumoIndex < 0) return;

    const item = this.resumos[this.resumoIndex];
    const topicoId = Number(item?.topicoId || 0);
    if (!Number.isFinite(topicoId) || topicoId <= 0) return;

    this.marcandoRevisado = true;
    this.erro = undefined;

    this.salaEstudoService.responderRevisaoTopico({ topicoId, avaliacao: 'BOM' }).subscribe({
      next: () => {
        this.removerTopicoAtualDaFila(topicoId);
        this.marcandoRevisado = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao marcar resumo como revisado:', err);
        this.erro = 'Erro ao marcar como revisado. Tente novamente.';
        this.marcandoRevisado = false;
      }
    });
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

  get podeMarcarRevisado(): boolean {
    return this.origemHoje && this.resumoIndex >= 0 && !!this.resumos[this.resumoIndex] && !this.marcandoRevisado;
  }

  get progressoPercentual(): number {
    if (!this.resumos.length || this.resumoIndex < 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((this.resumoIndex + 1) / this.resumos.length) * 100)));
  }

  private carregarResumo(topicoId: number): void {
    this.carregandoResumo = true;
    this.anotacoesHtml = null;
    this.anotacoesHtmlSeguro = null;
    this.salaEstudoService.buscarResumoBiblioteca(topicoId).subscribe({
      next: (resp) => {
        const anotacoes = resp?.anotacoes || '';
        this.anotacoesHtml = anotacoes;
        this.anotacoesHtmlSeguro = anotacoes ? this.sanitizer.bypassSecurityTrustHtml(anotacoes) : null;
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

    const emFluxoRevisao = this.filaTopicosIds.length > 0 || this.origemHoje;
    if (emFluxoRevisao) {
      this.carregarEscopoEditalAtivo((escopo) => {
        this.revisaoHojeService.getFilaHoje({
          origem: 'biblioteca',
          materiaId: this.materiaFiltroId,
          topicoIds: this.filaTopicosIds.length ? this.filaTopicosIds : null
        }).subscribe({
          next: (fila) => {
            const mapeados = ((fila?.itens || []).map((item: any) => ({
                topicoId: Number(item?.topicoId || 0),
                topicoDescricao: String(item?.topicoNome || '').trim() || `Topico ${Number(item?.topicoId || 0)}`,
                materiaId: Number(item?.materiaId || 0),
                materiaNome: String(item?.materiaNome || '').trim() || 'Materia'
              })) as ResumoItem[]);
            this.aplicarResumos(mapeados, escopo);
          },
          error: () => {
            this.erro = 'Erro ao carregar resumos.';
            this.carregando = false;
          }
        });
      });
      return;
    }

    this.carregarEscopoEditalAtivo((escopo) => {
      this.salaEstudoService.listarBibliotecaResumos({
        materiaId: this.materiaFiltroId
      }).subscribe({
        next: (lista: BibliotecaResumoDTO[]) => {
          const mapeados = ((lista || []).map((item) => ({
            topicoId: item.topicoId,
            topicoDescricao: item.topicoDescricao,
            materiaId: item.materiaId,
            materiaNome: item.materiaNome
          })) as ResumoItem[]);
          this.aplicarResumos(mapeados, escopo);
        },
        error: () => {
          this.erro = 'Erro ao carregar resumos.';
          this.carregando = false;
        }
      });
    });
  }

  private aplicarResumos(lista: ResumoItem[], escopo: EscopoEditalAtivo): void {
    const priorizada = this.aplicarFilaPriorizada(lista);
    const porEditalAtivo = this.filtrarPorEditaisAtivos(priorizada, escopo);
    const base = porEditalAtivo.length > 0 || priorizada.length === 0 ? porEditalAtivo : priorizada;
    if (priorizada.length > 0 && porEditalAtivo.length === 0 && escopo.materiaOrder.size > 0) {
      console.warn('[BIBLIOTECA] Filtro de edital ativo nao encontrou itens; mantendo fila original.', {
        totalOriginal: priorizada.length,
        materiasAtivas: Array.from(escopo.materiaOrder.keys())
      });
    }
    const ordenada = this.ordenarPorMateriasAtivas(base, escopo);
    this.resumos = ordenada;
    this.carregando = false;
    if (!this.resumos.length) {
      return;
    }
    const idxInicial = this.topicoIdInicial
      ? this.resumos.findIndex((r) => r.topicoId === this.topicoIdInicial)
      : 0;
    this.definirResumoAtual(idxInicial >= 0 ? idxInicial : 0);
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

  private removerTopicoAtualDaFila(topicoId: number): void {
    const indiceAtual = this.resumoIndex;
    this.resumos = (this.resumos || []).filter((item) => Number(item?.topicoId || 0) !== topicoId);
    this.filaTopicosIds = (this.filaTopicosIds || []).filter((id) => Number(id) !== topicoId);

    if (!this.resumos.length) {
      this.resumoIndex = -1;
      this.topicoIdInicial = null;
      this.topico = undefined;
      this.anotacoesHtml = null;
      this.anotacoesHtmlSeguro = null;
      this.router.navigate(['/area-restrita/hoje']);
      return;
    }

    const proximoIndice = Math.min(indiceAtual, this.resumos.length - 1);
    this.definirResumoAtual(proximoIndice);
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

  private carregarEscopoEditalAtivo(callback: (escopo: EscopoEditalAtivo) => void): void {
    this.editalService.listarComInclude(['materias', 'topicos']).subscribe({
      next: (editais) => callback(this.montarEscopoEditalAtivo(editais || [])),
      error: () => callback(this.escopoVazio())
    });
  }

  private montarEscopoEditalAtivo(editais: Edital[]): EscopoEditalAtivo {
    const escopo = this.escopoVazio();
    let materiaSeq = 0;
    let topicoSeq = 0;

    (editais || [])
      .filter((edital) => edital?.ativo === true)
      .forEach((edital) => {
        (edital.materias || [])
          .filter((materia: any) => materia?.ativo !== false)
          .forEach((materia: any) => {
            const materiaId = Number(materia?.materiaId || 0);
            if (!Number.isFinite(materiaId) || materiaId <= 0) return;

            if (!escopo.materiaOrder.has(materiaId)) {
              escopo.materiaOrder.set(materiaId, materiaSeq++);
            }

            const idsTopicosAtivos = this.coletarTopicosAtivos(materia?.topicos || []);
            if (idsTopicosAtivos.length > 0) {
              const set = escopo.topicosPorMateria.get(materiaId) || new Set<number>();
              idsTopicosAtivos.forEach((topicoId) => {
                set.add(topicoId);
                if (!escopo.topicoOrder.has(topicoId)) {
                  escopo.topicoOrder.set(topicoId, topicoSeq++);
                }
              });
              escopo.topicosPorMateria.set(materiaId, set);
            }
          });
      });

    return escopo;
  }

  private coletarTopicosAtivos(topicos: any[]): number[] {
    const ids: number[] = [];
    const walk = (items: any[]) => {
      (items || []).forEach((topico: any) => {
        const id = Number(topico?.id ?? topico?.topicoId ?? topico?.idTopico ?? 0);
        const ativo = topico?.ativo !== false;
        if (ativo && Number.isFinite(id) && id > 0) {
          ids.push(id);
        }
        const filhos = topico?.subtopicos || topico?.filhos || topico?.children || [];
        walk(filhos);
      });
    };
    walk(topicos);
    return ids;
  }

  private filtrarPorEditaisAtivos(lista: ResumoItem[], escopo: EscopoEditalAtivo): ResumoItem[] {
    if (!escopo.materiaOrder.size) {
      return lista || [];
    }

    const porMateriaAtiva = (lista || []).filter((item) => {
      const materiaId = Number(item?.materiaId || 0);
      return escopo.materiaOrder.has(materiaId);
    });

    if (!porMateriaAtiva.length) {
      return [];
    }

    const porTopicoAtivo = porMateriaAtiva.filter((item) => {
      const materiaId = Number(item?.materiaId || 0);
      const topicoId = Number(item?.topicoId || 0);
      const topicosDaMateria = escopo.topicosPorMateria.get(materiaId);
      if (topicosDaMateria?.size) {
        return topicosDaMateria.has(topicoId);
      }

      return true;
    });

    return porTopicoAtivo.length > 0 ? porTopicoAtivo : porMateriaAtiva;
  }

  private ordenarPorMateriasAtivas(lista: ResumoItem[], escopo: EscopoEditalAtivo): ResumoItem[] {
    return [...(lista || [])].sort((a, b) => {
      const materiaA = escopo.materiaOrder.get(Number(a.materiaId || 0)) ?? Number.MAX_SAFE_INTEGER;
      const materiaB = escopo.materiaOrder.get(Number(b.materiaId || 0)) ?? Number.MAX_SAFE_INTEGER;
      if (materiaA !== materiaB) return materiaA - materiaB;

      const topicoA = escopo.topicoOrder.get(Number(a.topicoId || 0)) ?? Number.MAX_SAFE_INTEGER;
      const topicoB = escopo.topicoOrder.get(Number(b.topicoId || 0)) ?? Number.MAX_SAFE_INTEGER;
      if (topicoA !== topicoB) return topicoA - topicoB;

      return Number(a.topicoId || 0) - Number(b.topicoId || 0);
    });
  }

  private escopoVazio(): EscopoEditalAtivo {
    return {
      materiaOrder: new Map<number, number>(),
      topicoOrder: new Map<number, number>(),
      topicosPorMateria: new Map<number, Set<number>>()
    };
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
