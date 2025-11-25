import { Component, OnInit } from '@angular/core';
import { ProvaEstudo } from 'src/app/core/models/prova-estudo.model';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';

@Component({
  selector: 'app-edital-verticalizado',
  templateUrl: './edital-verticalizado.component.html',
  styleUrls: ['./edital-verticalizado.component.css']
})
export class EditalVerticalizadoComponent implements OnInit {

  provas: ProvaEstudo[] = [];
  provaSelecionadaId?: number;
  provaSelecionada?: ProvaEstudo;

  carregandoProvas = false;

  constructor(private provaService: ProvaEstudoService) {}

  ngOnInit(): void {
    this.carregarProvas();
  }

  carregarProvas(): void {
    this.carregandoProvas = true;

    this.provaService.listar().subscribe({
      next: (lista) => {
        this.provas = lista || [];
        this.carregandoProvas = false;

        // 🔥 Se quiser já abrir automático quando só tiver 1 prova:
        if (this.provas.length === 1) {
          this.provaSelecionadaId = this.provas[0].id!;
          this.provaSelecionada = this.provas[0];
        }
      },
      error: (err) => {
        console.error('Erro ao listar provas:', err);
        this.provas = [];
        this.carregandoProvas = false;
      }
    });
  }

  onProvaChange(): void {
    console.log('ID prova selecionada:', this.provaSelecionadaId);
    this.provaSelecionada = this.provas.find(p => p.id === this.provaSelecionadaId);
  }
}
