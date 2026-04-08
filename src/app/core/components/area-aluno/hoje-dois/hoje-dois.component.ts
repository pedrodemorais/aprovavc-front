import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { PressaoFilaItemDTO } from 'src/app/core/api/dto/pressao-do-dia.dto';
import { FocoPlanoDiarioDTO } from 'src/app/core/dto/foco-plano-diario.dto';
import { FocoPlanoDiarioService } from 'src/app/core/services/foco-plano-diario.service';
import { AuthService } from 'src/app/site/services/auth.service';

@Component({
  selector: 'app-hoje-dois',
  templateUrl: './hoje-dois.component.html',
  styleUrls: ['./hoje-dois.component.scss']
})
export class HojeDoisComponent implements OnInit {
  loading = false;
  error: string | null = null;
  plano: FocoPlanoDiarioDTO | null = null;
  nomeAluno = 'Aluno(a)';
  mostrarDetalhes = false;

  constructor(
    private focoPlanoDiarioService: FocoPlanoDiarioService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.nomeAluno = String(this.authService.getUserNameFromToken() || '').trim() || 'Aluno(a)';
    this.carregarPlano();
  }

  get filaRevisao(): PressaoFilaItemDTO[] {
    return Array.isArray(this.plano?.filaRevisao) ? this.plano!.filaRevisao : [];
  }

  get resumoAcionavel(): any {
    return (this.plano as any)?.resumoAcionavel || {};
  }

  get totalRevisoesPendentes(): number {
    const totalFila = this.filaRevisao.length;
    if (totalFila > 0) return totalFila;
    const totalResumo = Number(this.resumoAcionavel?.totalAgora || 0);
    return Number.isFinite(totalResumo) ? Math.max(0, Math.round(totalResumo)) : 0;
  }

  get temRevisaoPendente(): boolean {
    return this.totalRevisoesPendentes > 0;
  }

  get concluidosHoje(): number {
    const progressoHoje = (this.plano as any)?.progressoHoje;
    return this.toInt(progressoHoje?.revisoesTopicoConcluidas);
  }

  get estimativaMinutos(): number {
    return this.totalRevisoesPendentes * 4;
  }

  get criticos(): number {
    return this.toInt(this.resumoAcionavel?.criticos);
  }

  get emRisco(): number {
    return this.toInt(this.resumoAcionavel?.emRisco);
  }

  get manutencao(): number {
    return this.toInt(this.resumoAcionavel?.manutencaoHoje);
  }

  get botaoPrincipalTexto(): string {
    if (this.temRevisaoPendente) {
      return `Revisar ${this.totalRevisoesPendentes} tópicos agora`;
    }
    return 'Estudar novo conteúdo';
  }

  get subtituloPrincipal(): string {
    if (this.temRevisaoPendente) {
      return 'Você tem conteúdos prestes a ser esquecidos';
    }
    return 'Nenhuma revisão pendente hoje';
  }

  get classeBlocoPrincipal(): string {
    return this.temRevisaoPendente ? 'decision decision--danger' : 'decision decision--success';
  }

  get classeBotaoPrincipal(): string {
    return this.temRevisaoPendente ? 'cta cta--danger' : 'cta cta--success';
  }

  alternarDetalhes(): void {
    this.mostrarDetalhes = !this.mostrarDetalhes;
  }

  executarAcaoPrincipal(): void {
    if (this.temRevisaoPendente) {
      const primeiro = this.filaRevisao[0] as any;
      const materiaId = Number(primeiro?.materiaId || 0);
      const topicoId = Number(primeiro?.topicoId || 0);

      if (materiaId > 0) {
        const queryParams: any = { modo: 'revisar', origem: 'hoje_dois' };
        if (topicoId > 0) queryParams.topicoId = topicoId;
        this.router.navigate(['/area-restrita/sala-estudo', materiaId], { queryParams });
        return;
      }

      this.router.navigate(['/area-restrita/revisoes']);
      return;
    }

    this.router.navigate(['/area-restrita/sala-estudo/executar']);
  }

  private carregarPlano(): void {
    this.loading = true;
    this.error = null;
    this.focoPlanoDiarioService
      .obterPlanoDiario()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (dto) => {
          this.plano = dto || null;
        },
        error: (err: HttpErrorResponse) => {
          this.plano = null;
          this.error = this.resolverMensagemErro(err);
        }
      });
  }

  private resolverMensagemErro(err: HttpErrorResponse): string {
    const serverMessage = String(err?.error?.message || '').trim();
    return serverMessage || 'Não foi possível carregar o plano de hoje.';
  }

  private toInt(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
}
