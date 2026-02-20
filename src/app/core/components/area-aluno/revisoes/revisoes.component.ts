import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { SalaEstudoService } from '../services/sala-estudo.service';
import { MateriaService } from '../services/materia.service';
import { Topico } from '../models/topico.model';
import { TreeNode } from 'primeng/api';
import { extrairStatusCanonicoRevisao, inferirStatusCanonicoPorData, statusCanonicoParaDashboard } from '../utils/revisao-status.util';

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
  treeNodes: TreeNode[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService
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
      this.carregarRevisoes();
    }
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
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.limparCacheRevisoesDashboard();
    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens) => {
        this.revisoesTodas = this.normalizarRevisoes(itens || []);
        this.aplicarFiltro();
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar revisões.';
        this.carregando = false;
      }
    });
  }

  get revisoesFiltradas(): RevisaoDashboardItem[] {
    return this.revisoes;
  }

  get contagemRevisoes(): { vencidas: number; hoje: number; emDia: number } {
    const base = this.revisoesTodas.length ? this.revisoesTodas : this.revisoes;
    let vencidas = 0;
    let hoje = 0;
    let emDia = 0;

    for (const item of base) {
      if (item.status === 'VENCIDA') {
        vencidas += 1;
      } else if (item.status === 'EM_DIA') {
        hoje += 1;
      } else if (item.status === 'FUTURA') {
        emDia += 1;
      }
    }

    return { vencidas, hoje, emDia };
  }

  private aplicarFiltro(): void {
    const base = this.normalizarRevisoes(this.revisoesTodas.length ? this.revisoesTodas : this.revisoes);
    let lista = [...base];
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
      const statusCanonicoInferidoPorData = proxima ? inferirStatusCanonicoPorData(proxima, hoje) : null;
      const statusCanonico = statusCanonicoInferidoPorData || extrairStatusCanonicoRevisao(item, hoje);
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
    const materiaIds = new Set<number>();
    for (const item of this.revisoes || []) {
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
    let melhorStatus: StatusRevisao | undefined = revisao?.status as StatusRevisao | undefined;
    let melhorData: string | null | undefined = revisao?.dataProximaRevisao;

    const childNodes: TreeNode[] = [];
    filhos.forEach((filho) => {
      const res = this.buildNodeTopico(materiaId, filho, revisaoMap);
      if (!res.include || !res.node) {
        return;
      }
      include = true;
      if (res.status && this.rankStatus(res.status) > this.rankStatus(melhorStatus)) {
        melhorStatus = res.status;
        melhorData = res.data;
      } else if (res.status && res.status === melhorStatus && res.data && melhorData) {
        if (this.construirDataLocal(res.data).getTime() < this.construirDataLocal(melhorData).getTime()) {
          melhorData = res.data;
        }
      } else if (res.status && res.status === melhorStatus && res.data && !melhorData) {
        melhorData = res.data;
      }
      childNodes.push(res.node);
    });

    if (!include) {
      return { include: false, status: melhorStatus, data: melhorData };
    }

    const node: TreeNode = {
      data: {
        label: topico?.descricao || '',
        status: (melhorStatus || 'FUTURA') as StatusRevisao,
        dataProximaRevisao: melhorData || undefined,
        source: revisao,
        hasChildren: childNodes.length > 0,
        isTopico: true
      } as RevisaoTreeRow,
      children: childNodes,
      leaf: childNodes.length === 0,
      expanded: true
    };

    return { include: true, status: melhorStatus, data: melhorData, node };
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

  private rankStatus(status?: StatusRevisao): number {
    if (!status) return 0;
    if (status === 'VENCIDA') return 3;
    if (status === 'EM_DIA') return 2;
    if (status === 'FUTURA') return 1;
    return 0;
  }

  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);

    const data = new Date(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data;
  }

  selecionarRevisao(item: RevisaoDashboardItem): void {
    this.revisaoSelecionada = item;
  }

  irParaSala(item: RevisaoDashboardItem): void {
    const rawModo = (this.route.snapshot.queryParamMap.get('modo') || '').toLowerCase();
    const modo = rawModo === 'revisao' || rawModo === 'revisar' ? rawModo : null;

    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId, modo } }
    );
  }

  onTreeRowClick(row: RevisaoTreeRow): void {
    if (row?.source) {
      this.selecionarRevisao(row.source);
      return;
    }
    this.revisaoSelecionada = null;
  }
}
