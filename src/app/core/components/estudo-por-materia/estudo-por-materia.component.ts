import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OverlayPanel } from 'primeng/overlaypanel';


import { Materia } from 'src/app/core/models/materia.model';
import { Topico } from 'src/app/core/models/topico.model';
import { MateriaService } from 'src/app/core/services/materia.service';
import { SalaEstudoService } from 'src/app/core/services/sala-estudo.service';
import { RevisaoDashboardItem } from 'src/app/core/models/RevisaoDashboardItem';

type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';

type TopicoComRevisao = Topico & {
  proximaRevisao?: string | null;
  statusRevisao?: StatusRevisao | string;
};

interface InfoRevisaoTopico {
  status: StatusRevisao;
  proximaRevisao?: string | null;
  materiaId: number;
}

@Component({
  selector: 'app-estudo-por-materia',
  templateUrl: './estudo-por-materia.component.html',
  styleUrls: ['./estudo-por-materia.component.css']
})
export class MateriaEstudoComponent implements OnInit {

  // Busca simples (ngModel no HTML)
  filtro: string = '';
termoBusca = '';
materias: Materia[] = [];
 secaoAbertaId: number | null = null;
topicoAtivoId: number | null = null;

topicoMenu: Topico | null = null;

/** Conclusão local (se depois você quiser persistir no backend, eu conecto com service) */
private concluidosPorTopico = new Set<number>();

  materiaSelecionada?: Materia;
  materiaExpandida?: Materia | null;

  topicos: Topico[] = [];
  carregandoMaterias = false;
  carregandoTopicos = false;
  mensagemErro?: string;

  private revisoesPorTopico = new Map<number, InfoRevisaoTopico>();

  constructor(
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarMaterias();
    this.carregarRevisoesDashboard();
  }

  // ==========================
  // MATÉRIAS
  // ==========================
  carregarMaterias(): void {
    this.carregandoMaterias = true;
    this.mensagemErro = undefined;

    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
        this.carregandoMaterias = false;
      },
      error: (err) => {
        console.error('[MATERIAS] Erro ao carregar matérias:', err);
        this.mensagemErro = 'Erro ao carregar matérias.';
        this.carregandoMaterias = false;
      }
    });
  }

  selecionarMateria(m: Materia): void {
    this.materiaSelecionada = m;
  }
private asId(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

abrirSalaAulaTopico(m: Materia, t: Topico): void {
  const materiaIdRaw = (m as any)?.id ?? (m as any)?.materiaId ?? null;
  const materiaId = Number(materiaIdRaw);

  const topicoIdRaw = (t as any)?.id ?? (t as any)?.topicoId ?? null;
  const topicoId = topicoIdRaw != null ? Number(topicoIdRaw) : null;

  // ✅ evita navegar pra URL quebrada (isso é o que te joga pro /home)
  if (!Number.isFinite(materiaId) || materiaId <= 0) {
    console.warn('[NAVEGACAO] materiaId inválido:', materiaIdRaw, m);
    return;
  }

  // ✅ rota CERTA do seu routing
  this.router.navigate(
    ['/area-restrita/sala-estudo', materiaId],
    { queryParams: (topicoId && Number.isFinite(topicoId)) ? { topicoId } : undefined }
  );
}



  // Expande/fecha painel de tópicos (visualização)
toggleMateria(m: Materia): void {
  if (this.materiaExpandida?.id === m.id) {
    this.materiaExpandida = null;
    this.topicos = [];
    this.secaoAbertaId = null;     // ✅
    this.topicoAtivoId = null;     // ✅
    return;
  }

  this.materiaExpandida = m;
  this.materiaSelecionada = m;
  this.secaoAbertaId = null;       // ✅
  this.topicoAtivoId = null;       // ✅
  this.carregarTopicos(m);
}


  // ==========================
  // SALA DE ESTUDO
  // ==========================
  abrirSalaEstudoMateria(m: Materia): void {
    if (!m?.id) {
      alert('Matéria inválida.');
      return;
    }
    this.router.navigate(['/area-restrita/sala-estudo', m.id]);
  }

  // ==========================
  // TÓPICOS (somente leitura)
  // ==========================
  private carregarTopicos(m: Materia): void {
    if (!m?.id) return;

    this.carregandoTopicos = true;
    this.topicos = [];
    this.mensagemErro = undefined;

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        this.topicos = listaSegura.map((dto: any) => this.converterDtoParaTopico(dto, 0));
        this.carregandoTopicos = false;
      },
      error: (err) => {
        console.error('[TOPICOS] Erro ao carregar tópicos:', err);
        this.mensagemErro = 'Erro ao carregar tópicos da matéria.';
        this.carregandoTopicos = false;
      }
    });
  }

