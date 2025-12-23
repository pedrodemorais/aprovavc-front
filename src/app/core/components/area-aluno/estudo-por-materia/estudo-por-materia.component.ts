import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OverlayPanel } from 'primeng/overlaypanel';

import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { MateriaService } from '../services/materia.service';
import { SalaEstudoService  } from '../services/sala-estudo.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { Edital } from '../models/Edital';
import { EditalService } from '../services/edital.service';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';

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

interface ResumoMateriaExpandida {
  total: number;
  concluidas: number;
  atrasadas: number;
  hoje: number;
  emDia: number;
}

@Component({
  selector: 'app-estudo-por-materia',
  templateUrl: './estudo-por-materia.component.html',
  styleUrls: ['./estudo-por-materia.component.css']
})
export class MateriaEstudoComponent implements OnInit {

  // ✅ regra de clean: lista sem “número” por default
  mostrarPercentNaLista = false;

  termoBusca = '';
  materias: Materia[] = [];
  editais: Edital[] = [];
  carregandoEditais = false;
  escopoValor = 'todas';
  private readonly escopoParametroChave = 'centro_estudo_filtro_pro_prova';

  secaoAbertaId: number | null = null;
  topicoAtivoId: number | null = null;

  topicoMenu: Topico | null = null;

  private concluidosPorTopico = new Set<number>();
  private materiasPorEdital = new Map<number, Set<number>>();
  private materiasComEdital = new Set<number>();

  materiaSelecionada?: Materia;
  materiaExpandida?: Materia | null;

  topicos: Topico[] = [];
  carregandoMaterias = false;
  carregandoTopicos = false;
  mensagemErro?: string;

  resumoExpandida: ResumoMateriaExpandida | null = null;

  private revisoesPorTopico = new Map<number, InfoRevisaoTopico>();

  constructor(
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private editalService: EditalService,
    private empresaParametroService: EmpresaParametroService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarParametroEscopo();
    this.carregarMaterias();
    this.carregarEditais();
    this.carregarRevisoesDashboard();
  }

  // ==========================
  // KPIs topo (baseado na lista filtrada)
  // ==========================
  get qtdAtrasadas(): number {
    return this.materiasFiltradas.reduce((acc, m) => this.getStatusRevisaoMateria(m) === 'ATRASADA' ? acc + 1 : acc, 0);
  }

  get qtdHoje(): number {
    return this.materiasFiltradas.reduce((acc, m) => this.getStatusRevisaoMateria(m) === 'HOJE' ? acc + 1 : acc, 0);
  }

