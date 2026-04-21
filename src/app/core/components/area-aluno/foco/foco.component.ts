import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { FocoPlanoDiarioDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { PrioridadeFilaHoje, TipoFilaHoje } from 'src/app/core/models/hoje-fila.models';
import { RevisaoHojeItemDTO } from 'src/app/core/models/revisao-hoje.models';
import { ExecutionQueueService } from 'src/app/core/services/execution-queue.service';
import { FocoPlanoDiarioService } from 'src/app/core/services/foco-plano-diario.service';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { AuthService } from 'src/app/site/services/auth.service';
import { EditalService } from '../services/edital.service';
import { BibliotecaResumoDTO, SalaEstudoService, TopicoNodeDTO } from '../services/sala-estudo.service';
import { extrairStatusCanonicoRevisao } from '../utils/revisao-status.util';

@Component({
  selector: 'app-foco',
  templateUrl: './foco.component.view.html',
  styleUrls: ['./foco.component.scss']
})
export class FocoComponent implements OnInit {
  loadingPlano = false;
  error: string | null = null;
  planoDiario: FocoPlanoDiarioDTO | null = null;
  precisaAtivarEdital = false;
  quantidadeEditaisInativos = 0;
  nomeAluno = 'Aluno(a)';
  streakDias: number | null = null;
  showRevisaoObrigatoriaDialog = false;

  // A fila de revisao e 100% controlada pelo backend.
  // O frontend nao deve alterar, ordenar ou recalcular nada.
  private filaHoje: RevisaoHojeItemDTO[] = [];

  constructor(
    private focoPlanoDiarioService: FocoPlanoDiarioService,
    private router: Router,
    private executionQueueService: ExecutionQueueService,
    private hojeFilaService: HojeFilaService,
    private salaEstudoService: SalaEstudoService,
    private authService: AuthService,
    private editalService: EditalService
  ) {}

  ngOnInit(): void {
    this.carregarNomeAluno();
    this.carregarPlanoDiario();
    this.carregarStreak();
  }

  get isModoRevisao(): boolean {
    return String(this.planoDiario?.modo || '').toUpperCase() === 'REVISAO';
  }

  get itensFiltrados(): RevisaoHojeItemDTO[] {
    return this.filaHoje;
  }

  get botaoAcaoPrincipalLabel(): string {
    return this.itensFiltrados.length > 0 ? 'Revisar agora' : 'Estudar Agora';
  }

  tentarNovamente(): void {
    this.carregarPlanoDiario();
  }

  irParaAtivarEdital(): void {
    this.router.navigate(['/area-restrita/editais']);
  }

  confirmarIrParaRevisao(): void {
    this.showRevisaoObrigatoriaDialog = false;
    this.iniciarRevisao();
  }

  fecharDialogRevisaoObrigatoria(): void {
    this.showRevisaoObrigatoriaDialog = false;
  }

  iniciarRevisao(): void {
    this.iniciarRevisaoDoDia();
  }

  revisar(item: RevisaoHojeItemDTO): void {
    this.executarItem(item);
  }

  isPrimeiraLinhaMateria(index: number): boolean {
    if (index <= 0) return true;
    const atual = this.normalizarMateriaNome(this.itensFiltrados[index]?.materiaNome);
    const anterior = this.normalizarMateriaNome(this.itensFiltrados[index - 1]?.materiaNome);
    return atual !== anterior;
  }

  getItemStatusLabel(item: RevisaoHojeItemDTO | null | undefined): string {
    const status = String(item?.statusCanonico || '').toUpperCase();
    if (status === 'ATRASADA') return 'Vencido';
    if (status === 'HOJE') return 'Para hoje';
    return 'Próximo';
  }

  private carregarNomeAluno(): void {
    const nome = String(this.authService.getUserNameFromToken() || '').trim();
    this.nomeAluno = nome || 'Aluno(a)';
  }

  private carregarStreak(): void {
    this.hojeFilaService.getDashboardStreak()
      .pipe(finalize(() => undefined))
      .subscribe({
        next: (resumo) => {
          this.streakDias = Number(resumo?.streakAtual ?? 0) || null;
        },
        error: () => {
          this.streakDias = null;
        }
      });
  }

  private carregarPlanoDiario(): void {
    this.loadingPlano = true;
    this.error = null;
    this.precisaAtivarEdital = false;
    this.quantidadeEditaisInativos = 0;

    this.focoPlanoDiarioService
      .obterPlanoDiario()
      .pipe(finalize(() => (this.loadingPlano = false)))
      .subscribe({
        next: (dto) => {
          this.planoDiario = dto || null;
          this.carregarFilaRevisaoHoje();
        },
        error: (err: HttpErrorResponse) => {
          this.planoDiario = null;
          this.filaHoje = [];
          if (this.isErroSemEditalAtivo(err)) {
            this.validarEditaisSemAtivo();
            return;
          }
          this.error = this.resolverMensagemErro(err);
        }
      });
  }

  private carregarFilaRevisaoHoje(): void {
    forkJoin({
      resumos: this.salaEstudoService.listarBibliotecaResumos(),
      materias: this.salaEstudoService.listarMateriasParaEstudo('todas')
    }).subscribe({
      next: ({ resumos, materias }) => {
        const topicosIndex = this.indexarTopicos(materias || []);
        const itens = (resumos || [])
          .map((item) => this.mapBibliotecaResumoParaFila(item, topicosIndex.get(Number((item as any)?.topicoId || 0)) || null))
          .filter((item): item is RevisaoHojeItemDTO => !!item);
        this.filaHoje = this.ordenarFilaPorPrioridade(itens);
      },
      error: () => {
        this.filaHoje = [];
      }
    });
  }

  private mapBibliotecaResumoParaFila(
    item: BibliotecaResumoDTO | null | undefined,
    topicoInfo: { statusRevisao: string | null; proximaRevisao: string | null; materiaNome: string | null; topicoNome: string | null } | null
  ): RevisaoHojeItemDTO | null {
    const topicoId = Number((item as any)?.topicoId || 0);
    if (!Number.isFinite(topicoId) || topicoId <= 0) return null;

    const materiaIdRaw = Number((item as any)?.materiaId || 0);
    const materiaId = Number.isFinite(materiaIdRaw) && materiaIdRaw > 0 ? materiaIdRaw : null;
    const statusCanonico = this.normalizarStatusCanonicoBiblioteca(item, topicoInfo);
    if (statusCanonico !== 'ATRASADA' && statusCanonico !== 'HOJE') return null;

    const prioridade = statusCanonico === 'ATRASADA'
      ? PrioridadeFilaHoje.ATRASADA
      : PrioridadeFilaHoje.ALTA;

    const proximaRevisao = String(
      (item as any)?.proximaRevisao ??
      (item as any)?.dataProximaRevisao ??
      ''
    ).trim() || null;

    return {
      topicoId,
      materiaId,
      materiaNome: String(topicoInfo?.materiaNome || (item as any)?.materiaNome || '').trim() || null,
      topicoNome: String(topicoInfo?.topicoNome || (item as any)?.topicoDescricao || (item as any)?.topicoNome || '').trim() || null,
      prioridade,
      statusCanonico,
      proximaRevisao,
      motivo: statusCanonico === 'ATRASADA' ? 'Revisao atrasada.' : 'Revisao prevista para hoje.',
      tempoEstimadoMinutos: null,
      deepLink: materiaId
        ? `/area-restrita/sala-estudo/${materiaId}?topicoId=${topicoId}&modo=revisar&origem=foco`
        : '/area-restrita/revisoes',
      tipo: TipoFilaHoje.TOPICO,
      categoria: null,
      score: null
    };
  }

  private normalizarStatusCanonicoBiblioteca(
    item: BibliotecaResumoDTO | null | undefined,
    topicoInfo: { statusRevisao: string | null; proximaRevisao: string | null } | null
  ): 'ATRASADA' | 'HOJE' | 'FUTURA' {
    const canonico = extrairStatusCanonicoRevisao({
      statusCanonico: (item as any)?.statusCanonico,
      statusRevisao: topicoInfo?.statusRevisao ?? (item as any)?.statusRevisao,
      status: (item as any)?.status,
      proximaRevisao:
        topicoInfo?.proximaRevisao ??
        (item as any)?.proximaRevisao ??
        (item as any)?.dataProximaRevisao
    });

    if (canonico === 'ATRASADA') return 'ATRASADA';
    if (canonico === 'HOJE') return 'HOJE';
    return 'FUTURA';
  }

  private indexarTopicos(materias: any[]): Map<number, { statusRevisao: string | null; proximaRevisao: string | null; materiaNome: string | null; topicoNome: string | null }> {
    const index = new Map<number, { statusRevisao: string | null; proximaRevisao: string | null; materiaNome: string | null; topicoNome: string | null }>();
    (materias || []).forEach((m) => {
      const materiaNome = String((m as any)?.materiaNome || '').trim() || null;
      const topicos = Array.isArray((m as any)?.topicos) ? ((m as any)?.topicos as TopicoNodeDTO[]) : [];
      this.walkTopicos(topicos, materiaNome, index);
    });
    return index;
  }

  private walkTopicos(
    topicos: TopicoNodeDTO[],
    materiaNome: string | null,
    index: Map<number, { statusRevisao: string | null; proximaRevisao: string | null; materiaNome: string | null; topicoNome: string | null }>
  ): void {
    (topicos || []).forEach((topico) => {
      const topicoId = Number((topico as any)?.id ?? (topico as any)?.topicoId ?? (topico as any)?.subtopicoId ?? 0);
      if (Number.isFinite(topicoId) && topicoId > 0) {
        index.set(topicoId, {
          statusRevisao: String((topico as any)?.statusRevisao || '').trim() || null,
          proximaRevisao: String((topico as any)?.proximaRevisao || '').trim() || null,
          materiaNome,
          topicoNome: String((topico as any)?.descricao || '').trim() || null
        });
      }

      const filhos = Array.isArray((topico as any)?.subtopicos)
        ? ((topico as any)?.subtopicos as TopicoNodeDTO[])
        : (Array.isArray((topico as any)?.filhos) ? ((topico as any)?.filhos as TopicoNodeDTO[]) : []);

      if (filhos.length > 0) {
        this.walkTopicos(filhos, materiaNome, index);
      }
    });
  }

  private iniciarRevisaoDoDia(): void {
    const topicosPriorizados = this.obterTopicosPriorizados(this.filaHoje || []);
    if (!topicosPriorizados.length) {
      this.router.navigate(['/area-restrita/registrar-livre']);
      return;
    }

    const primeiroTopicoId = topicosPriorizados[0];
    const itemInicial = (this.filaHoje || []).find((item) => Number(item?.topicoId || 0) === primeiroTopicoId);
    const materiaIdInicial = Number(itemInicial?.materiaId || 0);

    this.router.navigate(['/area-restrita/biblioteca/resumo', primeiroTopicoId], {
      queryParams: {
        topicos: topicosPriorizados.join(','),
        origem: 'hoje',
        materiaId: materiaIdInicial > 0 ? materiaIdInicial : null
      }
    });
  }

  private executarItem(item: RevisaoHojeItemDTO): void {
    const topicoId = Number(item?.topicoId || 0);
    if (topicoId <= 0) return;
    const topicosPriorizados = this.obterTopicosPriorizados(this.filaHoje || []);
    const materiaId = Number(item?.materiaId || 0);

    this.router.navigate(['/area-restrita/biblioteca/resumo', topicoId], {
      queryParams: {
        topicos: topicosPriorizados.join(','),
        origem: 'hoje',
        materiaId: materiaId > 0 ? materiaId : null
      }
    });
  }

  private obterTopicosPriorizados(filaRevisao: RevisaoHojeItemDTO[]): number[] {
    const unicos = new Set<number>();
    const ordenada = this.ordenarFilaPorPrioridade(filaRevisao || []);
    (ordenada || []).forEach((item) => {
      const topicoId = Number(item?.topicoId || 0);
      if (topicoId > 0) {
        unicos.add(topicoId);
      }
    });
    return Array.from(unicos.values());
  }

  private ordenarFilaPorPrioridade(filaRevisao: RevisaoHojeItemDTO[]): RevisaoHojeItemDTO[] {
    const peso = (item: RevisaoHojeItemDTO): number => {
      const status = String(item?.statusCanonico || '').toUpperCase();
      if (status === 'ATRASADA') return 0;
      if (status === 'HOJE') return 1;
      return 2;
    };

    const toTime = (iso: string | null | undefined): number => {
      const texto = String(iso || '').trim();
      if (!texto) return Number.POSITIVE_INFINITY;
      const t = new Date(texto).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };

    return [...(filaRevisao || [])].sort((a, b) => {
      const p = peso(a) - peso(b);
      if (p !== 0) return p;

      const d = toTime(a?.proximaRevisao) - toTime(b?.proximaRevisao);
      if (d !== 0) return d;

      const m = String(a?.materiaNome || '').localeCompare(String(b?.materiaNome || ''), 'pt-BR');
      if (m !== 0) return m;
      return String(a?.topicoNome || '').localeCompare(String(b?.topicoNome || ''), 'pt-BR');
    });
  }

  private normalizarMateriaNome(value: unknown): string {
    return String(value || '').trim().toUpperCase();
  }

  private resolverMensagemErro(err: HttpErrorResponse): string {
    const serverMessage = String(err?.error?.message || '').trim();
    if (serverMessage) return serverMessage;
    return 'Nao foi possivel carregar o plano diario.';
  }

  private isErroSemEditalAtivo(err: HttpErrorResponse): boolean {
    const status = Number(err?.status || 0);
    const serverMessage = String(err?.error?.message || '').trim().toLowerCase();
    const detail = String(err?.error?.detail || '').trim().toLowerCase();
    const text = `${serverMessage} ${detail}`;
    const mencionaSemEditalAtivo = text.includes('nenhum edital ativo');
    return mencionaSemEditalAtivo || status === 412;
  }

  private validarEditaisSemAtivo(): void {
    this.editalService.listar().subscribe({
      next: (editais) => {
        const lista = Array.isArray(editais) ? editais : [];
        if (lista.length === 0) {
          this.router.navigate(['/area-restrita/registrar-livre']);
          return;
        }
        const existeAtivo = lista.some((edital) => edital?.ativo === true);
        if (existeAtivo) {
          this.error = 'Nao foi possivel carregar o plano diario.';
          return;
        }
        this.error = null;
        this.precisaAtivarEdital = true;
        this.quantidadeEditaisInativos = lista.length;
      },
      error: () => {
        this.error = 'Nao foi possivel validar seus editais.';
      }
    });
  }
}
