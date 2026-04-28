import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { RevisaoHojeItemDTO } from 'src/app/core/models/revisao-hoje.models';
import { RevisaoHojeService } from 'src/app/core/services/revisao-hoje.service';
import { AuthService } from 'src/app/site/services/auth.service';

@Component({
  selector: 'app-hoje-dois',
  templateUrl: './hoje-dois.component.html',
  styleUrls: ['./hoje-dois.component.scss']
})
export class HojeDoisComponent implements OnInit {
  loading = false;
  error: string | null = null;
  fila: RevisaoHojeItemDTO[] = [];
  nomeAluno = 'Aluno(a)';
  mostrarDetalhes = false;

  constructor(
    private revisaoHojeService: RevisaoHojeService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.nomeAluno = String(this.authService.getUserNameFromToken() || '').trim() || 'Aluno(a)';
    this.carregarFila();
  }

  // A fila de revisao e 100% controlada pelo backend.
  // O frontend nao deve alterar, ordenar ou recalcular nada.
  get filaRevisao(): RevisaoHojeItemDTO[] {
    return Array.isArray(this.fila) ? this.fila : [];
  }

  get resumoAcionavel(): any {
    return {
      criticos: this.criticos,
      emRisco: this.emRisco,
      manutencaoHoje: this.manutencao,
      totalAgora: this.totalRevisoesPendentes
    };
  }

  get totalRevisoesPendentes(): number {
    return this.filaRevisao.length;
  }

  get temRevisaoPendente(): boolean {
    return this.totalRevisoesPendentes > 0;
  }

  get concluidosHoje(): number {
    return 0;
  }

  get estimativaMinutos(): number {
    return this.totalRevisoesPendentes * 4;
  }

  get criticos(): number {
    return this.filaRevisao.filter((item) => String(item?.categoria || '').toUpperCase().includes('CRITICO')).length;
  }

  get emRisco(): number {
    return this.filaRevisao.filter((item) => String(item?.categoria || '').toUpperCase().includes('RISCO')).length;
  }

  get manutencao(): number {
    const total = this.totalRevisoesPendentes;
    return Math.max(0, total - this.criticos - this.emRisco);
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

  private carregarFila(): void {
    this.loading = true;
    this.error = null;
    this.revisaoHojeService
      .getFilaHoje({ origem: 'hoje' })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (dto) => {
          this.fila = Array.isArray(dto?.itens) ? dto.itens : [];
        },
        error: (err: HttpErrorResponse) => {
          this.fila = [];
          this.error = this.resolverMensagemErro(err);
        }
      });
  }

  private resolverMensagemErro(err: HttpErrorResponse): string {
    const serverMessage = String(err?.error?.message || '').trim();
    return serverMessage || 'Nao foi possivel carregar a fila de hoje.';
  }
}