  get qtdEmDia(): number {
    return this.materiasFiltradas.reduce((acc, m) => this.getStatusRevisaoMateria(m) === 'FUTURA' ? acc + 1 : acc, 0);
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

  carregarEditais(): void {
    this.carregandoEditais = true;

    this.editalService.listar().subscribe({
      next: (lista) => {
        this.editais = lista || [];
        this.rebuildEditaisIndex();
        this.carregandoEditais = false;
      },
      error: (err) => {
        console.error('[EDITAIS] Erro ao carregar editais:', err);
        this.carregandoEditais = false;
      }
    });
  }

  private rebuildEditaisIndex(): void {
    this.materiasPorEdital.clear();
    this.materiasComEdital.clear();

    (this.editais || []).forEach((edital) => {
      if (!edital?.id) return;
      const ids = new Set<number>();
      (edital.materias || []).forEach((m) => {
        if (m?.materiaId) {
          ids.add(m.materiaId);
          this.materiasComEdital.add(m.materiaId);
        }
      });
      this.materiasPorEdital.set(edital.id, ids);
    });

    if (this.escopoValor.startsWith('edital-')) {
      const editalId = Number(this.escopoValor.replace('edital-', ''));
      if (!this.materiasPorEdital.has(editalId)) {
        this.escopoValor = 'todas';
        this.persistirEscopo();
      }
    }
  }

  onEscopoChange(valor?: string): void {
    if (valor) this.escopoValor = valor;
    this.materiaExpandida = null;
    this.materiaSelecionada = undefined;
    this.topicos = [];
    this.secaoAbertaId = null;
    this.topicoAtivoId = null;
    this.resumoExpandida = null;
    this.persistirEscopo();
  }

  get editalSelecionado(): Edital | null {
    if (!this.escopoValor.startsWith('edital-')) {
      return null;
    }
    const editalId = Number(this.escopoValor.replace('edital-', ''));
    if (!Number.isFinite(editalId)) {
      return null;
    }
    return this.editais.find(e => e.id === editalId) || null;
  }

  formatPercent(v?: number | null): string {
    if (v == null) {
      return '-';
    }
    return `${v.toFixed(0)}%`;
  }

  formatData(iso?: string | null): string {
    if (!iso) {
      return '-';
    }

    const partes = iso.split('-');
    if (partes.length !== 3) {
      return iso;
    }

    const ano = partes[0];
    const mes = partes[1];
    const dia = partes[2];

    return `${dia}/${mes}/${ano}`;
  }

  private carregarParametroEscopo(): void {
    this.empresaParametroService.getParametroPorChave(this.escopoParametroChave).subscribe({
      next: (valor) => {
        if (valor) {
          this.escopoValor = valor;
        }
      },
      error: (err) => {
        console.error('[PARAMETRO] Erro ao carregar filtro do centro de estudo:', err);
      }
    });
  }

  private persistirEscopo(): void {
    const valor = this.escopoValor || 'todas';
    const payload = { chave: this.escopoParametroChave, valor };

    this.empresaParametroService.atualizarParametro(payload).subscribe({
      error: () => {
        this.empresaParametroService.salvarParametro(payload).subscribe({
          error: (err: any) => {
            console.error('[PARAMETRO] Erro ao salvar filtro do centro de estudo:', err);
          }
        });
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

    if (!Number.isFinite(materiaId) || materiaId <= 0) {
      console.warn('[NAVEGACAO] materiaId inválido:', materiaIdRaw, m);
      return;
    }

    this.router.navigate(
      ['/area-restrita/sala-estudo', materiaId],
      { queryParams: (topicoId && Number.isFinite(topicoId)) ? { topicoId } : undefined }
    );
  }

  toggleMateria(m: Materia): void {
    if (this.materiaExpandida?.id === m.id) {
      this.materiaExpandida = null;
      this.topicos = [];
      this.secaoAbertaId = null;
      this.topicoAtivoId = null;
      this.resumoExpandida = null;
      return;
    }

    this.materiaExpandida = m;
    this.materiaSelecionada = m;
    this.secaoAbertaId = null;
    this.topicoAtivoId = null;
    this.resumoExpandida = null;

    this.carregarTopicos(m);
  }

  // ==========================
  // TÓPICOS
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

        // ✅ métricas só no expandir
        this.atualizarResumoExpandida();
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
      id: idConvertido as any,
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

  private getStatusRevisaoMateria(m: Materia): StatusRevisao {
    if (!m?.id) return 'SEM';

    // Se estiver expandida, calcula com a árvore em tela
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

    // Caso não esteja expandida, usa o dashboard
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

  // ✅ Filtra E ordena por urgência (ação)
  get materiasFiltradas(): Materia[] {
    const t = (this.termoBusca || '').trim().toLowerCase();
    const base = !t
      ? (this.materias || [])
      : (this.materias || []).filter(m => (m?.nome || '').toLowerCase().includes(t));

    const filtradas = base.filter((m) => this.materiaNoEscopo(m));

    return [...filtradas].sort((a, b) => {
      const pa = this.prioridadeStatus(this.getStatusRevisaoMateria(a));
      const pb = this.prioridadeStatus(this.getStatusRevisaoMateria(b));
      if (pb !== pa) return pb - pa; // ATRASADA primeiro
      return (a?.nome || '').localeCompare((b?.nome || ''));
    });
  }

  private materiaNoEscopo(m: Materia): boolean {
    const escopo = this.escopoValor;
    if (escopo === 'todas') return true;

    const materiaId = this.asId((m as any)?.id);
    if (!materiaId) return false;

    if (escopo === 'avulsas') {
      return !this.materiasComEdital.has(materiaId);
    }

    if (escopo.startsWith('edital-')) {
      const editalId = Number(escopo.replace('edital-', ''));
      if (!Number.isFinite(editalId)) return false;
      const ids = this.materiasPorEdital.get(editalId);
      return ids ? ids.has(materiaId) : false;
    }

    return true;
  }

  // ==========================
  // UI: SEÇÕES / SELEÇÃO
  // ==========================
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

  // ==========================
  // CONCLUSÃO local + overlay
  // ==========================
  isTopicoConcluido(t: Topico): boolean {
    const id = (t as any)?.id;
    if (!id) return false;
    return this.concluidosPorTopico.has(id);
  }

  abrirMenuConcluir(event: Event, topico: Topico, op: OverlayPanel): void {
    event.stopPropagation();
    this.topicoMenu = topico;
    op.toggle(event);
  }

  marcarComoConcluido(topico: Topico | null): void {
    const id = (topico as any)?.id;
    if (!id) return;
    this.concluidosPorTopico.add(id);
    this.atualizarResumoExpandida();
  }

  desmarcarConcluido(topico: Topico | null): void {
    const id = (topico as any)?.id;
    if (!id) return;
    this.concluidosPorTopico.delete(id);
    this.atualizarResumoExpandida();
  }

  // ==========================
  // Contadores seção
  // ==========================
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

  // ==========================
  // % na lista (se você ativar)
  // ==========================
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

  // ==========================
  // ✅ Resumo do expandir (métricas no lugar certo)
  // ==========================
  private folhasTopicos(lista: Topico[]): Topico[] {
    const out: Topico[] = [];
    const walk = (t: Topico) => {
      const filhos = t?.filhos || [];
      if (filhos.length) filhos.forEach(walk);
      else out.push(t);
    };
    (lista || []).forEach(walk);
    return out;
  }

  private atualizarResumoExpandida(): void {
    if (!this.materiaExpandida || !this.topicos?.length) {
      this.resumoExpandida = null;
      return;
    }

    const folhas = this.folhasTopicos(this.topicos);
    const total = folhas.length;

    let concluidas = 0;
    let atrasadas = 0;
    let hoje = 0;
    let emDia = 0;

    folhas.forEach(t => {
      const id = (t as any)?.id;
      if (id && this.concluidosPorTopico.has(id)) concluidas++;

      const st = this.getStatusRevisaoTopico(t);
      if (st === 'ATRASADA') atrasadas++;
      else if (st === 'HOJE') hoje++;
      else if (st === 'FUTURA') emDia++;
    });

    this.resumoExpandida = { total, concluidas, atrasadas, hoje, emDia };
  }
}
