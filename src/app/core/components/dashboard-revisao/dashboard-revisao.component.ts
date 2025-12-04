import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SalaEstudoService } from 'src/app/core/services/sala-estudo.service';
import { RevisaoDashboardItem } from 'src/app/core/models/RevisaoDashboardItem';

@Component({
  selector: 'app-dashboard-revisao',
  templateUrl: './dashboard-revisao.component.html',
  styleUrls: ['./dashboard-revisao.component.css']
})
export class DashboardRevisaoComponent implements OnInit {

  carregando = false;
  erro?: string;

  revisoes: RevisaoDashboardItem[] = [];

  // totais para o resumo superior
  totalVencidas = 0;
  totalHoje = 0;
  totalFuturas = 0;

  constructor(
    private salaEstudoService: SalaEstudoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarRevisoes();
  }

  private carregarRevisoes(): void {
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.listarRevisoesDashboard()
      .subscribe({
        next: (lista) => {
          this.revisoes = lista || [];
          this.atualizarTotais();
          this.carregando = false;
        },
        error: (err) => {
          console.error('[DASH-REVISÃO] Erro ao carregar revisões:', err);
          this.erro = 'Erro ao carregar suas revisões.';
          this.carregando = false;
        }
      });
  }

  private atualizarTotais(): void {
    this.totalVencidas = this.revisoes.filter(r => r.status === 'VENCIDA').length;
    this.totalHoje     = this.revisoes.filter(r => r.status === 'EM_DIA').length;
    this.totalFuturas  = this.revisoes.filter(r => r.status === 'FUTURA').length;
  }

irParaSala(item: RevisaoDashboardItem): void {
  this.router.navigate(
    ['/area-restrita/sala-estudo', item.materiaId],
    { queryParams: { topicoId: item.topicoId } } // se quiser já mandar o tópico
  );
}


}
