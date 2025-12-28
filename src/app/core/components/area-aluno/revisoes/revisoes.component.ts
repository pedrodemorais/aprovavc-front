import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { SalaEstudoService } from '../services/sala-estudo.service';

@Component({
  selector: 'app-revisoes',
  templateUrl: './revisoes.component.html',
  styleUrls: ['./revisoes.component.css']
})
export class RevisoesComponent implements OnInit {
  @Input() revisoes: RevisaoDashboardItem[] = [];
  @Input() modo: 'automatico' | 'externo' = 'automatico';
  carregando = false;
  erro?: string;

  constructor(
    private router: Router,
    private salaEstudoService: SalaEstudoService
  ) {}

  ngOnInit(): void {
    if (this.modo === 'automatico') {
      this.carregarRevisoes();
    }
  }

  private carregarRevisoes(): void {
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens) => {
        this.revisoes = itens || [];
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar revisões.';
        this.carregando = false;
      }
    });
  }

  irParaSala(item: RevisaoDashboardItem): void {
    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId } }
    );
  }
}
