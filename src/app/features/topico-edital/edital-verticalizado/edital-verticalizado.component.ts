import { Component, OnInit } from '@angular/core';
import { ProvaEstudo } from 'src/app/core/models/prova-estudo.model';
import { MateriaEstudo } from 'src/app/core/models/materia-estudo.model';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';
import { MateriaEstudoService } from 'src/app/core/services/materia-estudo.service';

@Component({
  selector: 'app-edital-verticalizado',
  templateUrl: './edital-verticalizado.component.html',
  styleUrls: ['./edital-verticalizado.component.css']
})
export class EditalVerticalizadoComponent implements OnInit {

  // depois você troca para pegar do JWT
  empresaId = 346;

  provas: ProvaEstudo[] = [];
  materiasTodas: MateriaEstudo[] = [];
  materiasFiltradas: MateriaEstudo[] = [];

  provaSelecionadaId?: number;
  materiaSelecionadaId?: number;

  carregandoProvas = false;
  carregandoMaterias = false;

  constructor(
    private provaService: ProvaEstudoService,
    private materiaService: MateriaEstudoService
  ) {}

  ngOnInit(): void {
    this.carregarProvas();
    this.carregarMaterias();
  }

  get provaSelecionada(): ProvaEstudo | undefined {
    return this.provas.find(p => p.id === this.provaSelecionadaId);
  }

  get materiaSelecionada(): MateriaEstudo | undefined {
    return this.materiasFiltradas.find(m => m.id === this.materiaSelecionadaId);
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

  carregarMaterias(): void {
    this.carregandoMaterias = true;
    this.materiaService.listar().subscribe({
      next: (lista) => {
        this.materiasTodas = lista || [];
        this.filtrarMateriasPorProva();
        this.carregandoMaterias = false;
      },
      error: () => {
        this.materiasTodas = [];
        this.materiasFiltradas = [];
        this.carregandoMaterias = false;
      }
    });
  }

  onProvaChange(): void {
    this.materiaSelecionadaId = undefined;
    this.filtrarMateriasPorProva();
  }

  onMateriaChange(): void {
    // se quiser fazer algo quando mudar a matéria, coloca aqui
  }

  private filtrarMateriasPorProva(): void {
    if (!this.provaSelecionadaId) {
      this.materiasFiltradas = this.materiasTodas;
      return;
    }

    const prova = this.provas.find(p => p.id === this.provaSelecionadaId);
    if (prova && prova.materiasIds && prova.materiasIds.length > 0) {
      const idsSet = new Set(prova.materiasIds);
      this.materiasFiltradas = this.materiasTodas.filter(m => m.id && idsSet.has(m.id));
    } else {
      this.materiasFiltradas = this.materiasTodas;
    }
  }
}