private converterDtoParaTopico(dto: any, nivel: number = 0): Topico {
  const idRaw =
    dto?.id ??
    dto?.topicoId ??
    dto?.subtopicoId ??
    dto?.idTopico ??
    dto?.idSubtopico ??
    null;

  const idConvertido = this.asId(idRaw);

  const filhos: Topico[] = (dto?.subtopicos || []).map((sub: any) =>
    this.converterDtoParaTopico(sub, nivel + 1)
  );

  const topico: Topico = {
    id: idConvertido as any,               // ✅ padroniza number
    descricao: dto?.descricao,
    ativo: dto?.ativo ?? true,
    nivel,
    filhos,
    proximaRevisao: dto?.proximaRevisao ?? dto?.dataProximaRevisao ?? null,
    statusRevisao: dto?.statusRevisao
  } as any;

  return topico;
}


  // ==========================
  // DASHBOARD / SEMÁFORO
  // ==========================
  private carregarRevisoesDashboard(): void {
    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens: RevisaoDashboardItem[]) => {
        this.revisoesPorTopico.clear();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        (itens || []).forEach((item) => {
          if (!item.topicoId || !item.materiaId) return;

          const proxima: string | null =
            (item as any).proximaRevisao ||
            (item as any).dataProximaRevisao ||
            null;

          let status: StatusRevisao = 'SEM';

          if (proxima) {
            const dataRev = this.construirDataLocal(proxima);
            const hojeTime = hoje.getTime();
            const revTime = dataRev.getTime();

            if (revTime < hojeTime) status = 'ATRASADA';
            else if (revTime === hojeTime) status = 'HOJE';
            else status = 'FUTURA';
          }

          this.revisoesPorTopico.set(item.topicoId, {
            status,
            proximaRevisao: proxima,
            materiaId: item.materiaId
          });
        });
      },
      error: (err) => console.error('[DASHBOARD-REVISAO] Erro ao carregar revisões:', err)
    });
  }
classeDotRevisao(t: Topico) {
  const st = this.getStatusRevisaoTopicoComFilhos(t);
  return {
    'rev-sem': st === 'SEM',
    'rev-futura': st === 'FUTURA',
    'rev-hoje': st === 'HOJE',
    'rev-atrasada': st === 'ATRASADA'
  };
}

  /** Status consolidado da MATÉRIA (pior status entre todos os tópicos) */
  private getStatusRevisaoMateria(m: Materia): StatusRevisao {
    if (!m?.id) return 'SEM';

    // Se estiver expandida, calcula no que está na tela
    if (this.materiaExpandida && this.materiaExpandida.id === m.id && this.topicos?.length) {
      let pior: StatusRevisao = 'SEM';

      const acumulaStatus = (t: Topico) => {
        const st = this.getStatusRevisaoTopicoComFilhos(t);
        if (this.prioridadeStatus(st) > this.prioridadeStatus(pior)) pior = st;
        (t.filhos || []).forEach(acumulaStatus);
      };

      this.topicos.forEach(acumulaStatus);
      return pior;
    }

    // Caso não esteja expandida, usa dashboard por tópico
    let pior: StatusRevisao = 'SEM';
    this.revisoesPorTopico.forEach((info) => {
      if (info.materiaId === m.id) {
        const st = info.status;
        if (this.prioridadeStatus(st) > this.prioridadeStatus(pior)) pior = st;
      }
    });

    return pior;
  }

  classeSemaforoMateria(m: Materia) {
    const status = this.getStatusRevisaoMateria(m);
    return {
      'badge-sem-revisao': status === 'SEM',
      'badge-revisao-futura': status === 'FUTURA',
      'badge-revisao-hoje': status === 'HOJE',
      'badge-revisao-atrasada': status === 'ATRASADA'
    };
  }

  private getStatusRevisaoTopico(topico: Topico): StatusRevisao {
    if ((topico as any).id && this.revisoesPorTopico.has((topico as any).id)) {
      return this.revisoesPorTopico.get((topico as any).id)!.status;
    }

    if ((topico as any).proximaRevisao) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const proxima = String((topico as any).proximaRevisao);
      const dataRev = this.construirDataLocal(proxima);

      if (dataRev.getTime() < hoje.getTime()) return 'ATRASADA';
      if (dataRev.getTime() === hoje.getTime()) return 'HOJE';
      return 'FUTURA';
    }

    return 'SEM';
  }

  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3;
      case 'HOJE': return 2;
      case 'FUTURA': return 1;
      case 'SEM':
      default: return 0;
    }
  }

  private getStatusRevisaoTopicoComFilhos(topico: Topico): StatusRevisao {
    let pior: StatusRevisao = this.getStatusRevisaoTopico(topico);

    (topico.filhos || []).forEach((filho) => {
      const stFilho = this.getStatusRevisaoTopicoComFilhos(filho);
      if (this.prioridadeStatus(stFilho) > this.prioridadeStatus(pior)) {
        pior = stFilho;
      }
    });

    return pior;
  }

  classeSemaforoRevisao(topico: TopicoComRevisao) {
    const status = this.getStatusRevisaoTopicoComFilhos(topico);
    return {
      'badge-sem-revisao': status === 'SEM',
      'badge-revisao-futura': status === 'FUTURA',
      'badge-revisao-hoje': status === 'HOJE',
      'badge-revisao-atrasada': status === 'ATRASADA'
    };
  }

  // Labels bonitos para o badge (HTML usa isso)
  getLabelStatusMateria(m: Materia): string {
    const st = this.getStatusRevisaoMateria(m);
    return this.labelStatus(st);
  }

  getLabelStatusTopico(t: Topico): string {
    const st = this.getStatusRevisaoTopicoComFilhos(t);
    return this.labelStatus(st);
  }

  private labelStatus(st: StatusRevisao): string {
    switch (st) {
      case 'ATRASADA': return 'Atrasada';
      case 'HOJE': return 'Vence hoje';
      case 'FUTURA': return 'Em dia';
      case 'SEM':
      default: return 'Sem revisão';
    }
  }

  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);

    const data = new Date(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data;
  }
  get materiasFiltradas(): Materia[] {
  const t = (this.termoBusca || '').trim().toLowerCase();
  if (!t) return this.materias;

  return (this.materias || []).filter(m =>
    (m?.nome || '').toLowerCase().includes(t)
  );
}

