import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { SalaEstudoService, MateriaTopicosDTO, BibliotecaFlashcardDTO, BibliotecaResumoDTO } from '../services/sala-estudo.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TreeNode } from 'primeng/api';

type BibliotecaModo = 'resumos' | 'flashcards';

type BibliotecaTreeRow = {
  label: string;
  materiaNome?: string;
  source?: BibliotecaResumoDTO;
  hasChildren?: boolean;
  isMateria?: boolean;
  isTopico?: boolean;
};

@Component({
  selector: 'app-biblioteca',
  templateUrl: './biblioteca.component.html',
  styleUrls: ['./biblioteca.component.css']
})
export class BibliotecaComponent implements OnInit {
  materias: Materia[] = [];
  topicosPorMateria = new Map<number, Topico[]>();

  materiaSelecionadaId: number | null = null;
  topicoSelecionadoId: number | null = null;
  modo: BibliotecaModo = 'resumos';
  termoBusca = '';

  carregando = false;
  carregandoFlashcards = false;
  carregandoResumos = false;
  erro?: string;

  flashcards: BibliotecaFlashcardDTO[] = [];
  resumosDisponiveis: BibliotecaResumoDTO[] = [];
  resumosTreeNodes: TreeNode[] = [];
  private buscaTimer?: any;

  constructor(
    private salaEstudoService: SalaEstudoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarMaterias();
  }

