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
  revisaoSelecionada: RevisaoDashboardItem | null = null;
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

  setFiltroStatus(status: 'atrasadas' | 'hoje' | 'emdia' | 'todas'): void {
    this.filtroStatus = status;
    this.aplicarFiltro();

    if (this.modo === 'automatico') {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { filtro: status },
        queryParamsHandling: 'merge'
      });
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

  get contagemRevisoes(): { vencidas: number; hoje: number; emDia: number } {
    const base = this.revisoesTodas.length ? this.revisoesTodas : this.revisoes;
    let vencidas = 0;
    let hoje = 0;
    let emDia = 0;

    for (const item of base) {
      if (item.status === 'VENCIDA') {
        vencidas += 1;
      } else if (item.status === 'EM_DIA') {
        hoje += 1;
      } else if (item.status === 'FUTURA') {
        emDia += 1;
      }
    }

    return { vencidas, hoje, emDia };
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
    if (this.revisaoSelecionada && !this.revisoes.some((item) => item.materiaId === this.revisaoSelecionada?.materiaId && item.topicoId === this.revisaoSelecionada?.topicoId)) {
      this.revisaoSelecionada = null;
    }
  }

  selecionarRevisao(item: RevisaoDashboardItem): void {
    this.revisaoSelecionada = item;
  }

  irParaSala(item: RevisaoDashboardItem): void {
    const rawModo = (this.route.snapshot.queryParamMap.get('modo') || '').toLowerCase();
    const modo = rawModo === 'revisao' || rawModo === 'revisar' ? rawModo : null;

    this.router.navigate(
      ['/area-restrita/sala-estudo', item.materiaId],
      { queryParams: { topicoId: item.topicoId, modo } }
    );
  }
}
