// src/app/area-restrita/estudos/edital-estudo/edital-estudo.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ProvaEstudoDTO } from 'src/app/area-restrita/services/prova.service';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';

import { TopicoEdital } from 'src/app/core/models/topico-edital.model';
import { TopicoEditalService } from 'src/app/core/services/topico-edital.service';

import { TopicoRevisaoService } from 'src/app/core/services/topico-revisao.service';
import { TopicoRevisao } from 'src/app/core/models/topico-revisao.model';

type StatusEstudo = 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';

type EstadoLocal = {
  notas: string;
  status: StatusEstudo;
  tempoMs: number;
  ultimaAtualizacao: string | Date;
};

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

  // cache situação (localStorage)
  situacaoPorTopico: Record<number, StatusEstudo> = {};

  // cache revisão (backend)
  private proximaRevisaoPorTopico = new Map<number, string>(); // yyyy-MM-dd ou ISO

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private provaService: ProvaEstudoService,
    private topicoService: TopicoEditalService,
    private topicoRevisaoService: TopicoRevisaoService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.provaId = Number(params.get('provaId'));

      this.carregando = true;
      this.topicos = [];
      this.situacaoPorTopico = {};
      this.proximaRevisaoPorTopico.clear();

      this.carregarDados();
      this.carregarRevisoesDaProva(); // ✅ bolinhas
    });
  }

  // =========================
  // CARREGAMENTO PRINCIPAL
  // =========================
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

        this.atualizarSituacoesCache();
        this.carregando = false;
      },
      error: () => {
        this.topicos = [];
        this.carregando = false;
      }
    });
  }

  // =========================
  // ✅ REVISOES (BOLINHAS) - usa o mesmo service que já funciona
  // =========================
  private carregarRevisoesDaProva(): void {
    this.topicoRevisaoService.listar('').subscribe({
      next: (lista) => {
        const todos = (lista || []) as TopicoRevisao[];

        const daProva = todos.filter(r => (r.provaId ?? null) === this.provaId);

        this.proximaRevisaoPorTopico.clear();

        daProva.forEach(r => {
          const topicoId = r.topicoEditalId;           // <<< aqui é o campo chave
          const data = r.dataProximaRevisao;           // <<< aqui é a data da revisão

          if (topicoId && data) {
            this.proximaRevisaoPorTopico.set(topicoId, data);
          }
        });
      },
      error: () => {
        // não quebra a tela, só fica cinza
        this.proximaRevisaoPorTopico.clear();
      }
    });
  }

  // =========================
  // INDENTAÇÃO / FILHOS / NAVEGAÇÃO
  // =========================
  getIndentPx(t: TopicoEdital): number {
    const nivel = (t.nivelTopico ?? t.nivel ?? t.codigo ?? '').toString();
    if (!nivel) return 0;
    const profundidade = nivel.split('.').length - 1;
    return profundidade * 24;
  }

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

  abrirSalaEstudo(topico: TopicoEdital): void {
    if (!topico?.id) return;

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

  // =========================
  // SITUAÇÃO (LOCALSTORAGE)
  // =========================
  private getStorageKeyById(topicoId: number): string {
    return `estudo_${this.provaId}_${topicoId}`;
  }

  private carregarSituacao(topicoId: number): StatusEstudo {
    const key = this.getStorageKeyById(topicoId);
    const saved = localStorage.getItem(key);
    if (!saved) return 'nao_iniciado';

    try {
      const obj = JSON.parse(saved);
      const st = obj?.status as StatusEstudo;

      if (st === 'nao_iniciado' || st === 'em_estudo' || st === 'pausado' || st === 'concluido') {
        return st;
      }
      return 'nao_iniciado';
    } catch {
      return 'nao_iniciado';
    }
  }

  private atualizarSituacoesCache(): void {
    this.situacaoPorTopico = {};
    (this.topicos || []).forEach(t => {
      if (t?.id) this.situacaoPorTopico[t.id] = this.carregarSituacao(t.id);
    });
  }

  getSituacaoById(id?: number): StatusEstudo {
    if (!id) return 'nao_iniciado';
    return this.situacaoPorTopico[id] ?? this.carregarSituacao(id);
  }

  getSituacaoLabelById(id?: number): string {
    const st = this.getSituacaoById(id);
    switch (st) {
      case 'nao_iniciado': return 'Não iniciado';
      case 'em_estudo': return 'Em estudo';
      case 'pausado': return 'Pausado';
      case 'concluido': return 'Concluído';
      default: return 'Não iniciado';
    }
  }

  getSituacaoClassById(id?: number): any {
    const st = this.getSituacaoById(id);
    return {
      'badge-nao-iniciado': st === 'nao_iniciado',
      'badge-em-estudo': st === 'em_estudo',
      'badge-pausado': st === 'pausado',
      'badge-concluido': st === 'concluido'
    };
  }

  // (se você ainda usa isso em algum lugar)
  private getEstadoById(topicoId: number): EstadoLocal {
    const key = this.getStorageKeyById(topicoId);
    const saved = localStorage.getItem(key);

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }

    return {
      notas: '',
      status: 'nao_iniciado',
      tempoMs: 0,
      ultimaAtualizacao: new Date()
    };
  }

  // =========================
  // DOT (revisão por data)
  // =========================



  private hojeZerado(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  private dataZerada(value: string | Date): number {
    const d = (value instanceof Date) ? value : new Date(value);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }



  // =========================
// DOT (revisão por data) — SEM BUG DE TIMEZONE
// =========================
private hojeLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // yyyy-MM-dd (LOCAL)
}

private extrairISODate(value: string | Date | null | undefined): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // value pode vir "2025-11-29" ou "2025-11-29T00:00:00Z"
  const s = String(value);
  return s.length >= 10 ? s.substring(0, 10) : null;
}

getDotClassByTopicoId(topicoId: number): string {
  const raw = this.proximaRevisaoPorTopico.get(topicoId);
  const dataISO = this.extrairISODate(raw);

  if (!dataISO) return 'dot-sem';

  const hojeISO = this.hojeLocalISO();

  if (dataISO < hojeISO) return 'dot-atrasado';
  if (dataISO === hojeISO) return 'dot-hoje';
  return 'dot-em-dia';
}

getDotTitleByTopicoId(topicoId: number): string {
  const raw = this.proximaRevisaoPorTopico.get(topicoId);
  const dataISO = this.extrairISODate(raw);

  if (!dataISO) return 'Sem revisão cadastrada';

  const cls = this.getDotClassByTopicoId(topicoId);
  const br = this.formatarDataBR(dataISO);

  if (cls === 'dot-atrasado') return `Revisão atrasada (${br})`;
  if (cls === 'dot-hoje') return `Revisão para hoje (${br})`;
  return `Revisão em dia (${br})`;
}

private formatarDataBR(value: string | Date): string {
  // garante parse local para yyyy-MM-dd
  const iso = this.extrairISODate(value) ?? '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';

  const dt = new Date(y, m - 1, d); // LOCAL (sem UTC)
  return dt.toLocaleDateString('pt-BR');
}

private getNivelTexto(t: any): string {
  return (t?.nivelTopico ?? t?.nivel ?? t?.codigo ?? '').toString().trim();
}

isMateria(t: any): boolean {
  const nivel = this.getNivelTexto(t);
  if (!nivel) return false;
  return !nivel.includes('.'); // 1,2,3... (matéria). 1.1, 2.3... (subtópico)
}



  
  
}
