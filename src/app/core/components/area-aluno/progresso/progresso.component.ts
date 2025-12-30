import { Component, OnInit } from '@angular/core';
import { EditalService } from '../services/edital.service';
import { Edital } from '../models/Edital';
import { EditalMateriaResumo } from '../models/EditalMateriaResumo';

@Component({
  selector: 'app-progresso',
  templateUrl: './progresso.component.html',
  styleUrls: ['./progresso.component.css']
})
export class ProgressoComponent implements OnInit {
  carregando = false;
  erro?: string;
  editais: Edital[] = [];
  editalAtivo?: Edital;
  private weakColors = [
    '#ef4444',
    '#f59e0b',
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#f97316'
  ];

  constructor(private editalService: EditalService) {}

  ngOnInit(): void {
    this.carregarEditais();
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  get materiasPontoFraco(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return [...materias].sort((a, b) => (a.nivelDominio ?? 0) - (b.nivelDominio ?? 0));
  }

  get materiasConcluidas(): EditalMateriaResumo[] {
    const materias = this.editalAtivo?.materias || [];
    return materias
      .filter((m) => (m.percentualEstudado ?? 0) >= 100)
      .sort((a, b) => a.materiaNome.localeCompare(b.materiaNome));
  }

  get weakSlices(): Array<{ label: string; dominio: number; percent: number; color: string }> {
    const materias = this.materiasPontoFraco;
    if (!materias.length) {
      return [];
    }
    const weights = materias.map((m) => Math.max(1, 100 - (m.nivelDominio ?? 0)));
    const total = weights.reduce((acc, v) => acc + v, 0);
    return materias.map((m, index) => {
      const weight = weights[index];
      const percent = total > 0 ? (weight / total) * 100 : 0;
      return {
        label: m.materiaNome,
        dominio: m.nivelDominio ?? 0,
        percent,
        color: this.weakColors[index % this.weakColors.length]
      };
    });
  }

  get weakPieGradient(): string {
    const slices = this.weakSlices;
    if (!slices.length) {
      return 'conic-gradient(#e5e7eb 0 100%)';
    }
    let acc = 0;
    const parts = slices.map((slice) => {
      const start = acc;
      acc += slice.percent;
      const end = acc;
      return `${slice.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  getDominioClasse(valor?: number | null): string {
    const pct = valor ?? 0;
    if (pct <= 50) {
      return 'progress-bar--low';
    }
    if (pct <= 70) {
      return 'progress-bar--mid';
    }
    return 'progress-bar--high';
  }

  private carregarEditais(): void {
    this.carregando = true;
    this.erro = undefined;

    this.editalService.listar().subscribe({
      next: (lista) => {
        this.editais = lista || [];
        this.editalAtivo = this.editais.find(e => e.ativo) || this.editais[0];
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar seus editais.';
        this.carregando = false;
      }
    });
  }
}
