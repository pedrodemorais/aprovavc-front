import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, Subject, merge, of } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, switchMap, tap, withLatestFrom } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AgendaDiaDTO,
  PressaoDoDiaDTO,
  PressaoFilaItemDTO,
  PressaoJanelaDias
} from 'src/app/core/api/dto/pressao-do-dia.dto';
import { DashboardPressaoService } from 'src/app/core/api/services/dashboard-pressao.service';
import { ExecutionQueueService } from 'src/app/core/services/execution-queue.service';

type FiltroFila = 'todos' | 'criticos' | 'emRisco';

@Component({
  selector: 'app-foco',
  templateUrl: './foco.component.view.html',
  styleUrls: ['./foco.component.scss']
})
export class FocoComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly janela$ = new BehaviorSubject<PressaoJanelaDias>(1);
  private readonly refresh$ = new Subject<void>();
  private requestSeq = 0;

  readonly janelasDisponiveis: PressaoJanelaDias[] = [1, 7, 15, 30];
  janelaDiasSelecionada: PressaoJanelaDias = 1;

  loading = false;
  error: string | null = null;

  pressao: PressaoDoDiaDTO | null = null;
  modoHojeLabel = '-';
  headlineHoje = 'Sem headline no momento.';

  criticos = 0;
  emRisco = 0;
  manutencaoVencida = 0;
  manutencaoHoje = 0;
  totalHoje = 0;

  capAplicado = 0;
  totalDisponivelHoje = 0;
  exibindoHoje = 0;

  agendaJanela: AgendaDiaDTO[] = [];
  ateLabel = '-';

  streakDias = 0;
  coberturaTotal = 0;
  coberturaEstudados = 0;
  coberturaNaoEstudados = 0;

  filaHoje: PressaoFilaItemDTO[] = [];
  filtroFila: FiltroFila = 'todos';

  constructor(
    private dashboardPressaoService: DashboardPressaoService,
    private messageService: MessageService,
    private router: Router,
    private executionQueueService: ExecutionQueueService
  ) {}

  ngOnInit(): void {
    merge(
      this.janela$.pipe(distinctUntilChanged()),
      this.refresh$.pipe(
        withLatestFrom(this.janela$),
        map(([, janelaDias]) => janelaDias)
      )
    )
      .pipe(
        tap(() => {
          this.loading = true;
          this.error = null;
          this.requestSeq += 1;
        }),
        switchMap((janelaDias) => {
          const seqAtual = this.requestSeq;
          return this.dashboardPressaoService.getPressaoDoDia(janelaDias).pipe(
            map((dto) => ({ dto, seq: seqAtual })),
            catchError((err: HttpErrorResponse) => {
              const mensagem = this.resolverMensagemErro(err);
              return of({ dto: null, seq: seqAtual, mensagemErro: mensagem, status: err?.status || 0 });
            }),
            finalize(() => {
              if (seqAtual === this.requestSeq) {
                this.loading = false;
              }
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((resultado) => {
        if (resultado.seq !== this.requestSeq) {
          return;
        }

        if (!resultado.dto) {
          this.pressao = null;
          this.error = resultado.mensagemErro || 'Nao foi possivel carregar a pressao do dia.';
          if (resultado.status === 400) {
            this.messageService.add({
              severity: 'warn',
              summary: 'Janela invalida',
              detail: 'Janela invalida'
            });
          }
          return;
        }

        this.aplicarDto(resultado.dto);
      });
  }

  selecionarJanela(janela: PressaoJanelaDias): void {
    this.janelaDiasSelecionada = janela;
    this.janela$.next(janela);
  }

  tentarNovamente(): void {
    this.refresh$.next();
  }

  setFiltroFila(filtro: FiltroFila): void {
    this.filtroFila = filtro;
  }

  formatScore(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(Number(score))) {
      return '-';
    }
    return Number(score).toFixed(2);
  }

  formatLocalDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return String(dateStr);
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }

  acaoItemLabel(item: PressaoFilaItemDTO): string {
    const label = String(item?.acaoLabel || '').trim();
    if (label) return label;
    const classificacao = String(item?.classificacao || '').toUpperCase();
    return classificacao === 'ESTUDO' ? 'Estudar' : 'Revisar';
  }

  executarItem(item: PressaoFilaItemDTO): void {
    const deepLink = String(item?.deepLink || '').trim();
    if (deepLink) {
      this.router.navigateByUrl(deepLink);
      return;
    }

    const materiaId = Number(item?.materiaId || 0);
    const topicoId = Number(item?.topicoId || 0);

    if (materiaId > 0 && topicoId > 0) {
      this.router.navigate(['/area-restrita/sala-estudo', materiaId], {
        queryParams: { topicoId, modo: 'revisar' }
      });
      return;
    }

    this.router.navigate(['/area-restrita/revisoes']);
  }

  get vencemHojeTotal(): number {
    return Math.max(0, this.manutencaoHoje + this.manutencaoVencida);
  }

  get totalAcionavelHoje(): number {
    if (Array.isArray(this.filaHoje) && this.filaHoje.length > 0) {
      return this.filaHoje.length;
    }
    return Math.max(0, this.criticos + this.emRisco + this.vencemHojeTotal);
  }

  get itensMostrados(): number {
    const exibindo = Number(this.exibindoHoje || 0);
    if (Number.isFinite(exibindo) && exibindo > 0) return exibindo;
    return this.filaHoje.length;
  }

  get exibicaoRealHoje(): number {
    const exibReal = Array.isArray(this.filaHoje) ? this.filaHoje.length : 0;
    if (exibReal > 0) return exibReal;
    const exibPayload = Number(this.exibindoHoje || 0);
    return Number.isFinite(exibPayload) && exibPayload > 0 ? exibPayload : 0;
  }

  get truncadoCap(): boolean {
    const total = Number(this.totalDisponivelHoje || 0);
    const cap = Number(this.capAplicado || 0);
    const exib = this.exibicaoRealHoje;
    return total > exib && cap > 0;
  }

  get labelExibicaoCap(): string {
    const total = Number(this.totalDisponivelHoje || 0);
    const cap = Number(this.capAplicado || 0);
    const exib = this.exibicaoRealHoje;
    if (this.truncadoCap) {
      return `Exibindo ${exib} de ${total} (cap ${cap})`;
    }
    return `Exibindo ${exib}`;
  }

  get tooltipCap(): string {
    if (!this.truncadoCap) return '';
    const total = Number(this.totalDisponivelHoje || 0);
    const cap = Number(this.capAplicado || 0);
    const exib = this.exibicaoRealHoje;
    const ocultos = Math.max(0, total - exib);
    return `Seu cap diario e ${cap}. Existem ${ocultos} itens adicionais disponiveis hoje, mas foram ocultados para manter a carga sustentavel.`;
  }

  get heroStatusClass(): string {
    if (this.criticos > 0) return 'hero hero--danger';
    if (this.emRisco > 0) return 'hero hero--warn';
    return 'hero hero--success';
  }

  get heroFrasePrincipal(): string {
    if (this.totalAcionavelHoje <= 0) {
      return 'Hoje esta tudo em dia';
    }
    return `Hoje voce tem ${this.totalAcionavelHoje} topicos acionaveis para revisar.`;
  }

  get heroDescricao(): string {
    if (this.totalAcionavelHoje <= 0) {
      return 'Sem pendencias acionaveis para hoje. Voce pode avancar no planejamento.';
    }
    const prioridade = this.modoHojeLabel === 'Score' ? 'score' : 'data';
    return `Modo ativo: ${prioridade}. Resolva os itens e mantenha sua fila sob controle.`;
  }

  get heroNotaPrioridade(): string {
    if (this.modoHojeLabel === 'Score') return 'Prioridade: score -> data';
    return 'Prioridade: data';
  }

  get mostrarHeroKpis(): boolean {
    return this.totalAcionavelHoje > 0;
  }

  get heroCtaLabel(): string {
    return this.totalAcionavelHoje > 0 ? 'Iniciar revisao do dia' : 'Ir para Planejamento';
  }

  get podeExecutarHeroCta(): boolean {
    return this.totalAcionavelHoje > 0;
  }

  executarHeroCta(): void {
    if (this.totalAcionavelHoje > 0) {
      this.iniciarRevisaoDoDia();
      return;
    }
    this.router.navigate(['/area-restrita/estudar-materias']);
  }

  get filaHojeFiltrada(): PressaoFilaItemDTO[] {
    const lista = Array.isArray(this.filaHoje) ? this.filaHoje : [];
    if (this.filtroFila === 'todos') return lista;

    if (this.filtroFila === 'criticos') {
      return lista.filter((item) => String(item?.classificacao || '').toUpperCase().includes('CRITICO'));
    }

    return lista.filter((item) => String(item?.classificacao || '').toUpperCase().includes('RISCO'));
  }

  iniciarRevisaoDoDia(): void {
    const filaCompleta = (this.filaHoje || [])
      .map((item) => ({
        topicoId: Number(item?.topicoId || 0),
        materiaId: Number(item?.materiaId || 0) || null
      }))
      .filter((item) => item.topicoId > 0);

    if (!filaCompleta.length) {
      return;
    }

    this.executionQueueService.setFila(filaCompleta);
    const topicosSerializados = filaCompleta.map((item) => item.topicoId).join(',');
    const primeiro = filaCompleta[0];
    const primeiraMateriaId = Number(primeiro?.materiaId || 0);
    const primeiroTopicoId = Number(primeiro?.topicoId || 0);

    if (primeiraMateriaId > 0 && primeiroTopicoId > 0) {
      this.router.navigate(['/area-restrita/sala-estudo', primeiraMateriaId], {
        queryParams: {
          modo: 'revisar',
          topicoId: primeiroTopicoId,
          filaExecucao: '1',
          topicos: topicosSerializados
        },
        state: { executionQueue: filaCompleta }
      });
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo/executar'], {
      queryParams: { topicos: topicosSerializados },
      state: { executionQueue: filaCompleta }
    });
  }

  trackByFila(index: number, item: PressaoFilaItemDTO): string {
    const topicoId = Number(item?.topicoId || 0);
    if (topicoId > 0) return String(topicoId);
    return `fila-${index}`;
  }

  private aplicarDto(dto: PressaoDoDiaDTO): void {
    const hoje = dto?.hoje || {};
    const contadoresHoje = hoje?.contadores || {};
    const janela = dto?.janela || {};
    const progresso = dto?.progresso || {};
    const cobertura = progresso?.cobertura || {};

    this.headlineHoje = String(hoje?.headlineHoje || '').trim() || 'Sem headline no momento.';
    this.modoHojeLabel = this.labelModo(hoje?.modoAtivoHoje);

    this.criticos = this.toInt(contadoresHoje?.criticos);
    this.emRisco = this.toInt(contadoresHoje?.emRisco);
    this.manutencaoVencida = this.toInt(contadoresHoje?.manutencaoVencida);
    this.manutencaoHoje = this.toInt(contadoresHoje?.manutencaoHoje);
    this.totalHoje = this.toInt(contadoresHoje?.totalHoje);

    this.capAplicado = this.toInt(hoje?.capAplicado);
    this.totalDisponivelHoje = this.toInt(hoje?.totalDisponivelHoje);
    this.exibindoHoje = this.toInt(hoje?.exibindoHoje);

    this.agendaJanela = Array.isArray(janela?.agenda) ? janela.agenda : [];
    this.ateLabel = this.formatLocalDate(janela?.ate);

    this.streakDias = this.toInt(progresso?.streakDias);
    this.coberturaTotal = this.toInt(cobertura?.topicosTotal);
    this.coberturaEstudados = this.toInt(cobertura?.topicosEstudados);
    this.coberturaNaoEstudados = this.toInt(cobertura?.topicosNaoEstudados);

    this.filaHoje = Array.isArray(hoje?.filaHoje) ? hoje.filaHoje : [];
    this.filtroFila = 'todos';

    this.pressao = dto || null;
    this.error = null;
  }

  private labelModo(modo: string | null | undefined): string {
    const raw = String(modo || '').trim();
    if (!raw) return '-';
    const normalizado = raw.toUpperCase();
    if (normalizado.includes('MANUT')) return 'Manutencao';
    if (normalizado.includes('SCORE')) return 'Score';
    return raw;
  }

  private toInt(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  private resolverMensagemErro(err: HttpErrorResponse): string {
    if (err?.status === 400) {
      return 'Janela invalida.';
    }
    return 'Nao foi possivel carregar a pressao do dia.';
  }
}
