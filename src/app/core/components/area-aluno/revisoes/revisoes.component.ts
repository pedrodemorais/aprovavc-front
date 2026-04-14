import { Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { SalaEstudoService } from '../services/sala-estudo.service';
import { MateriaService } from '../services/materia.service';
import { Topico } from '../models/topico.model';
import { TreeNode } from 'primeng/api';
import { extrairStatusCanonicoRevisao, statusCanonicoParaDashboard } from '../utils/revisao-status.util';
import { EditalService } from '../services/edital.service';

type StatusRevisao = 'VENCIDA' | 'EM_DIA' | 'FUTURA';

type RevisaoTreeRow = {
  label: string;
  status?: StatusRevisao;
  dataProximaRevisao?: string;
  source?: RevisaoDashboardItem;
  hasChildren?: boolean;
  isMateria?: boolean;
  isTopico?: boolean;
};

@Component({
  selector: 'app-revisoes',
  templateUrl: './revisoes.component.html',
  styleUrls: ['./revisoes.component.css']
})
export class RevisoesComponent implements OnInit {
  @Input() revisoes: RevisaoDashboardItem[] = [];
  @Input() modo: 'automatico' | 'externo' = 'automatico';
  carregando = false;
  erro?: string;
  filtroStatus: 'atrasadas' | 'hoje' | 'emdia' | 'todas' = 'todas';
  filtroMateriaId: number | null = null;
  revisaoSelecionada: RevisaoDashboardItem | null = null;
  private revisoesTodas: RevisaoDashboardItem[] = [];
  private materiasTopicosCarregados = new Set<number>();
  private topicosPorMateria = new Map<number, Topico[]>();
  private materiaIdsEditalAtivo = new Set<number>();
  private filtroEditalAtivoDisponivel = false;
  private materiasChangedSub?: Subscription;
  treeNodes: TreeNode[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService,
    private editalService: EditalService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const filtro = (params.get('filtro') || '').toLowerCase();
      this.filtroStatus = filtro === 'atrasadas' || filtro === 'hoje' || filtro === 'emdia' ? (filtro as any) : 'todas';
      const materiaId = Number(params.get('materiaId'));
      this.filtroMateriaId = Number.isFinite(materiaId) && materiaId > 0 ? materiaId : null;
      this.aplicarFiltro();
    });

    if (this.modo === 'automatico') {
      this.materiasChangedSub = this.materiaService.materiasChanged$.subscribe(() => {
        this.carregarRevisoes();
      });
      this.carregarEscopoEditalAtivo(() => this.carregarRevisoes());
    }
  }

  ngOnDestroy(): void {
    this.materiasChangedSub?.unsubscribe();
  }

  setFiltroStatus(status: 'atrasadas' | 'hoje' | 'emdia' | 'todas'): void {
    this.filtroStatus = status;
    this.aplicarFiltro();

    if (this.modo === 'automatico') {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { filtro: status },
        queryParamsHandling: 'merge'
      });
    }
  }

  private carregarRevisoes(): void {
    if (this.carregando) return;
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.limparCacheRevisoesDashboard();
    this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }).subscribe({
      next: (resp) => {
        const itens = resp?.itens || [];
        this.revisoesTodas = this.normalizarRevisoes(itens);
        this.aplicarFiltro();
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar revisões.';
        this.carregando = false;
      }
    });
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    if (this.modo === 'automatico') {
      this.carregarRevisoes();
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (this.modo === 'automatico' && typeof document !== 'undefined' && !document.hidden) {
      this.carregarRevisoes();
    }
  }

  get revisoesFiltradas(): RevisaoDashboardItem[] {
    return this.revisoes;
  }

  get contagemRevisoes(): { vencidas: number; hoje: number; emDia: number } {
    const baseBruta = this.revisoesTodas.length ? this.revisoesTodas : this.revisoes;
    const base = this.filtrarPorEditalAtivo(baseBruta);
    const vencidas = new Set<string>();
    const hoje = new Set<string>();
    const emDia = new Set<string>();

    for (const item of base) {
      const chave = `${Number(item?.materiaId || 0)}:${Number(item?.topicoId || 0)}`;
      if (chave === '0:0') continue;

      if (item.status === 'VENCIDA') {
        vencidas.add(chave);
      } else if (item.status === 'EM_DIA') {
        hoje.add(chave);
      } else if (item.status === 'FUTURA') {
        emDia.add(chave);
      }
    }

    return { vencidas: vencidas.size, hoje: hoje.size, emDia: emDia.size };
  }

  private aplicarFiltro(): void {
    const base = this.normalizarRevisoes(this.revisoesTodas.length ? this.revisoesTodas : this.revisoes);
    let lista = this.filtrarPorEditalAtivo(base);
    if (this.filtroStatus !== 'todas') {
      const statusMap: Record<string, string> = {
        atrasadas: 'VENCIDA',
        hoje: 'EM_DIA',
        emdia: 'FUTURA'
      };
      const alvo = statusMap[this.filtroStatus];
      lista = lista.filter((item) => item.status === alvo);
    }
    if (this.filtroMateriaId) {
      lista = lista.filter((item) => item.materiaId === this.filtroMateriaId);
    }
    this.revisoes = lista;
    this.carregarNiveisTopicosDasRevisoes();
    this.atualizarArvore();
    if (this.revisaoSelecionada && !this.revisoes.some((item) => item.materiaId === this.revisaoSelecionada?.materiaId && item.topicoId === this.revisaoSelecionada?.topicoId)) {
      this.revisaoSelecionada = null;
    }
  }

  private normalizarRevisoes(lista: RevisaoDashboardItem[]): RevisaoDashboardItem[] {
    const hoje = new Date();
    return (lista || []).map((item) => {
      const proxima =
        item?.dataProximaRevisao ||
        item?.proximaRevisao ||
        null;
      // Mesma regra do Centro de Estudo:
      // prioriza status canônico do backend (statusCanonico/statusRevisao/status),
      // e só usa data como fallback dentro do util.
      const statusCanonico = extrairStatusCanonicoRevisao(item, hoje);
      const statusDashboard = statusCanonicoParaDashboard(statusCanonico) || 'FUTURA';

      return {
        ...item,
        statusCanonico: item?.statusCanonico || statusCanonico,
        status: statusDashboard,
        dataProximaRevisao: proxima || item?.dataProximaRevisao
      };
    });
  }

  private carregarNiveisTopicosDasRevisoes(): void {
    const baseBruta = this.revisoesTodas.length ? this.revisoesTodas : this.revisoes;
    const base = this.filtrarPorEditalAtivo(baseBruta);
    const materiaIds = new Set<number>();
    for (const item of base || []) {
      if (item.materiaId) {
        materiaIds.add(item.materiaId);
      }
    }

    materiaIds.forEach((materiaId) => {
      if (this.materiasTopicosCarregados.has(materiaId)) {
        return;
      }
      this.materiasTopicosCarregados.add(materiaId);
      this.materiaService.listarTopicos(materiaId).subscribe({
        next: (lista) => {
          const topicos = lista || [];
          this.topicosPorMateria.set(materiaId, topicos);
          this.atualizarArvore();
        },
        error: () => {
          this.materiasTopicosCarregados.delete(materiaId);
        }
      });
    });
  }

  private atualizarArvore(): void {
    this.treeNodes = this.buildTreeNodes();
  }

  private buildTreeNodes(): TreeNode[] {
    const grupos = new Map<number, { materiaId: number; materiaNome: string; itens: RevisaoDashboardItem[] }>();
    for (const item of this.revisoesFiltradas || []) {
      const materiaId = item.materiaId ?? 0;
      if (!grupos.has(materiaId)) {
        grupos.set(materiaId, {
          materiaId,
          materiaNome: item.materiaNome || 'Materia',
          itens: []
        });
      }
      grupos.get(materiaId)!.itens.push(item);
    }

    const nodes: TreeNode[] = [];
    Array.from(grupos.values()).forEach((grupo) => {
      const revisaoMap = new Map<number, RevisaoDashboardItem>();
      grupo.itens.forEach((item) => {
        revisaoMap.set(item.topicoId, item);
      });

      const topicos = this.topicosPorMateria.get(grupo.materiaId);
      if (!topicos?.length) {
        const filhos = grupo.itens.map((item) => ({
          data: {
            label: item.topicoDescricao,
            status: item.status,
            dataProximaRevisao: item.dataProximaRevisao,
            source: item,
            hasChildren: false,
            isTopico: true
          } as RevisaoTreeRow,
          leaf: true
        })) as TreeNode[];

        nodes.push({
          data: { label: grupo.materiaNome, isMateria: true } as RevisaoTreeRow,
          children: filhos,
          expanded: true
        });
        return;
      }

      const topicosNormalizados = this.normalizarTopicos(topicos);
      const filhos: TreeNode[] = [];
      topicosNormalizados.forEach((topico) => {
        const res = this.buildNodeTopico(grupo.materiaId, topico, revisaoMap);
        if (res?.include && res.node) {
          filhos.push(res.node);
        }
      });

      // Garante que revisões órfãs (não encontradas na árvore de tópicos)
      // também apareçam na lista, mantendo consistência com os contadores.
      const coletarTopicoIdsIncluidos = (listaNodes: TreeNode[], out: Set<number>): void => {
        (listaNodes || []).forEach((node) => {
          const src = (node?.data as any)?.source as RevisaoDashboardItem | undefined;
          if (src?.topicoId) out.add(Number(src.topicoId));
          if (node?.children?.length) coletarTopicoIdsIncluidos(node.children, out);
        });
      };
      const incluidos = new Set<number>();
      coletarTopicoIdsIncluidos(filhos, incluidos);
      (grupo.itens || []).forEach((item) => {
        const tid = Number(item?.topicoId);
        if (!Number.isFinite(tid) || tid <= 0 || incluidos.has(tid)) return;
        filhos.push({
          data: {
            label: item.topicoDescricao,
            status: item.status,
            dataProximaRevisao: item.dataProximaRevisao,
            source: item,
            hasChildren: false,
            isTopico: true
          } as RevisaoTreeRow,
          leaf: true
        } as TreeNode);
      });

      if (!filhos.length) {
        return;
      }

      nodes.push({
        data: { label: grupo.materiaNome, isMateria: true } as RevisaoTreeRow,
        children: filhos,
        expanded: true
      });
    });

    return nodes;
  }

  private buildNodeTopico(
    materiaId: number,
    topico: any,
    revisaoMap: Map<number, RevisaoDashboardItem>
  ): { include: boolean; status?: StatusRevisao; data?: string | null; node?: TreeNode } {
    const id = Number(topico?.id);
    const filhos = (topico?.subtopicos || []) as Topico[];

    const revisao = revisaoMap.get(id);
    let include = !!revisao;
    const statusProprio: StatusRevisao | undefined = revisao?.status as StatusRevisao | undefined;
    const dataPropria: string | null | undefined = revisao?.dataProximaRevisao;

    const childNodes: TreeNode[] = [];
    filhos.forEach((filho) => {
      const res = this.buildNodeTopico(materiaId, filho, revisaoMap);
      if (!res.include || !res.node) {
        return;
      }
      include = true;
      childNodes.push(res.node);
    });

    if (!include) {
      return { include: false, status: statusProprio, data: dataPropria };
    }

    const node: TreeNode = {
      data: {
        label: topico?.descricao || '',
        status: statusProprio,
        dataProximaRevisao: dataPropria || undefined,
        source: revisao,
        hasChildren: childNodes.length > 0,
        isTopico: true
      } as RevisaoTreeRow,
      children: childNodes,
      leaf: childNodes.length === 0,
      expanded: true
    };

    return { include: true, status: statusProprio, data: dataPropria, node };
  }


  private normalizarTopicos(topicos: Topico[]): any[] {
    const lista = topicos || [];
    if (!lista.length) {
      return [];
    }

    const temSubtopicos = lista.some((t) => Array.isArray((t as any).subtopicos));
    const temFilhos = lista.some((t) => Array.isArray((t as any).filhos));

    if (temSubtopicos || temFilhos) {
      return lista.map((topico) => this.mapearFilhos(topico));
    }

    const nodes = new Map<number, any>();
    lista.forEach((topico) => {
      const id = Number((topico as any).id);
      if (!Number.isFinite(id)) {
        return;
      }
      nodes.set(id, { ...topico, subtopicos: [] });
    });

    const roots: any[] = [];
    nodes.forEach((node) => {
      const parentId = Number((node as any).topicoPaiId);
      if (Number.isFinite(parentId) && parentId > 0 && nodes.has(parentId)) {
        nodes.get(parentId).subtopicos.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  private mapearFilhos(topico: any): any {
    const filhos = (topico?.subtopicos || topico?.filhos || []) as any[];
    return {
      ...topico,
      subtopicos: filhos.map((filho) => this.mapearFilhos(filho))
    };
  }

  selecionarRevisao(item: RevisaoDashboardItem): void {
    this.revisaoSelecionada = item;
  }

  irParaSala(item?: RevisaoDashboardItem | null): void {
    const alvo = item || this.revisaoSelecionada;
    const topicoId = Number(alvo?.topicoId || 0);
    const materiaId = Number(alvo?.materiaId || 0);
    if (!topicoId || !materiaId) return;

    this.router.navigate(
      ['/area-restrita/biblioteca/resumo', topicoId],
      { queryParams: { materiaId } }
    );
  }

  onTreeRowClick(row: RevisaoTreeRow): void {
    if (row?.source) {
      this.selecionarRevisao(row.source);
      return;
    }
    this.revisaoSelecionada = null;
  }

  private carregarEscopoEditalAtivo(onComplete?: () => void): void {
    this.editalService.listarComInclude(['materias']).subscribe({
      next: (editais) => {
        const materiaIds = new Set<number>();
        const ativos = (editais || []).filter((e) => e?.ativo);
        for (const edital of ativos) {
          for (const materia of edital?.materias || []) {
            if ((materia as any)?.ativo === false) continue;
            const materiaId = Number((materia as any)?.materiaId);
            if (Number.isFinite(materiaId) && materiaId > 0) {
              materiaIds.add(materiaId);
            }
          }
        }

        this.materiaIdsEditalAtivo = materiaIds;
        this.filtroEditalAtivoDisponivel = true;
        this.aplicarFiltro();
        onComplete?.();
      },
      error: () => {
        this.filtroEditalAtivoDisponivel = false;
        this.aplicarFiltro();
        onComplete?.();
      }
    });
  }

  private filtrarPorEditalAtivo<T extends { materiaId?: number | null }>(itens: T[]): T[] {
    const lista = Array.isArray(itens) ? itens : [];
    if (this.modo !== 'automatico') return lista;
    if (!this.filtroEditalAtivoDisponivel) return lista;
    return lista.filter((item) => {
      const materiaId = Number(item?.materiaId || 0);
      return materiaId > 0 && this.materiaIdsEditalAtivo.has(materiaId);
    });
  }
}
