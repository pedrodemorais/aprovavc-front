import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { MateriaService } from '../services/materia.service';
import { SalaEstudoService  } from '../services/sala-estudo.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { Edital } from '../models/Edital';
import { EditalService } from '../services/edital.service';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';
import { EditalTemplateService } from '../services/edital-template.service';

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
export class MateriaEstudoComponent implements OnInit, OnDestroy {

  // ✅ regra de clean: lista sem “número” por default
  mostrarPercentNaLista = false;

  termoBusca = '';
  materias: Materia[] = [];
  editais: Edital[] = [];
  activeEditalImagemUrl: string | null = null;
  private activeEditalImagemObjectUrl: string | null = null;
  carregandoEditais = false;
  escopoValor = 'todas';
  private readonly escopoParametroChave = 'centro_estudo_filtro_pro_prova';

  secaoAbertaId: number | null = null;
  topicoAtivoId: number | null = null;


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
  private topicosFinalizadosPendentes = new Map<number, boolean>();

  constructor(
    private materiaService: MateriaService,
    private salaEstudoService: SalaEstudoService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private empresaParametroService: EmpresaParametroService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarParametroEscopo();
    this.carregarMaterias();
    this.carregarEditais();
    this.carregarRevisoesDashboard();
    this.carregarTopicosFinalizados();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.carregarTopicosFinalizados();
  }

