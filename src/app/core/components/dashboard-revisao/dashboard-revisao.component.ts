import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SalaEstudoService } from 'src/app/core/services/sala-estudo.service';
import { MateriaService } from 'src/app/core/services/materia.service';
import { RevisaoDashboardItem } from 'src/app/core/models/RevisaoDashboardItem';
import { Materia } from 'src/app/core/models/materia.model';

@Component({
  selector: 'app-dashboard-revisao',
  templateUrl: './dashboard-revisao.component.html',
  styleUrls: ['./dashboard-revisao.component.css']
})
export class DashboardRevisaoComponent implements OnInit {

  carregando = false;
  erro?: string;

  revisoes: RevisaoDashboardItem[] = [];
  materias: Materia[] = [];

  // totais para o resumo superior
  totalVencidas = 0;
  totalHoje = 0;
  totalFuturas = 0;

  constructor(
    private salaEstudoService: SalaEstudoService,
    private materiaService: MateriaService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarDados();
  }

  private carregarDados(): void {
    this.carregando = true;
    this.erro = undefined;

    forkJoin({
      revisoes: this.salaEstudoService.listarRevisoesDashboard(),
      materias: this.materiaService.listarMaterias()
    }).subscribe({
      next: ({ revisoes, materias }) => {
        this.revisoes = revisoes || [];
        this.materias = materias || [];
        this.atualizarTotais();
        this.carregando = false;
      },
      error: (err) => {
        console.error('[DASH-REVISAO] Erro ao carregar dados:', err);
        this.erro = 'Erro ao carregar seus dados.';
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
      { queryParams: { topicoId: item.topicoId } } // se quiser ja mandar o topico
    );
  }

}