toggleSecao(secao: Topico): void {
  const id = (secao as any)?.id;
  if (!id) {
    this.secaoAbertaId = null;
    return;
  }
  this.secaoAbertaId = (this.secaoAbertaId === id) ? null : id;
}

selecionarTopico(t: Topico): void {
  const id = (t as any)?.id;
  this.topicoAtivoId = id ?? null;
}

/** Só mostra o quadrado se o tópico já tem “histórico” (revisão != SEM) */
isTopicoEstudado(t: Topico): boolean {
  const st = this.getLabelStatusTopico(t); // usa sua lógica já pronta
  return st !== 'Sem revisão';
}

/** Concluído (visual) */
isTopicoConcluido(t: Topico): boolean {
  const id = (t as any)?.id;
  if (!id) return false;
  return this.concluidosPorTopico.has(id);
}

/** Clique no quadrado abre menu */
abrirMenuConcluir(event: Event, topico: Topico, op: OverlayPanel): void {
  event.stopPropagation();
  this.topicoMenu = topico;
  op.toggle(event);
}

/** Marca como concluído (local) */
marcarComoConcluido(topico: Topico | null): void {
  const id = (topico as any)?.id;
  if (!id) return;
  this.concluidosPorTopico.add(id);
}

/** Desmarca */
desmarcarConcluido(topico: Topico | null): void {
  const id = (topico as any)?.id;
  if (!id) return;
  this.concluidosPorTopico.delete(id);
}

/* ====== Contadores 0/5 aulas e % da seção ====== */
getTotalSecao(secao: Topico): number {
  return (secao?.filhos?.length ?? 0);
}

getConcluidasSecao(secao: Topico): number {
  const filhos = (secao?.filhos ?? []);
  return filhos.filter((x: any) => x?.id && this.concluidosPorTopico.has(x.id)).length;
}

getPercentSecao(secao: Topico): number {
  const total = this.getTotalSecao(secao);
  if (!total) return 0;
  return Math.round((this.getConcluidasSecao(secao) / total) * 100);
}

/* ====== % da matéria (baseado no que existe no dashboard/map) ====== */
getPercentMateria(m: Materia): number {
  if (!m?.id) return 0;

  let total = 0;
  let concl = 0;

  this.revisoesPorTopico.forEach((info, topicoId) => {
    if (info.materiaId === m.id) {
      total++;
      if (this.concluidosPorTopico.has(topicoId)) concl++;
    }
  });

  if (!total) return 0;
  return Math.round((concl / total) * 100);
}

}
