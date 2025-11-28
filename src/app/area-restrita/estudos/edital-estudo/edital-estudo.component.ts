// src/app/area-restrita/estudos/edital-estudo/edital-estudo.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'; // 👈 adiciona Router

import { ProvaEstudoDTO } from 'src/app/area-restrita/services/prova.service';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';

import { TopicoEdital } from 'src/app/core/models/topico-edital.model';
import { TopicoEditalService } from 'src/app/core/services/topico-edital.service';

@Component({
  selector: 'app-edital-estudo',
  templateUrl: './edital-estudo.component.html',
  styleUrls: ['./edital-estudo.component.css']
})
export class EditalEstudoComponent implements OnInit {

  provaId!: number;
  prova?: ProvaEstudoDTO;
  topicos: TopicoEdital[] = [];
  carregando = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,                     // 👈 injeta aqui
    private provaService: ProvaEstudoService,
    private topicoService: TopicoEditalService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.provaId = Number(params.get('provaId'));

      this.carregando = true;
      this.topicos = [];

      this.carregarDados();
    });
  }

  private carregarDados(): void {
    this.provaService.obter(this.provaId).subscribe({
      next: (p) => this.prova = p,
      error: () => {}
    });

    this.topicoService.listarPorProva(this.provaId).subscribe({
      next: (lista) => {
        const arr = (lista || []).filter(t => !!t);

        this.topicos = arr.sort((a, b) => {
          const nivelA = (a.nivelTopico ?? a.nivel ?? a.codigo ?? '').toString();
          const nivelB = (b.nivelTopico ?? b.nivel ?? b.codigo ?? '').toString();
          return nivelA.localeCompare(nivelB, undefined, { numeric: true });
        });

        this.carregando = false;
      },
      error: () => {
        this.topicos = [];
        this.carregando = false;
      }
    });
  }

  getIndentPx(t: TopicoEdital): number {
    const nivel = (t.nivelTopico ?? t.nivel ?? t.codigo ?? '').toString();
    if (!nivel) return 0;
    const profundidade = nivel.split('.').length - 1;
    return profundidade * 24;
  }

  // 👉 NOVO: abre a sala de estudo do tópico
  // ======== NOVO: verifica se o tópico tem filhos ========

  temFilhos(t: TopicoEdital): boolean {
    const nivelBase = (t.nivelTopico ?? t.nivel ?? t.codigo ?? '').toString();
    if (!nivelBase) return false;

    const prefixo = nivelBase + '.';

    return this.topicos.some(outro => {
      if (outro.id === t.id) return false;
      const nivelOutro = (outro.nivelTopico ?? outro.nivel ?? outro.codigo ?? '').toString();
      return nivelOutro.startsWith(prefixo);
    });
  }

  // ======== NOVO: navega pra sala de estudo ========



   abrirSalaEstudo(topico: TopicoEdital): void {
    if (!topico.id) {
      return;
    }

    const nivel = (topico.nivelTopico ?? topico.nivel ?? topico.codigo ?? '').toString();

    this.router.navigate(
      ['/area-restrita/estudos/sala', this.provaId, topico.id],
      {
        queryParams: {
          nivel,
          descricao: topico.descricao
        }
      }
    );
  }
  private getStorageKeyById(topicoId: number): string {
  return `estudo_${this.provaId}_${topicoId}`;
}
private getEstadoById(topicoId: number): {
  notas: string;
  status: 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';
  tempoMs: number;
  ultimaAtualizacao: Date | string;
} {
  const key = this.getStorageKeyById(topicoId);
  const saved = localStorage.getItem(key);

  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // se corromper, cai no default
    }
  }

  return {
    notas: '',
    status: 'nao_iniciado',
    tempoMs: 0,
    ultimaAtualizacao: new Date()
  };
}


}
