// src/app/pages/dashboard-revisao/dashboard-revisao.component.ts
import { Component, OnInit } from '@angular/core';
import { SalaEstudoService } from 'src/app/core/services/sala-estudo.service';
import { RevisaoDashboardItem } from 'src/app/core/models/RevisaoDashboardItem';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard-revisao',
  templateUrl: './dashboard-revisao.component.html',
  styleUrls: ['./dashboard-revisao.component.css']
})
export class DashboardRevisaoComponent implements OnInit {

  carregando = false;
  erro?: string;

  revisoes: RevisaoDashboardItem[] = [];

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
          this.carregando = false;
        },
        error: (err) => {
          console.error('[DASH-REVISÃO] Erro ao carregar revisões:', err);
          this.erro = 'Erro ao carregar suas revisões pendentes.';
          this.carregando = false;
        }
      });
  }

  irParaSala(item: RevisaoDashboardItem): void {
    // ajusta a rota conforme sua config atual da sala de estudo
    this.router.navigate(['/sala-estudo', item.materiaId]);
  }
}