  ngOnDestroy(): void {
    this.removerImagemEditalSelecionado();
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
        this.atualizarImagemEditalSelecionado();
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
    this.atualizarImagemEditalSelecionado();
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

  getDominioEdital(edital?: Edital | null): number {
    const dominio = Number(edital?.nivelDominioGeral ?? 0) || 0;
    const progresso = Number(edital?.percentualEstudadoGeral ?? 0) || 0;
    return Math.min(dominio, progresso);
  }

  getEditalCargo(edital?: Edital | null): string {
    return String((edital as any)?.cargo || '').trim();
  }

  getRevisoesVencidasEdital(edital?: Edital | null): number {
    return this.getRevisoesPorStatusEdital(edital, 'ATRASADA');
  }

  getRevisoesHojeEdital(edital?: Edital | null): number {
    return this.getRevisoesPorStatusEdital(edital, 'HOJE');
  }

  onEditalImagemErro(): void {
    this.removerImagemEditalSelecionado();
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

  irParaRevisaoMateria(m: Materia, status: StatusRevisao): void {
    const materiaId = this.asId((m as any)?.id ?? (m as any)?.materiaId);
    if (!materiaId) {
      return;
    }

    const topicoId = this.obterTopicoRevisaoPorStatus(materiaId, status);
    const queryParams: any = { modo: 'revisar' };
    if (topicoId) {
      queryParams.topicoId = topicoId;
    }
    this.router.navigate(['/area-restrita/sala-estudo', materiaId], { queryParams });
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

  private atualizarImagemEditalSelecionado(): void {
    this.removerImagemEditalSelecionado();
    const edital = this.editalSelecionado;
    if (!edital) return;
    if (this.definirImagemEditalPorBytes(edital)) return;

    const templateId = this.obterTemplateIdDoEdital(edital);
    if (!templateId) return;
    this.carregarImagemEditalSelecionado(templateId);
  }

  private obterTemplateIdDoEdital(edital: Edital): number | null {
    const anyEdital = edital as any;
    const templateId =
      anyEdital?.templateId ??
      anyEdital?.editalTemplateId ??
      anyEdital?.template?.id ??
      null;
    const idNum = Number(templateId);
    return Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  }

  private carregarImagemEditalSelecionado(templateId: number): void {
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        this.removerImagemEditalSelecionado();

        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.activeEditalImagemObjectUrl = objectUrl;
          this.activeEditalImagemUrl = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.activeEditalImagemUrl = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.removerImagemEditalSelecionado();
          });
      },
      error: () => {
        this.removerImagemEditalSelecionado();
      }
    });
  }

  private definirImagemEditalPorBytes(edital: Edital): boolean {
    const anyEdital = edital as any;
    const bytes =
      anyEdital?.imagemBytes ??
      anyEdital?.imagem_bytes ??
      anyEdital?.imagemBase64 ??
      null;
    if (!bytes) {
      return false;
    }

    let base64: string | null = null;
    if (typeof bytes === 'string') {
      base64 = bytes.trim();
    } else if (Array.isArray(bytes)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes));
    } else if (Array.isArray(bytes?.data)) {
      base64 = this.uint8ArrayToBase64(new Uint8Array(bytes.data));
    }

    if (!base64) {
      return false;
    }

    if (base64.startsWith('data:image')) {
      this.activeEditalImagemUrl = base64;
      return true;
    }

    const contentType = this.inferirContentTypeImagem(anyEdital?.imagem);
    this.activeEditalImagemUrl = `data:${contentType};base64,${base64}`;
    return true;
  }

  private inferirContentTypeImagem(caminho?: string | null): string {
    const nome = (caminho || '').toLowerCase();
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    if (nome.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private lerBlobComoTexto(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  private parseImagemResponse(texto: string): { dados?: string; contentType?: any } | null {
    const raw = (texto || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizarContentType(contentType: any): string {
    if (!contentType) return 'image/png';
    if (typeof contentType === 'string') return contentType;
    const type = contentType.type || contentType.mainType || 'image';
    const subtype = contentType.subtype || contentType.subType || 'png';
    return `${type}/${subtype}`;
  }

  private removerImagemEditalSelecionado(): void {
    if (this.activeEditalImagemObjectUrl) {
      URL.revokeObjectURL(this.activeEditalImagemObjectUrl);
      this.activeEditalImagemObjectUrl = null;
    }
    this.activeEditalImagemUrl = null;
  }

  private getRevisoesPorStatusEdital(edital: Edital | null | undefined, status: StatusRevisao): number {
    if (!edital?.id) return 0;
    const ids = this.materiasPorEdital.get(edital.id);
    if (!ids || !ids.size) return 0;

    let total = 0;
    this.revisoesPorTopico.forEach((info) => {
      if (ids.has(info.materiaId) && info.status === status) {
        total += 1;
      }
    });
    return total;
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

  private obterTopicoRevisaoPorStatus(materiaId: number, status: StatusRevisao): number | null {
    let escolhidoTopicoId: number | null = null;
    let escolhidoData: Date | null = null;

    this.revisoesPorTopico.forEach((info, topicoId) => {
      if (info.materiaId !== materiaId || info.status !== status) {
        return;
      }

      const data = info.proximaRevisao ? this.construirDataLocal(info.proximaRevisao) : undefined;
      if (escolhidoTopicoId === null) {
        escolhidoTopicoId = topicoId;
        escolhidoData = data ?? null;
        return;
      }
      if (!escolhidoData) {
        escolhidoTopicoId = topicoId;
        escolhidoData = data ?? null;
        return;
      }
      if (data && data.getTime() < escolhidoData.getTime()) {
        escolhidoTopicoId = topicoId;
        escolhidoData = data;
      }
    });

    return escolhidoTopicoId;
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
    const id = this.getTopicoId(t);
    if (!id) return false;
    return this.concluidosPorTopico.has(id);
  }

  onToggleConcluido(topico: Topico): void {
    const id = this.getTopicoId(topico);
    if (!id) {
      return;
    }

    if (this.isTopicoConcluido(topico)) {
      const confirmado = window.confirm('Deseja desmarcar este topico como concluido?');
      if (!confirmado) {
        return;
      }
      this.topicosFinalizadosPendentes.set(id, false);
      this.concluidosPorTopico.delete(id);
      this.atualizarResumoExpandida();
      this.salaEstudoService.desfinalizarTopico(id).subscribe({
        next: () => {
          this.topicosFinalizadosPendentes.delete(id);
        },
        error: () => {
          this.topicosFinalizadosPendentes.delete(id);
          this.concluidosPorTopico.add(id);
          this.atualizarResumoExpandida();
          this.mensagemErro = 'Nao foi possivel desfazer o finalizado.';
        }
      });
      return;
    }

    const confirmado = window.confirm('Deseja marcar este topico como concluido?');
    if (!confirmado) {
      return;
    }
    this.topicosFinalizadosPendentes.set(id, true);
    this.concluidosPorTopico.add(id);
    this.atualizarResumoExpandida();
    this.salaEstudoService.finalizarTopico(id).subscribe({
      next: () => {
        this.topicosFinalizadosPendentes.delete(id);
      },
      error: () => {
        this.topicosFinalizadosPendentes.delete(id);
        this.concluidosPorTopico.delete(id);
        this.atualizarResumoExpandida();
        this.mensagemErro = 'Nao foi possivel finalizar o topico.';
      }
    });
  }

  marcarComoConcluido(topico: Topico | null): void {
    const id = this.getTopicoId(topico);
    if (!id) return;
    this.salaEstudoService.finalizarTopico(id).subscribe({
      next: () => {
        this.concluidosPorTopico.add(id);
        this.atualizarResumoExpandida();
      },
      error: () => {
        this.mensagemErro = 'Nao foi possivel finalizar o topico.';
      }
    });
  }

  desmarcarConcluido(topico: Topico | null): void {
    const id = this.getTopicoId(topico);
    if (!id) return;
    this.salaEstudoService.desfinalizarTopico(id).subscribe({
      next: () => {
        this.concluidosPorTopico.delete(id);
        this.atualizarResumoExpandida();
      },
      error: () => {
        this.mensagemErro = 'Nao foi possivel desfazer o finalizado.';
      }
    });
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

  getResumoMateriaLinha(m: Materia): ResumoMateriaExpandida {
    const materiaId = this.asId((m as any)?.id ?? (m as any)?.materiaId);
    if (!materiaId) {
      return { total: 0, concluidas: 0, atrasadas: 0, hoje: 0, emDia: 0 };
    }

    let total = 0;
    let concluidas = 0;
    let atrasadas = 0;
    let hoje = 0;
    let emDia = 0;

    this.revisoesPorTopico.forEach((info, topicoId) => {
      if (info.materiaId !== materiaId) return;
      total++;
      if (this.concluidosPorTopico.has(topicoId)) concluidas++;

      if (info.status === 'ATRASADA') atrasadas++;
      else if (info.status === 'HOJE') hoje++;
      else if (info.status === 'FUTURA') emDia++;
    });

    return { total, concluidas, atrasadas, hoje, emDia };
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

  private carregarTopicosFinalizados(): void {
    this.salaEstudoService.listarTopicosFinalizados().subscribe({
      next: (lista) => {
        const concluido = new Set((lista || [])
          .map((item) => this.getTopicoId(item))
          .filter((id): id is number => Number.isFinite(id)));

        this.topicosFinalizadosPendentes.forEach((finalizado, id) => {
          if (finalizado) {
            concluido.add(id);
          } else {
            concluido.delete(id);
          }
        });

        this.concluidosPorTopico = concluido;
        this.atualizarResumoExpandida();
      },
      error: () => {
        this.concluidosPorTopico = new Set();
        this.atualizarResumoExpandida();
      }
    });
  }

  private getTopicoId(topico: any): number | null {
    const raw = topico?.id ?? topico?.topicoId ?? null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
}
