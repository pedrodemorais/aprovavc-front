import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { TopicoCognitivoDTO } from 'src/app/core/models/cognitive-metrics.models';
import { CognitiveMetricsService } from 'src/app/core/services/cognitive-metrics.service';
import {
  AvaliacaoRevisao,
  ClassificacaoRetencaoTopico,
  EditalResumoRetencaoDTO,
  ErroReincidenteDTO,
  RetencaoPontoDTO,
  RevisaoEventoHistoricoDTO,
  TopicoRiscoDTO
} from 'src/app/core/models/retencao-analytics.models';
import { RetencaoAnalyticsService } from 'src/app/core/services/retencao-analytics.service';

@Component({
  selector: 'app-retencao-dashboard',
  templateUrl: './retencao-dashboard.component.html',
  styleUrls: ['./retencao-dashboard.component.css']
})
export class RetencaoDashboardComponent implements OnInit {
  abaSelecionada: 'geral' | 'criticos' = 'geral';
  janelaSelecionada: 7 | 14 | 30 = 30;
  janelaOptions: Array<{ label: string; value: 7 | 14 | 30 }> = [
    { label: '7 dias', value: 7 },
    { label: '14 dias', value: 14 },
    { label: '30 dias', value: 30 }
  ];

  resumo: EditalResumoRetencaoDTO | null = null;
  topicosEmRisco: TopicoRiscoDTO[] = [];
  errosReincidentes: ErroReincidenteDTO[] = [];

  carregandoResumo = false;
  carregandoRisco = false;
  carregandoErros = false;
  carregandoCriticos = false;

  premiumBloqueado = false;

  detalhesVisivel = false;
  topicoDetalheId: number | null = null;
  topicoDetalheNome = '';
  serieDetalhe: RetencaoPontoDTO[] = [];
  historicoDetalhe: RevisaoEventoHistoricoDTO[] = [];
  carregandoDetalhes = false;

  readonly classificacao = ClassificacaoRetencaoTopico;
  topicosCriticos: TopicoCognitivoDTO[] = [];

  constructor(
    private retencaoService: RetencaoAnalyticsService,
    private cognitiveMetricsService: CognitiveMetricsService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const view = String(this.route.snapshot.queryParamMap.get('view') || '').toLowerCase();
    if (view === 'criticos') {
      this.abaSelecionada = 'criticos';
    }
    this.carregarResumoETopicos();
    this.carregarErrosReincidentes();
    this.carregarTopicosCriticos();
  }

  onJanelaChange(): void {
    this.carregarResumoETopicos();
  }

  carregarResumoETopicos(): void {
    this.carregandoResumo = true;
    this.carregandoRisco = true;

    forkJoin({
      resumo: this.retencaoService.buscarResumoEdital(this.janelaSelecionada),
      topicos: this.retencaoService.buscarTopicosEmRisco(this.janelaSelecionada, 50)
    }).subscribe({
      next: ({ resumo, topicos }) => {
        this.resumo = resumo;
        this.topicosEmRisco = topicos || [];
        this.carregandoResumo = false;
        this.carregandoRisco = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoResumo = false;
        this.carregandoRisco = false;
        this.tratarErroHttp(err, 'Falha ao carregar dados de retenção');
      }
    });
  }

  carregarErrosReincidentes(): void {
    this.carregandoErros = true;
    this.retencaoService.buscarErrosReincidentes(30, 20).subscribe({
      next: (itens) => {
        this.errosReincidentes = itens || [];
        this.carregandoErros = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoErros = false;
        this.tratarErroHttp(err, 'Falha ao carregar erros reincidentes');
      }
    });
  }

  selecionarAba(aba: 'geral' | 'criticos'): void {
    this.abaSelecionada = aba;
  }

  carregarTopicosCriticos(): void {
    this.carregandoCriticos = true;
    this.cognitiveMetricsService.getTopicosCognitivos(14, 'CRITICO', 10).subscribe({
      next: (itens) => {
        this.topicosCriticos = itens || [];
        this.carregandoCriticos = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoCriticos = false;
        this.tratarErroHttp(err, 'Falha ao carregar topicos criticos');
      }
    });
  }

  abrirDetalhes(topico: { topicoId: number; nomeTopico: string | null }): void {
    this.topicoDetalheId = topico.topicoId;
    this.topicoDetalheNome = topico.nomeTopico || `Tópico ${topico.topicoId}`;
    this.detalhesVisivel = true;
    this.carregandoDetalhes = true;
    this.serieDetalhe = [];
    this.historicoDetalhe = [];

    forkJoin({
      serie: this.retencaoService.buscarSerieTopico(topico.topicoId, 30),
      historico: this.retencaoService.buscarHistoricoTopico(topico.topicoId, 30)
    }).subscribe({
      next: ({ serie, historico }) => {
        this.serieDetalhe = serie || [];
        this.historicoDetalhe = historico || [];
        this.carregandoDetalhes = false;
      },
      error: (err: HttpErrorResponse) => {
        this.carregandoDetalhes = false;
        this.tratarErroHttp(err, 'Falha ao carregar detalhes do tópico');
      }
    });
  }

  revisarAgora(materiaId: number | null, topicoId: number): void {
    if (materiaId == null) {
      return;
    }
    this.router.navigate([`/area-restrita/sala-estudo/${materiaId}`], {
      queryParams: { topicoId }
    });
  }

  irParaPlanos(): void {
    this.router.navigate(['/area-restrita/assinatura']);
  }

  formatarPercentual(valor: number | null | undefined): string {
    const numero = Number(valor ?? 0);
    return `${numero.toFixed(1)}%`;
  }

  formatarScore(valor: number | null): string {
    if (valor == null || Number.isNaN(valor)) {
      return '-';
    }
    return valor.toFixed(2);
  }

  formatarRisk(valor: number | null): string {
    if (valor == null || Number.isNaN(valor)) {
      return '-';
    }
    return valor.toFixed(2);
  }

  formatarDataIso(dataIso: string | null | undefined): string {
    if (!dataIso) {
      return '-';
    }
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) {
      return dataIso;
    }
    return data.toLocaleString('pt-BR');
  }

  formatarAvaliacao(avaliacao: AvaliacaoRevisao): string {
    switch (avaliacao) {
      case AvaliacaoRevisao.ERREI:
        return 'Errei';
      case AvaliacaoRevisao.DIFICIL:
        return 'Difícil';
      case AvaliacaoRevisao.BOM:
        return 'Bom';
      case AvaliacaoRevisao.FACIL:
        return 'Fácil';
      default:
        return avaliacao;
    }
  }

  classeClassificacao(classificacao: ClassificacaoRetencaoTopico): string {
    switch (classificacao) {
      case ClassificacaoRetencaoTopico.CRITICO:
        return 'badge badge-critico';
      case ClassificacaoRetencaoTopico.EM_RISCO:
        return 'badge badge-risco';
      case ClassificacaoRetencaoTopico.CONSOLIDADO:
        return 'badge badge-consolidado';
      default:
        return 'badge badge-sem-dados';
    }
  }

  private tratarErroHttp(err: HttpErrorResponse, fallbackMsg: string): void {
    if (err.status === 402) {
      this.premiumBloqueado = true;
      this.messageService.add({
        severity: 'warn',
        summary: 'Plano',
        detail: 'Recurso disponível no plano premium'
      });
      return;
    }

    if (err.status === 401) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Sessão',
        detail: 'Sua sessão expirou. Faça login novamente.'
      });
      this.router.navigate(['/login']);
      return;
    }

    this.messageService.add({
      severity: 'error',
      summary: 'Erro',
      detail: fallbackMsg
    });
  }
}
