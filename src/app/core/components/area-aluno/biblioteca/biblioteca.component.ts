import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { SalaEstudoService, MateriaTopicosDTO, BibliotecaResumoDTO } from '../services/sala-estudo.service';
import { BibliotecaFlashcardDTO, FlashcardCriticoDTO, FlashcardService } from '../services/flashcard.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TreeNode } from 'primeng/api';
import { ExecutionQueueItem, ExecutionQueueService } from 'src/app/core/services/execution-queue.service';
import { extrairStatusCanonicoRevisao, statusCanonicoParaDashboard } from '../utils/revisao-status.util';
import { EditalService } from '../services/edital.service';
import { Edital } from '../models/Edital';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';

type BibliotecaModo = 'resumos' | 'flashcards';
type StatusRevisao = 'VENCIDA' | 'EM_DIA' | 'FUTURA';

type BibliotecaTreeRow = {
  rowKey: string;
  label: string;
  materiaNome?: string;
  source?: BibliotecaResumoDTO;
  status?: StatusRevisao;
  proximaRevisaoIso?: string | null;
  proximaRevisaoLabel?: string;
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
  dificuldadeSelecionada: FlashcardDTO['dificuldade'] | null = null;
  somentePendentes = false;
  somenteCriticos = false;
  modo: BibliotecaModo = 'resumos';
  termoBusca = '';

  carregando = false;
  carregandoFlashcards = false;
  carregandoResumos = false;
  erro?: string;

  flashcards: BibliotecaFlashcardDTO[] = [];
  flashcardsCriticos: FlashcardCriticoDTO[] = [];
  carregandoFlashcardsCriticos = false;
  resumosDisponiveis: BibliotecaResumoDTO[] = [];
  resumosTreeNodes: TreeNode[] = [];
  resumoLinhaSelecionadaKey: string | null = null;
  modalFlashcardAberto = false;
  salvandoFlashcard = false;
  mensagemFlashcardSucesso?: string;
  flashcardEdicaoId: number | null = null;
  flashcardModalInitialData: Partial<FlashcardDTO> | null = null;
  flashcardModalMateriaNome = '-';
  flashcardModalTopicoNome = '-';
  private flashcardIdPreferido: number | null = null;
  private buscaTimer?: any;
  private escopoValor = 'todas';
  private editais: Edital[] = [];
  private materiasPorEdital = new Map<number, Set<number>>();
  private materiasAtivasPorEditais = new Set<number>();

  constructor(
    private salaEstudoService: SalaEstudoService,
    private flashcardService: FlashcardService,
    private executionQueueService: ExecutionQueueService,
    private editalService: EditalService,
    private empresaParametroService: EmpresaParametroService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.aplicarEstadoInicialViaQuery();
    this.carregarContextoEdital();
  }

  private carregarContextoEdital(): void {
    forkJoin({
      escopo: this.empresaParametroService.getParametroPorChave('centro_estudo_filtro_pro_prova').pipe(catchError(() => of(null))),
      editais: this.editalService.listarComInclude(['materias']).pipe(catchError(() => of([] as Edital[])))
    }).subscribe(({ escopo, editais }) => {
      this.escopoValor = String(escopo || 'todas').trim() || 'todas';
      this.editais = Array.isArray(editais) ? editais : [];
      this.rebuildEditaisIndex();
      this.carregarMaterias();
      this.carregarFlashcardsCriticos();
    });
  }

  private aplicarEstadoInicialViaQuery(): void {
    const query = this.route.snapshot.queryParamMap;
    const modo = String(query.get('modo') || '').trim().toLowerCase();
    if (modo === 'flashcards') {
      this.modo = 'flashcards';
    }

    const materiaId = Number(query.get('materiaId') || 0);
    if (Number.isFinite(materiaId) && materiaId > 0) {
      this.materiaSelecionadaId = materiaId;
    }

    const topicoId = Number(query.get('topicoId') || 0);
    if (Number.isFinite(topicoId) && topicoId > 0) {
      this.topicoSelecionadoId = topicoId;
    }

    const flashcardId = Number(query.get('flashcardId') || 0);
    this.flashcardIdPreferido = Number.isFinite(flashcardId) && flashcardId > 0 ? flashcardId : null;

    const dificuldade = String(query.get('dificuldade') || '').trim().toUpperCase();
    if (dificuldade) {
      this.dificuldadeSelecionada = dificuldade as FlashcardDTO['dificuldade'];
    }
    this.somentePendentes = (query.get('pendentes') || '').toLowerCase() === 'true';
    this.somenteCriticos = (query.get('criticos') || '').toLowerCase() === 'true';
  }

  private carregarMaterias(): void {
    this.carregando = true;
    this.erro = undefined;
    const materiasPermitidas = this.getMateriaIdsPermitidas();

    this.salaEstudoService.listarMateriasParaEstudo(this.escopoValor || 'todas').subscribe({
      next: (lista) => {
        const materias: Materia[] = [];
        this.topicosPorMateria.clear();

        (lista || []).forEach((item: MateriaTopicosDTO) => {
          const materiaId = Number(item?.materiaId);
          const materiaNome = String(item?.materiaNome || '').trim();
          if (!Number.isFinite(materiaId) || materiaId <= 0 || !materiaNome) {
            return;
          }
          if (materiasPermitidas && !materiasPermitidas.has(materiaId)) {
            return;
          }
          materias.push({ id: materiaId, nome: materiaNome });
          const topicos = (item?.topicos || []).map((dto: any) => this.converterDtoParaTopico(dto, 0));
          this.topicosPorMateria.set(materiaId, topicos);
        });

        this.materias = materias;
        if (this.materiaSelecionadaId && !this.materias.some((m) => Number(m.id) === Number(this.materiaSelecionadaId))) {
          this.materiaSelecionadaId = null;
          this.topicoSelecionadoId = null;
        }
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

  onDificuldadeChange(): void {
    this.recarregarLista();
  }

  onPendentesChange(): void {
    this.recarregarLista();
  }

  onCriticosChange(): void {
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

  get contagemRevisoesResumo(): { vencidas: number; hoje: number; emDia: number } {
    let vencidas = 0;
    let hoje = 0;
    let emDia = 0;

    const walk = (nodes: TreeNode[]): void => {
      (nodes || []).forEach((node) => {
        const data = node?.data as BibliotecaTreeRow | undefined;
        if (data?.isTopico && data?.source && data?.status) {
          if (data.status === 'VENCIDA') vencidas += 1;
          else if (data.status === 'EM_DIA') hoje += 1;
          else if (data.status === 'FUTURA') emDia += 1;
        }
        if (node?.children?.length) {
          walk(node.children);
        }
      });
    };

    walk(this.resumosTreeNodes);
    return { vencidas, hoje, emDia };
  }

  private carregarFlashcards(): void {
    this.flashcards = [];
    this.carregandoFlashcards = true;
    const materiasPermitidas = this.getMateriaIdsPermitidas();

    this.flashcardService.listarBibliotecaFlashcards({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca,
      dificuldade: this.dificuldadeSelecionada,
      pendentes: this.somentePendentes ? true : undefined,
      criticos: this.somenteCriticos ? true : undefined
    }).subscribe({
      next: (lista) => {
        const base = lista || [];
        this.flashcards = materiasPermitidas
          ? base.filter((item) => materiasPermitidas.has(Number(item?.materiaId || 0)))
          : base;
        if (this.flashcardIdPreferido) {
          const alvo = this.flashcards.find((item) => Number(item?.flashcardId || 0) === this.flashcardIdPreferido);
          if (alvo) {
            this.editarFlashcard(alvo);
            this.flashcardIdPreferido = null;
          }
        }
        this.carregandoFlashcards = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar flashcards:', err);
        this.carregandoFlashcards = false;
      }
    });
  }

  private carregarFlashcardsCriticos(): void {
    this.carregandoFlashcardsCriticos = true;
    const materiasPermitidas = this.getMateriaIdsPermitidas();
    this.flashcardService.listarFlashcardsCriticos().subscribe({
      next: (lista) => {
        const base = lista || [];
        this.flashcardsCriticos = materiasPermitidas
          ? base.filter((item) => materiasPermitidas.has(Number((item as any)?.materiaId || 0)))
          : base;
        this.carregandoFlashcardsCriticos = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar flashcards criticos:', err);
        this.flashcardsCriticos = [];
        this.carregandoFlashcardsCriticos = false;
      }
    });
  }

  private carregarResumosDisponiveis(): void {
    this.resumosDisponiveis = [];
    this.carregandoResumos = true;
    this.erro = undefined;
    const materiasPermitidas = this.getMateriaIdsPermitidas();

    this.salaEstudoService.listarBibliotecaResumos({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca
    }).subscribe({
      next: (lista) => {
        const base = lista || [];
        const filtrada = materiasPermitidas
          ? base.filter((item) => materiasPermitidas.has(Number(item?.materiaId || 0)))
          : base;
        this.resumosDisponiveis = this.ordenarResumosComoLivro(filtrada);
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
    const materiasPermitidas = this.getMateriaIdsPermitidas();

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
        const filtrada = materiasPermitidas
          ? combinado.filter((item) => materiasPermitidas.has(Number(item?.materiaId || 0)))
          : combinado;
        this.resumosDisponiveis = this.ordenarResumosComoLivro(filtrada);
        this.atualizarArvoreResumos();
        this.carregandoResumos = false;
        if (!filtrada.length) {
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
    this.garantirSelecaoResumoValida();
  }

  onResumoRowClick(event: MouseEvent, rowNode: TreeNode, rowData: BibliotecaTreeRow): void {
    const target = event.target;
    if (target instanceof Element && target.closest('button, .p-treetable-toggler')) {
      return;
    }

    this.resumoLinhaSelecionadaKey = rowData?.rowKey || null;

    if (rowNode?.children?.length) {
      rowNode.expanded = !rowNode.expanded;
      this.resumosTreeNodes = [...this.resumosTreeNodes];
    }
  }

  isResumoLinhaSelecionada(rowData?: BibliotecaTreeRow | null): boolean {
    return !!rowData?.rowKey && rowData.rowKey === this.resumoLinhaSelecionadaKey;
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
              rowKey: `resumo-${Number(item.topicoId) || item.topicoDescricao}`,
              label: item.topicoDescricao,
              materiaNome: item.materiaNome,
              source: item,
              status: this.resolverStatusTopico(null, item),
              proximaRevisaoIso: null,
              proximaRevisaoLabel: this.formatarProximaRevisao(null),
              hasChildren: false,
              isTopico: true
            } as BibliotecaTreeRow,
            leaf: true
          } as TreeNode))
        : filhos;

      const proximaRevisaoMateria = this.obterMenorProximaRevisaoMateria(topicos);

      nodes.push({
        data: {
          rowKey: `materia-${materiaId}`,
          label: materia.nome,
          proximaRevisaoIso: proximaRevisaoMateria,
          proximaRevisaoLabel: this.formatarProximaRevisao(proximaRevisaoMateria),
          isMateria: true,
          hasChildren: filhosFallback.length > 0
        } as BibliotecaTreeRow,
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
          rowKey: `topico-${id || topico?.descricao || ''}`,
          label: topico?.descricao || '',
          materiaNome: resumo?.materiaNome,
          source: resumo,
          status: this.resolverStatusTopico(topico, resumo),
          proximaRevisaoIso: topico?.proximaRevisao ?? null,
          proximaRevisaoLabel: this.formatarProximaRevisao(topico?.proximaRevisao),
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

  private garantirSelecaoResumoValida(): void {
    if (!this.resumoLinhaSelecionadaKey) {
      return;
    }

    const existe = this.existeRowKeyNasArvores(this.resumosTreeNodes, this.resumoLinhaSelecionadaKey);
    if (!existe) {
      this.resumoLinhaSelecionadaKey = null;
    }
  }

  private existeRowKeyNasArvores(nodes: TreeNode[], rowKey: string): boolean {
    for (const node of nodes || []) {
      const data = node?.data as BibliotecaTreeRow | undefined;
      if (data?.rowKey === rowKey) {
        return true;
      }
      if (node?.children?.length && this.existeRowKeyNasArvores(node.children, rowKey)) {
        return true;
      }
    }
    return false;
  }

  abrirNovoFlashcard(): void {
    if (this.modo !== 'flashcards') {
      this.modo = 'flashcards';
      this.recarregarLista();
    }
    if (!this.materiaSelecionadaId || !this.topicoSelecionadoId) {
      alert('Selecione matéria e tópico para criar um novo flashcard.');
      return;
    }

    const materia = this.materias.find((m) => Number(m.id) === Number(this.materiaSelecionadaId));
    const topico = this.folhasDisponiveis.find((t) => Number(t.id) === Number(this.topicoSelecionadoId));

    this.flashcardEdicaoId = null;
    this.flashcardModalInitialData = {
      materiaId: Number(this.materiaSelecionadaId),
      topicoId: Number(this.topicoSelecionadoId),
      tipo: 'PERGUNTA_RESPOSTA',
      dificuldade: 'MEDIA',
      frente: '',
      verso: '',
      tags: ''
    };
    this.flashcardModalMateriaNome = String(materia?.nome || '-');
    this.flashcardModalTopicoNome = String(topico?.descricao || '-');
    this.mensagemFlashcardSucesso = undefined;
    this.modalFlashcardAberto = true;
  }

  editarFlashcard(item: BibliotecaFlashcardDTO): void {
    if (!item) return;
    this.flashcardEdicaoId = Number(item.flashcardId || 0) || null;
    this.flashcardModalInitialData = {
      id: this.flashcardEdicaoId || undefined,
      materiaId: Number(item.materiaId || 0),
      topicoId: Number(item.topicoId || 0),
      frente: String(item.frente || ''),
      verso: String(item.verso || ''),
      tipo: 'PERGUNTA_RESPOSTA',
      dificuldade: (String(item.dificuldade || 'MEDIA') as FlashcardDTO['dificuldade']),
      tags: String(item.tags || '')
    };
    this.flashcardModalMateriaNome = String(item.materiaNome || '-');
    this.flashcardModalTopicoNome = String(item.topicoDescricao || '-');
    this.mensagemFlashcardSucesso = undefined;
    this.modalFlashcardAberto = true;
  }

  excluirFlashcard(item: BibliotecaFlashcardDTO): void {
    const id = Number(item?.flashcardId || 0);
    if (id <= 0) return;
    const confirmou = window.confirm('Deseja realmente excluir este flashcard?');
    if (!confirmou) return;

    this.flashcardService.excluirFlashcard(id).subscribe({
      next: () => {
        this.recarregarLista();
        this.carregarFlashcardsCriticos();
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao excluir flashcard:', err);
        alert('Erro ao excluir flashcard.');
      }
    });
  }

  fecharModalFlashcard(): void {
    this.modalFlashcardAberto = false;
    this.flashcardEdicaoId = null;
    this.flashcardModalInitialData = null;
    this.mensagemFlashcardSucesso = undefined;
  }

  salvarFlashcardDoModal(payload: FlashcardDTO): void {
    const idEdicao = Number(this.flashcardEdicaoId || payload?.id || 0);
    this.salvandoFlashcard = true;

    const req$ = idEdicao > 0
      ? this.flashcardService.atualizarFlashcard(idEdicao, payload)
      : this.flashcardService.criarFlashcard(payload);

    req$.subscribe({
      next: () => {
        this.salvandoFlashcard = false;
        this.mensagemFlashcardSucesso = idEdicao > 0
          ? 'Flashcard atualizado com sucesso.'
          : 'Flashcard salvo com sucesso.';
        this.recarregarLista();
        this.carregarFlashcardsCriticos();
        if (idEdicao > 0) {
          setTimeout(() => this.fecharModalFlashcard(), 350);
        } else {
          this.flashcardEdicaoId = null;
          this.flashcardModalInitialData = {
            ...payload,
            id: undefined,
            frente: '',
            verso: ''
          };
        }
      },
      error: (err) => {
        this.salvandoFlashcard = false;
        console.error('[BIBLIOTECA] Erro ao salvar flashcard:', err);
        alert('Erro ao salvar flashcard.');
      }
    });
  }

  getTotalRevisoes(item: BibliotecaFlashcardDTO): number {
    const total = Number((item as any)?.totalRevisoes ?? (item as any)?.revisoes ?? 0);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  getTotalAcertos(item: BibliotecaFlashcardDTO): number {
    const total = Number((item as any)?.totalAcertos ?? (item as any)?.acertos ?? 0);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  formatarTaxaAcerto(item: BibliotecaFlashcardDTO): string {
    const taxa = Number((item as any)?.taxaAcerto ?? 0);
    if (!Number.isFinite(taxa) || taxa <= 0) return '0%';
    return `${Math.round(taxa * 100)}%`;
  }

  getTotalRevisoesCritico(item: FlashcardCriticoDTO): number {
    const total = Number((item as any)?.totalRevisoes ?? (item as any)?.revisoes ?? 0);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  getTotalAcertosCritico(item: FlashcardCriticoDTO): number {
    const total = Number((item as any)?.totalAcertos ?? (item as any)?.acertos ?? 0);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  formatarTaxaAcertoCritico(item: FlashcardCriticoDTO): string {
    const taxa = Number((item as any)?.taxaAcerto ?? 0);
    if (!Number.isFinite(taxa) || taxa <= 0) return '0%';
    return `${Math.round(taxa * 100)}%`;
  }

  treinarFlashcardsCriticos(): void {
    const filaMap = new Map<string, ExecutionQueueItem>();
    (this.flashcardsCriticos || []).forEach((item) => {
      const topicoId = Number(item?.topicoId || 0);
      const materiaId = Number(item?.materiaId || 0);
      if (topicoId <= 0 || materiaId <= 0) return;
      const chave = `${materiaId}:${topicoId}`;
      if (!filaMap.has(chave)) {
        filaMap.set(chave, { materiaId, topicoId });
      }
    });

    const fila = Array.from(filaMap.values());
    if (!fila.length) return;

    this.executionQueueService.setFila(fila);
    const primeiro = fila[0];
    this.router.navigate(['/area-restrita/sala-estudo/executar'], {
      queryParams: {
        modo: 'revisar',
        topicoId: primeiro.topicoId,
        filaExecucao: '1',
        topicos: fila.map((item) => item.topicoId).join(',')
      },
      state: { executionQueue: fila }
    });
  }

  private rebuildEditaisIndex(): void {
    this.materiasPorEdital.clear();
    this.materiasAtivasPorEditais.clear();

    (this.editais || []).forEach((edital) => {
      const editalId = Number(edital?.id || 0);
      if (editalId <= 0) return;

      const ids = new Set<number>();
      (edital?.materias || []).forEach((m: any) => {
        const materiaId = Number(m?.materiaId || m?.id || 0);
        if (materiaId > 0) ids.add(materiaId);
      });
      this.materiasPorEdital.set(editalId, ids);

      if (this.isEditalAtivo(edital)) {
        ids.forEach((id) => this.materiasAtivasPorEditais.add(id));
      }
    });
  }

  private isEditalAtivo(edital: Edital | null | undefined): boolean {
    const valor: any = (edital as any)?.ativo;
    if (valor === undefined || valor === null) return false;
    if (typeof valor === 'boolean') return valor;
    if (typeof valor === 'number') return valor === 1;
    if (typeof valor === 'string') {
      const normalizado = valor.trim().toLowerCase();
      return normalizado === 'true' || normalizado === '1' || normalizado === 'ativo';
    }
    return false;
  }

  private getMateriaIdsPermitidas(): Set<number> | null {
    const escopo = String(this.escopoValor || 'todas').trim().toLowerCase();
    if (escopo.startsWith('edital-')) {
      const editalId = Number(escopo.replace('edital-', ''));
      if (!Number.isFinite(editalId) || editalId <= 0) return new Set<number>();
      const edital = (this.editais || []).find((e) => Number(e?.id || 0) === editalId);
      if (!this.isEditalAtivo(edital)) return new Set<number>();
      return new Set<number>(this.materiasPorEdital.get(editalId) || []);
    }

    if (this.materiasAtivasPorEditais.size > 0) {
      return new Set<number>(this.materiasAtivasPorEditais);
    }

    return null;
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

  private formatarProximaRevisao(valor: string | null | undefined): string {
    if (!valor) return '-';

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
      return String(valor);
    }

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(data);
  }

  private obterMenorProximaRevisaoMateria(topicos: Topico[]): string | null {
    let menorIso: string | null = null;
    let menorTime = Number.POSITIVE_INFINITY;

    const walk = (lista: Topico[]): void => {
      (lista || []).forEach((topico) => {
        const iso = String(topico?.proximaRevisao || '').trim();
        if (iso) {
          const data = new Date(iso);
          const time = data.getTime();
          if (!Number.isNaN(time) && time < menorTime) {
            menorTime = time;
            menorIso = iso;
          }
        }

        if (topico?.filhos?.length) {
          walk(topico.filhos);
        }
      });
    };

    walk(topicos || []);
    return menorIso;
  }

  private resolverStatusTopico(topico: Topico | null | undefined, resumo?: BibliotecaResumoDTO): StatusRevisao | undefined {
    const item = {
      statusCanonico: (topico as any)?.statusCanonico,
      statusRevisao: topico?.statusRevisao,
      status: (topico as any)?.status,
      proximaRevisao: topico?.proximaRevisao ?? (resumo as any)?.proximaRevisao ?? (resumo as any)?.dataProximaRevisao
    };
    const canonico = extrairStatusCanonicoRevisao(item);
    return statusCanonicoParaDashboard(canonico) || undefined;
  }
}
