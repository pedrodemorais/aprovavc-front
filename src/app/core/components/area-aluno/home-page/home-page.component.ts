import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FocoPlanoDiarioDTO, FocoDistribuicaoMateriaDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { DashboardStreakResumoDTO } from 'src/app/core/models/hoje-fila.models';
import { RevisaoHojeFilaDTO, RevisaoHojeItemDTO } from 'src/app/core/models/revisao-hoje.models';
import { FocoPlanoDiarioService } from 'src/app/core/services/foco-plano-diario.service';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { RevisaoHojeService } from 'src/app/core/services/revisao-hoje.service';
import { ExecutionQueueItem } from 'src/app/core/services/execution-queue.service';
import {
  SalaEstudoService,
  TreinarFraquezaMateriaDTO
} from '../services/sala-estudo.service';

interface HomeTreinarFraquezasVM {
  materiaId: number;
  materiaNome: string;
  topicos: number[];
  tempoEstimadoMinutos: number;
}

interface HomeContinuarEstudoVM {
  materiaId: number;
  materiaNome: string;
  proximoTopicoId: number | null;
  proximoTopicoNome: string;
  tempoEstimadoMinutos: number;
}

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.css']
})
export class HomePageComponent implements OnInit {
  loading = true;
  error: string | null = null;

  revisoesAtrasadas = 0;
  tempoAtrasadasMin = 0;

  revisoesHoje = 0;
  revisoesHojeConcluidas = 0;
  tempoMissaoMin = 0;
  tempoRestanteMin = 0;
  private filaAtrasadas: ExecutionQueueItem[] = [];
  private filaHoje: ExecutionQueueItem[] = [];

  treinoFraquezas: HomeTreinarFraquezasVM | null = null;
  continuarEstudo: HomeContinuarEstudoVM | null = null;

  streakDias = 0;
  topicosRevisadosHoje = 0;
  flashcardsRevisadosHoje = 0;
  topicosEstudadosHoje = 0;

  constructor(
    private focoPlanoDiarioService: FocoPlanoDiarioService,
    private salaEstudoService: SalaEstudoService,
    private hojeFilaService: HojeFilaService,
    private revisaoHojeService: RevisaoHojeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarHome();
  }

  get exibirAtrasadas(): boolean {
    return this.revisoesAtrasadas > 0;
  }

