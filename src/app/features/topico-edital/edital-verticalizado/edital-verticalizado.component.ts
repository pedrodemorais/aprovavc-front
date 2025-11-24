import { Component, OnInit } from '@angular/core';
import { ProvaEstudo } from 'src/app/core/models/prova-estudo.model';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';

@Component({
  selector: 'app-edital-verticalizado',
  templateUrl: './edital-verticalizado.component.html',
  styleUrls: ['./edital-verticalizado.component.css']
})
export class EditalVerticalizadoComponent implements OnInit {

  empresaId = 346; // depois vem do JWT

  provas: ProvaEstudo[] = [];
  provaSelecionadaId?: number;
  provaSelecionada?: ProvaEstudo;

  carregandoProvas = false;

  constructor(
    private provaService: ProvaEstudoService
  ) {}

  ngOnInit(): void {
    this.carregarProvas();
  }

  carregarProvas(): void {
    this.carregandoProvas = true;
    this.provaService.listar('').subscribe({
      next: (lista) => {
        this.provas = lista || [];
        this.carregandoProvas = false;
      },
      error: () => {
        this.provas = [];
        this.carregandoProvas = false;
      }
    });
  }

  onProvaChange(): void {
    this.provaSelecionada = this.provas.find(p => p.id === this.provaSelecionadaId);
  }
}
