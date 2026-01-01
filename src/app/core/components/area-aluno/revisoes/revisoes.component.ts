import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  filtroStatus: 'atrasadas' | 'hoje' | 'emdia' | 'todas' = 'todas';
  filtroMateriaId: number | null = null;
  private revisoesTodas: RevisaoDashboardItem[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private salaEstudoService: SalaEstudoService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const filtro = (params.get('filtro') || '').toLowerCase();
      this.filtroStatus = filtro === 'atrasadas' || filtro === 'hoje' || filtro === 'emdia' ? (filtro as any) : 'todas';
      const materiaId = Number(params.get('materiaId'));
      this.filtroMateriaId = Number.isFinite(materiaId) && materiaId > 0 ? materiaId : null;
      this.aplicarFiltro();
    });

    if (this.modo === 'automatico') {
      this.carregarRevisoes();
    }
  }

  private carregarRevisoes(): void {
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens) => {
        this.revisoesTodas = itens || [];
        this.aplicarFiltro();
        this.carregando = false;
      },
      error: () => {
        this.erro = 'Erro ao carregar revisões.';
        this.carregando = false;
      }
    });
  }

  get revisoesFiltradas(): RevisaoDashboardItem[] {
    return this.revisoes;
  }

  private aplicarFiltro(): void {
    const base = this.revisoesTodas.length ? this.revisoesTodas : this.revisoes;
    let lista = [...base];
    if (this.filtroStatus !== 'todas') {
      const statusMap: Record<string, string> = {
        atrasadas: 'VENCIDA',
        hoje: 'EM_DIA',
        emdia: 'FUTURA'
      };
      const alvo = statusMap[this.filtroStatus];
      lista = lista.filter((item) => item.status === alvo);
    }
    if (this.filtroMateriaId) {
      lista = lista.filter((item) => item.materiaId === this.filtroMateriaId);
    }
    this.revisoes = lista;
  }

  irParaSala(item: RevisaoDashboardItem): void {
    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId } }
    );
  }
}
