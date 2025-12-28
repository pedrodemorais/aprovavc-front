import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';

import { BlocosEstudoService } from '../services/blocos-estudo.service';

type PlanoMateriaDTO = {
  materiaId: number;
  nome: string;
  ordem: number;
};

type PlanoDoDiaDTO = {
  blocoNumero: number;
  minutosDisponiveis: number;
  materiasDoBloco: PlanoMateriaDTO[];
  revisoesAtrasadasQtd: number;
  revisoesHojeQtd: number;

  // opcionais (se seu backend devolver)
  revisoesAtrasadas?: any[];
  revisoesHoje?: any[];
};

@Component({
  selector: 'app-plano-do-dia-widget',
  templateUrl: './plano-do-dia-widget.component.html',
  styleUrls: ['./plano-do-dia-widget.component.css'],
  providers: [MessageService]
})
export class PlanoDoDiaWidgetComponent implements OnInit {

  carregando = false;
  erroMsg = '';

  plano: PlanoDoDiaDTO | null = null;

  constructor(
    private blocosService: BlocosEstudoService,
    private router: Router,
    private message: MessageService
  ) {}

  ngOnInit(): void {
    this.carregarPlano();
  }

  carregarPlano(): void {
    this.erroMsg = '';
    this.carregando = true;

    this.blocosService.planoDoDia()
      .pipe(finalize(() => (this.carregando = false)))
      .subscribe({
        next: (dto) => {
          this.plano = {
            ...dto,
            materiasDoBloco: [...(dto.materiasDoBloco || [])].sort((a, b) => a.ordem - b.ordem)
          };
        },
        error: (err) => {
          this.plano = null;
          this.erroMsg = err?.error?.message || 'Falha ao carregar o Plano do Dia.';
          this.message.add({ severity: 'error', summary: 'Erro', detail: this.erroMsg });
        }
      });
  }

  avancarBloco(): void {
    this.carregando = true;

    this.blocosService.avancarCiclo()
      .pipe(finalize(() => (this.carregando = false)))
      .subscribe({
        next: () => {
          this.message.add({ severity: 'success', summary: 'OK', detail: 'Bloco avançado.' });
          this.carregarPlano();
        },
        error: (err) => {
          const msg = err?.error?.message || 'Falha ao avançar bloco.';
          this.message.add({ severity: 'error', summary: 'Erro', detail: msg });
        }
      });
  }

  irParaBlocos(): void {
    this.router.navigate(['/area-restrita/blocos-estudo']);
  }

  minutosParaTexto(minutos: number | null | undefined): string {
    const m = Math.max(0, minutos ?? 0);
    const h = Math.floor(m / 60);
    const r = m % 60;

    if (h === 0) return `${r} min`;
    if (r === 0) return `${h}h`;
    return `${h}h ${r}min`;
  }

  get temMaterias(): boolean {
    return !!this.plano?.materiasDoBloco?.length;
  }
}