  private carregarMaterias(): void {
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
      next: (lista) => {
        const materias: Materia[] = [];
        this.topicosPorMateria.clear();

        (lista || []).forEach((item: MateriaTopicosDTO) => {
          const materiaId = Number(item?.materiaId);
          const materiaNome = String(item?.materiaNome || '').trim();
          if (!Number.isFinite(materiaId) || materiaId <= 0 || !materiaNome) {
            return;
          }
          materias.push({ id: materiaId, nome: materiaNome });
          const topicos = (item?.topicos || []).map((dto: any) => this.converterDtoParaTopico(dto, 0));
          this.topicosPorMateria.set(materiaId, topicos);
        });

        this.materias = materias;
        this.carregando = false;
        if (this.modo === 'resumos') {
          this.carregarResumosDisponiveis();
        } else {
          this.carregarFlashcards();
        }
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar materias:', err);
        this.erro = 'Erro ao carregar materias.';
        this.carregando = false;
      }
    });
  }

  onMateriaChange(): void {
    this.topicoSelecionadoId = null;
    this.flashcards = [];
    this.resumosDisponiveis = [];
    this.carregandoResumos = false;
    this.termoBusca = '';
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    } else {
      this.carregarResumosDisponiveis();
    }
  }

  onTopicoChange(): void {
    this.recarregarLista();
  }

  trocarModo(novoModo: BibliotecaModo): void {
    if (this.modo === novoModo) {
      return;
    }
    this.modo = novoModo;
    this.recarregarLista();
  }

  onBuscaChange(): void {
    if (this.buscaTimer) {
      clearTimeout(this.buscaTimer);
    }
    this.buscaTimer = setTimeout(() => this.recarregarLista(), 350);
  }

  abrirResumo(item: BibliotecaResumoDTO): void {
    if (!item?.topicoId) return;
    const materiaId = item.materiaId;
    this.router.navigate(
      ['/area-restrita/biblioteca/resumo', item.topicoId],
      { queryParams: materiaId ? { materiaId } : undefined }
    );
  }

  get topicosDisponiveis(): Topico[] {
    if (!this.materiaSelecionadaId) {
      const todas: Topico[] = [];
      this.topicosPorMateria.forEach((lista) => todas.push(...lista));
      return todas;
    }
    return this.topicosPorMateria.get(this.materiaSelecionadaId) || [];
  }

  get folhasDisponiveis(): Topico[] {
    return this.folhasTopicos(this.topicosDisponiveis);
  }

  private carregarFlashcards(): void {
    this.flashcards = [];
    this.carregandoFlashcards = true;

    this.salaEstudoService.listarBibliotecaFlashcards({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca
    }).subscribe({
      next: (lista) => {
        this.flashcards = lista || [];
        this.carregandoFlashcards = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar flashcards:', err);
        this.carregandoFlashcards = false;
      }
    });
  }

  private carregarResumosDisponiveis(): void {
    this.resumosDisponiveis = [];
    this.carregandoResumos = true;
    this.erro = undefined;

    this.salaEstudoService.listarBibliotecaResumos({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca
    }).subscribe({
      next: (lista) => {
        this.resumosDisponiveis = this.ordenarResumosComoLivro(lista || []);
        this.atualizarArvoreResumos();
        this.carregandoResumos = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar resumos:', err);
        // Em produção, um vínculo inválido em apenas uma matéria pode derrubar
        // a consulta global. Nesse caso, tenta carregar matéria por matéria.
        if (!this.materiaSelecionadaId && !this.topicoSelecionadoId) {
          this.carregarResumosComFallbackPorMateria();
          return;
        }
        this.erro = 'Erro ao carregar resumos.';
        this.carregandoResumos = false;
      }
    });
  }

  private carregarResumosComFallbackPorMateria(): void {
    const materiasIds = this.materias
      .map((m) => Number(m.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!materiasIds.length) {
      this.carregandoResumos = false;
      this.erro = 'Erro ao carregar resumos.';
      return;
    }

    const requests = materiasIds.map((materiaId) =>
      this.salaEstudoService.listarBibliotecaResumos({
        materiaId,
        topicoId: null,
        termo: this.termoBusca
      }).pipe(
        catchError((error) => {
          console.warn(`[BIBLIOTECA] Falha ao carregar resumos da materia ${materiaId}:`, error);
          return of([] as BibliotecaResumoDTO[]);
        })
      )
    );

    forkJoin(requests).subscribe({
      next: (listas) => {
        const combinado = (listas || []).flat();
        this.resumosDisponiveis = this.ordenarResumosComoLivro(combinado);
        this.atualizarArvoreResumos();
        this.carregandoResumos = false;
        if (!combinado.length) {
          this.erro = 'Nao foi possivel carregar resumos no momento.';
        }
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro no fallback de resumos:', err);
        this.erro = 'Erro ao carregar resumos.';
        this.carregandoResumos = false;
      }
    });
  }

  private recarregarLista(): void {
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    } else {
      this.carregarResumosDisponiveis();
    }
  }

  private atualizarArvoreResumos(): void {
    this.resumosTreeNodes = this.buildResumosTreeNodes();
  }

  private buildResumosTreeNodes(): TreeNode[] {
    const grupos = new Map<number, { materiaId: number; materiaNome: string; itens: BibliotecaResumoDTO[] }>();
    for (const item of this.resumosDisponiveis || []) {
      const materiaId = Number(item?.materiaId) || 0;
      if (!grupos.has(materiaId)) {
        grupos.set(materiaId, {
          materiaId,
          materiaNome: item?.materiaNome || 'Materia',
          itens: []
        });
      }
      grupos.get(materiaId)!.itens.push(item);
    }

    const nodes: TreeNode[] = [];
    const materiasNaOrdem = this.materiaSelecionadaId
      ? this.materias.filter((m) => Number(m.id) === Number(this.materiaSelecionadaId))
      : this.materias;

    materiasNaOrdem.forEach((materia) => {
      const materiaId = Number(materia.id);
      const grupo = grupos.get(materiaId);
      if (!grupo?.itens?.length) return;

      const resumoMap = new Map<number, BibliotecaResumoDTO>();
      grupo.itens.forEach((item) => resumoMap.set(Number(item.topicoId), item));

      const topicos = this.topicosPorMateria.get(materiaId) || [];
      const filhos: TreeNode[] = [];
      (topicos || []).forEach((topico) => {
        const res = this.buildNodeResumo(topico, resumoMap);
        if (res?.include && res.node) filhos.push(res.node);
      });

      const filhosFallback = !filhos.length
        ? this.ordenarResumosComoLivro(grupo.itens).map((item) => ({
            data: {
              label: item.topicoDescricao,
              materiaNome: item.materiaNome,
              source: item,
              hasChildren: false,
              isTopico: true
            } as BibliotecaTreeRow,
            leaf: true
          } as TreeNode))
        : filhos;

      nodes.push({
        data: { label: materia.nome, isMateria: true } as BibliotecaTreeRow,
        children: filhosFallback,
        expanded: true
      });
    });

    return nodes;
  }

  private buildNodeResumo(
    topico: Topico,
    resumoMap: Map<number, BibliotecaResumoDTO>
  ): { include: boolean; node?: TreeNode } {
    const id = Number(topico?.id);
    const filhos = (topico?.filhos || []) as Topico[];
    const resumo = resumoMap.get(id);

    let include = !!resumo;
    const childNodes: TreeNode[] = [];

    filhos.forEach((filho) => {
      const res = this.buildNodeResumo(filho, resumoMap);
      if (!res.include || !res.node) return;
      include = true;
      childNodes.push(res.node);
    });

    if (!include) {
      return { include: false };
    }

    return {
      include: true,
      node: {
        data: {
          label: topico?.descricao || '',
          materiaNome: resumo?.materiaNome,
          source: resumo,
          hasChildren: childNodes.length > 0,
          isTopico: true
        } as BibliotecaTreeRow,
        children: childNodes,
        leaf: childNodes.length === 0
      }
    };
  }

  private ordenarResumosComoLivro(lista: BibliotecaResumoDTO[]): BibliotecaResumoDTO[] {
    const ordemMateria = new Map<number, number>();
    this.materias.forEach((m, idx) => ordemMateria.set(Number(m.id), idx));

    const ordemTopicoGlobal = new Map<number, number>();
    let cursor = 0;

    const mapearTopicos = (topicos: Topico[]) => {
      const walk = (t: Topico) => {
        if (t?.id) {
          ordemTopicoGlobal.set(Number(t.id), cursor++);
        }
        (t?.filhos || []).forEach(walk);
      };
      (topicos || []).forEach(walk);
    };

    if (this.materiaSelecionadaId) {
      mapearTopicos(this.topicosPorMateria.get(this.materiaSelecionadaId) || []);
    } else {
      this.materias.forEach((m) => mapearTopicos(this.topicosPorMateria.get(Number(m.id)) || []));
    }

    return [...(lista || [])].sort((a, b) => {
      const materiaA = Number(a?.materiaId);
      const materiaB = Number(b?.materiaId);

      const ordemA = ordemMateria.get(materiaA);
      const ordemB = ordemMateria.get(materiaB);
      const comparacaoMateria = (ordemA ?? Number.MAX_SAFE_INTEGER) - (ordemB ?? Number.MAX_SAFE_INTEGER);
      if (comparacaoMateria !== 0) return comparacaoMateria;

      const topicoA = Number(a?.topicoId);
      const topicoB = Number(b?.topicoId);
      const posA = ordemTopicoGlobal.get(topicoA);
      const posB = ordemTopicoGlobal.get(topicoB);
      const comparacaoTopico = (posA ?? Number.MAX_SAFE_INTEGER) - (posB ?? Number.MAX_SAFE_INTEGER);
      if (comparacaoTopico !== 0) return comparacaoTopico;

      return String(a?.topicoDescricao || '').localeCompare(String(b?.topicoDescricao || ''), 'pt-BR');
    });
  }

  private folhasTopicos(lista: Topico[]): Topico[] {
    const out: Topico[] = [];
    const walk = (t: Topico) => {
      const filhos = t?.filhos || [];
      if (filhos.length) filhos.forEach(walk);
      else out.push(t);
    };
    (lista || []).forEach(walk);
    return out;
  }

  private converterDtoParaTopico(dto: any, nivel: number = 0): Topico {
    const idRaw =
      dto?.id ??
      dto?.topicoId ??
      dto?.subtopicoId ??
      dto?.idTopico ??
      dto?.idSubtopico ??
      null;

    const id = Number(idRaw);
    const idConvertido = Number.isFinite(id) && id > 0 ? id : undefined;

    const filhos: Topico[] = (dto?.subtopicos || []).map((sub: any) =>
      this.converterDtoParaTopico(sub, nivel + 1)
    );

    return {
      id: idConvertido,
      descricao: dto?.descricao,
      ativo: dto?.ativo ?? true,
      nivel,
      filhos,
      proximaRevisao: dto?.proximaRevisao ?? dto?.dataProximaRevisao ?? null,
      statusRevisao: dto?.statusRevisao
    };
  }
}
