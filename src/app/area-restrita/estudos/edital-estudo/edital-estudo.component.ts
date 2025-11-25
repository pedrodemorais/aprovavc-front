// src/app/area-restrita/estudos/edital-estudo/edital-estudo.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

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
    private provaService: ProvaEstudoService,
    private topicoService: TopicoEditalService
  ) {}

 ngOnInit(): void {
  this.route.paramMap.subscribe(params => {
    this.provaId = Number(params.get('provaId'));

    // opcional zerar lista enquanto carrega
    this.carregando = true;
    this.topicos = [];

    this.carregarDados();
  });
}


private carregarDados(): void {
  // 1) Buscar dados da prova (opcional)
  this.provaService.obter(this.provaId).subscribe({
    next: (p) => this.prova = p,
    error: () => {}
  });

  // 2) Buscar tópicos do edital
  this.topicoService.listarPorProva(this.provaId).subscribe({
    next: (lista) => {
      const arr = (lista || [])
        .filter(t => !!t); // remove qualquer undefined/null

      this.topicos = arr.sort((a, b) => {
        // usa o que existir: nivelTopico, nivel ou codigo
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

  // calcula a indentação pela profundidade do nível (1 = nível 1, 1.1 = nível 2, etc.)
getIndentPx(t: TopicoEdital): number {
  const nivel = (t.nivelTopico ?? t.nivel ?? t.codigo ?? '').toString();
  if (!nivel) return 0;
  const profundidade = nivel.split('.').length - 1;
  return profundidade * 24;
}


}
