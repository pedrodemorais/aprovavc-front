import { Component, OnInit } from '@angular/core';
import { SalaEstudoService, MateriaTopicosDTO, TopicoNodeDTO } from '../services/sala-estudo.service';
import { extrairStatusCanonicoRevisao, StatusRevisaoCanonico } from '../utils/revisao-status.util';

type NodeKind = 'materia' | 'topico' | 'subtopico';
type NodeStatusColor = 'verde' | 'amarelo' | 'vermelho';

interface BibliotecaCognitivaNode {
  id: string;
  nome: string;
  kind: NodeKind;
  depth: number;
  expanded: boolean;
  status: NodeStatusColor;
  statusLabel: string;
  children: BibliotecaCognitivaNode[];
}

@Component({
  selector: 'app-biblioteca-cognitiva',
  templateUrl: './biblioteca-cognitiva.component.html',
  styleUrls: ['./biblioteca-cognitiva.component.css']
})
export class BibliotecaCognitivaComponent implements OnInit {
  carregando = false;
  erro = '';
  arvore: BibliotecaCognitivaNode[] = [];
  topicoSelecionadoNome = '';

  constructor(private salaEstudoService: SalaEstudoService) {}

  ngOnInit(): void {
    this.carregarArvore();
  }

  toggleNode(node: BibliotecaCognitivaNode): void {
    if (!node.children.length) return;
    node.expanded = !node.expanded;
  }

  onTopicoClick(node: BibliotecaCognitivaNode): void {
    if (node.kind === 'materia') return;
    this.topicoSelecionadoNome = node.nome;
  }

  private carregarArvore(): void {
    this.carregando = true;
    this.erro = '';
    this.arvore = [];

    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
      next: (materias) => {
        this.arvore = this.mapMateriasParaArvore(materias || []);
        this.carregando = false;
      },
      error: (error) => {
        console.error('[BIBLIOTECA-COGNITIVA] Erro ao carregar arvore:', error);
        this.erro = 'Nao foi possivel carregar a biblioteca agora.';
        this.carregando = false;
      }
    });
  }

  private mapMateriasParaArvore(materias: MateriaTopicosDTO[]): BibliotecaCognitivaNode[] {
    return (materias || [])
      .filter((materia) => Number(materia?.materiaId || 0) > 0)
      .map((materia) => {
        const materiaId = Number(materia.materiaId);
        const topicos = this.mapTopicos(materia.topicos || [], 1, `m-${materiaId}`);
        return {
          id: `m-${materiaId}`,
          nome: String(materia.materiaNome || '').trim() || 'Materia',
          kind: 'materia',
          depth: 0,
          expanded: true,
          status: 'verde',
          statusLabel: 'Em dia',
          children: topicos
        };
      });
  }

  private mapTopicos(topicos: TopicoNodeDTO[], depth: number, prefix: string): BibliotecaCognitivaNode[] {
    const list = Array.isArray(topicos) ? topicos : [];
    return list
      .map((topico, index) => {
        const rawId = Number(
          topico?.id ??
          topico?.topicoId ??
          topico?.subtopicoId ??
          topico?.idTopico ??
          topico?.idSubtopico ??
          0
        );
        const nodeId = rawId > 0 ? `${prefix}-${rawId}` : `${prefix}-i${index}`;
        const filhos = this.extractFilhos(topico);
        const children = this.mapTopicos(filhos, depth + 1, nodeId);
        const statusCanonico = this.extractStatus(topico);
        const status = this.statusColor(statusCanonico);
        const statusLabel = this.statusLabel(statusCanonico);

        const kind: NodeKind = depth <= 1 ? 'topico' : 'subtopico';

        return {
          id: nodeId,
          nome: String(topico?.descricao || '').trim() || 'Topico',
          kind,
          depth,
          expanded: true,
          status,
          statusLabel,
          children
        };
      })
      .filter((node) => !!node.nome);
  }

  private extractFilhos(topico: TopicoNodeDTO): TopicoNodeDTO[] {
    const filhos = topico?.filhos ?? topico?.subtopicos ?? [];
    return Array.isArray(filhos) ? filhos : [];
  }

  private extractStatus(topico: TopicoNodeDTO): StatusRevisaoCanonico {
    return extrairStatusCanonicoRevisao({
      statusCanonico: topico?.statusCanonico,
      statusRevisao: topico?.statusRevisao,
      proximaRevisao: topico?.proximaRevisao
    });
  }

  private statusColor(status: StatusRevisaoCanonico): NodeStatusColor {
    if (status === 'ATRASADA') return 'vermelho';
    if (status === 'HOJE') return 'amarelo';
    return 'verde';
  }

  private statusLabel(status: StatusRevisaoCanonico): string {
    if (status === 'ATRASADA') return 'Atrasado';
    if (status === 'HOJE') return 'Vence hoje';
    return 'Em dia';
  }
}