  private carregarHome(): void {
    this.loading = true;
    this.error = null;

    forkJoin({
      plano: this.focoPlanoDiarioService.obterPlanoDiario().pipe(catchError(() => of(null))),
      filaRevisao: this.revisaoHojeService.getFilaHoje({ origem: 'home' }).pipe(catchError(() => of(null))),
      streak: this.hojeFilaService.getDashboardStreak().pipe(catchError(() => of(null))),
      fraquezas: this.salaEstudoService.listarTreinarFraquezas().pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ plano, filaRevisao, streak, fraquezas }) => {
        this.aplicarRevisoes(filaRevisao);
        this.aplicarProgresso(plano, streak);
        this.aplicarFraquezas(fraquezas || []);
        this.aplicarContinuarEstudo(plano);
        this.loading = false;
      },
      error: () => {
        this.error = 'Não foi possível carregar sua Home agora.';
        this.loading = false;
      }
    });
  }

  // A fila de revisao e 100% controlada pelo backend.
  // O frontend nao deve alterar, ordenar ou recalcular nada.
  private aplicarRevisoes(filaRevisao: RevisaoHojeFilaDTO | null): void {
    const itens = Array.isArray(filaRevisao?.itens) ? filaRevisao!.itens : [];
    const itensAtrasados = itens.filter((item) => this.isAtrasada(item));
    const itensHoje = itens.filter((item) => this.isHoje(item));

    this.revisoesAtrasadas = itensAtrasados.length;
    this.revisoesHoje = itensHoje.length;

    this.tempoAtrasadasMin = this.estimarMinutosRevisao(this.revisoesAtrasadas);
    this.tempoMissaoMin = this.estimarMinutosRevisao(this.revisoesHoje);

    this.filaAtrasadas = this.montarFilaExecucao(itensAtrasados);
    this.filaHoje = this.montarFilaExecucao(itensHoje);
  }

  private aplicarProgresso(
    plano: FocoPlanoDiarioDTO | null,
    streak: DashboardStreakResumoDTO | null
  ): void {
    this.streakDias = Math.max(0, Number(streak?.streakAtual || 0));
    this.topicosRevisadosHoje = Math.max(0, Number(plano?.progressoHoje?.revisoesTopicoConcluidas || 0));
    this.flashcardsRevisadosHoje = Math.max(0, Number(plano?.progressoHoje?.revisoesFlashcardConcluidas || 0));
    this.topicosEstudadosHoje = Math.max(0, Number(plano?.progressoHoje?.estudosConcluidos || 0));

    this.revisoesHojeConcluidas = Math.min(this.revisoesHoje, this.topicosRevisadosHoje);
    const pendentes = Math.max(0, this.revisoesHoje - this.revisoesHojeConcluidas);
    this.tempoRestanteMin = this.estimarMinutosRevisao(pendentes);
  }

  private aplicarFraquezas(materias: TreinarFraquezaMateriaDTO[]): void {
    const normalizadas = (materias || [])
      .map((item) => {
        const materiaId = Number(item?.materiaId || 0);
        const materiaNome = String(item?.materiaNome || '').trim();
        const topicos = (item?.topicos || [])
          .map((topico) => Number(typeof topico === 'number' ? topico : topico?.topicoId))
          .filter((topicoId) => Number.isFinite(topicoId) && topicoId > 0);
        return {
          materiaId,
          materiaNome: materiaNome || 'Matéria com baixa retenção',
          topicos: Array.from(new Set(topicos))
        };
      })
      .filter((item) => item.materiaId > 0 && item.topicos.length > 0);

    if (!normalizadas.length) {
      this.treinoFraquezas = null;
      return;
    }

    const principal = normalizadas[0];
    this.treinoFraquezas = {
      ...principal,
      tempoEstimadoMinutos: Math.max(6, Math.min(20, principal.topicos.length * 2))
    };
  }

  private aplicarContinuarEstudo(plano: FocoPlanoDiarioDTO | null): void {
    const distribuicao = Array.isArray(plano?.distribuicao) ? plano!.distribuicao : [];
    const execucao = plano?.execucaoPlano || null;
    const materiaExecucaoId = Number(execucao?.materiaId || 0);

    const materiaExecucao = materiaExecucaoId > 0
      ? distribuicao.find((item) => Number(item?.materiaId || 0) === materiaExecucaoId) || null
      : null;
    const fallback = distribuicao.find((item) => String(item?.status || '').toUpperCase() === 'OK') || null;
    const base = materiaExecucao || fallback;

    if (!base || !base.proximoConteudo) {
      this.continuarEstudo = null;
      return;
    }

    const proximoTopicoNome = String(execucao?.proximoTopicoNome || '').trim() || String(base.proximoConteudo.topicoNome || '').trim();
    const proximoTopicoIdExec = Number(execucao?.proximoTopicoId || 0);
    const proximoTopicoIdDist = Number(base.proximoConteudo.topicoId || 0);

    this.continuarEstudo = {
      materiaId: Number(base.materiaId || 0),
      materiaNome: String(base.materiaNome || '').trim() || 'Matéria do ciclo',
      proximoTopicoId: proximoTopicoIdExec > 0 ? proximoTopicoIdExec : (proximoTopicoIdDist > 0 ? proximoTopicoIdDist : null),
      proximoTopicoNome: proximoTopicoNome || 'Próximo tópico disponível',
      tempoEstimadoMinutos: this.estimarTempoEstudo(base)
    };
  }

  private estimarMinutosRevisao(quantidade: number): number {
    return Math.max(0, Math.round(Number(quantidade || 0) * 2));
  }

  private estimarTempoEstudo(distribuicao: FocoDistribuicaoMateriaDTO): number {
    const minutos = Number(distribuicao?.minutosPlanejados || 0);
    if (Number.isFinite(minutos) && minutos > 0) {
      return Math.max(8, Math.min(30, Math.round(minutos)));
    }
    return 10;
  }

  resolverAtrasadas(): void {
    const fila = this.filaAtrasadas;
    if (!fila.length) {
      this.router.navigate(['/area-restrita/revisoes']);
      return;
    }
    this.abrirFilaRevisao(fila, {
      prioridade: 'atrasadas',
      filtroSemaforo: 'atrasadas'
    });
  }

  iniciarRevisao(): void {
    const fila = this.filaHoje;
    if (!fila.length) {
      this.router.navigate(['/area-restrita/revisoes']);
      return;
    }
    this.abrirFilaRevisao(fila);
  }

  treinarAgora(): void {
    this.router.navigate(['/area-restrita/sala-estudo/executar'], {
      queryParams: {
        modo: 'treinar'
      }
    });
  }

  estudarAgora(): void {
    if (this.continuarEstudo?.materiaId) {
      this.router.navigate(['/area-restrita/sala-estudo', this.continuarEstudo.materiaId], {
        queryParams: {
          modo: 'estudo',
          topicoId: this.continuarEstudo.proximoTopicoId || undefined
        }
      });
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo/executar'], {
      queryParams: {
        modo: 'estudo'
      }
    });
  }

  private montarFilaExecucao(itens: Array<{ materiaId?: number | null; topicoId?: number | null }>): ExecutionQueueItem[] {
    const fila = (itens || [])
      .map((item) => ({
        materiaId: Number(item?.materiaId || 0),
        topicoId: Number(item?.topicoId || 0)
      }))
      .filter((item) => item.materiaId > 0 && item.topicoId > 0)
      .map((item) => ({ materiaId: item.materiaId, topicoId: item.topicoId }));
    return this.deduplicarFila(fila);
  }

  private isAtrasada(item: RevisaoHojeItemDTO): boolean {
    const status = String(item?.statusCanonico || '').toUpperCase();
    return status === 'ATRASADA';
  }

  private isHoje(item: RevisaoHojeItemDTO): boolean {
    const status = String(item?.statusCanonico || '').toUpperCase();
    return status === 'HOJE';
  }

  private deduplicarFila(fila: ExecutionQueueItem[]): ExecutionQueueItem[] {
    const mapa = new Map<string, ExecutionQueueItem>();
    for (const item of fila) {
      const chave = `${Number(item.materiaId || 0)}:${Number(item.topicoId || 0)}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, item);
      }
    }
    return Array.from(mapa.values());
  }

  private abrirFilaRevisao(
    fila: ExecutionQueueItem[],
    extras?: { prioridade?: 'atrasadas'; filtroSemaforo?: 'atrasadas' }
  ): void {
    const primeira = fila[0];
    const primeiraMateriaId = Number(primeira?.materiaId || 0);
    const primeiroTopicoId = Number(primeira?.topicoId || 0);
    if (primeiraMateriaId <= 0 || primeiroTopicoId <= 0) {
      this.router.navigate(['/area-restrita/revisoes']);
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo', primeiraMateriaId], {
      queryParams: {
        modo: 'revisar',
        topicoId: primeiroTopicoId,
        filaExecucao: '1',
        topicos: fila.map((item) => item.topicoId).join(','),
        prioridade: extras?.prioridade,
        filtroSemaforo: extras?.filtroSemaforo
      },
      state: { executionQueue: fila }
    });
  }
}
