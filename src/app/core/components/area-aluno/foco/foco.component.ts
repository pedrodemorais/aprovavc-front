import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { FocoPlanoDiarioDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { RevisaoHojeItemDTO } from 'src/app/core/models/revisao-hoje.models';
import { ExecutionQueueService } from 'src/app/core/services/execution-queue.service';
import { FocoPlanoDiarioService } from 'src/app/core/services/foco-plano-diario.service';
import { HojeFilaService } from 'src/app/core/services/hoje-fila.service';
import { RevisaoHojeService } from 'src/app/core/services/revisao-hoje.service';
import { AuthService } from 'src/app/site/services/auth.service';
import { EditalService } from '../services/edital.service';

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
    private revisaoHojeService: RevisaoHojeService,
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
    this.revisaoHojeService.getFilaHoje({ origem: 'foco' }).subscribe({
      next: (resp) => {
        this.filaHoje = Array.isArray(resp?.itens) ? resp.itens : [];
      },
      error: () => {
        this.filaHoje = [];
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
    (filaRevisao || []).forEach((item) => {
      const topicoId = Number(item?.topicoId || 0);
      if (topicoId > 0) {
        unicos.add(topicoId);
      }
    });
    return Array.from(unicos.values());
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
