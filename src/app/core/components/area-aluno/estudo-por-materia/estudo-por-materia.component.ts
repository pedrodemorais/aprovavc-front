import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';

import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { SalaEstudoService, MateriaTopicosDTO } from '../services/sala-estudo.service';
import { Edital } from '../models/Edital';
import { EditalService } from '../services/edital.service';
import { EmpresaParametroService } from 'src/app/site/services/empresa-parametro.service';
import { EditalTemplateService } from '../services/edital-template.service';
import { extrairStatusCanonicoRevisao } from '../utils/revisao-status.util';

type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';

type TopicoComRevisao = Topico & {
  proximaRevisao?: string | null;
  statusRevisao?: StatusRevisao | string;
  statusCanonico?: StatusRevisao | string;
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

  // âœ… regra de clean: lista sem â€œnÃºmeroâ€ por default
  mostrarPercentNaLista = false;

  termoBusca = '';
  materias: Materia[] = [];
  editais: Edital[] = [];
  activeEditalImagemUrl: string | null = null;
  private activeEditalImagemObjectUrl: string | null = null;
  private activeEditalImagemTemplateId: number | null = null;
  carregandoEditais = false;
  escopoValor = 'todas';
  private readonly escopoParametroChave = 'centro_estudo_filtro_pro_prova';

  secaoAbertaId: number | null = null;
  topicoAtivoId: number | null = null;


  private concluidosPorTopico = new Set<number>();
  private materiasPorEdital = new Map<number, Set<number>>();
  private materiasComEdital = new Set<number>();
  private topicosPorMateria = new Map<number, Topico[]>();
  private materiasFiltradasPorEscopo = false;

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
    private salaEstudoService: SalaEstudoService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private empresaParametroService: EmpresaParametroService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarParametroEscopo();
    this.carregarEditais();
    this.carregarRevisoesDashboard();
    this.carregarTopicosFinalizados();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.carregarRevisoesDashboard();
    this.carregarTopicosFinalizados();
  }

  ngOnDestroy(): void {
    this.removerImagemEditalSelecionado();
  }

  // ==========================
  // KPIs topo (baseado na lista filtrada)
  // ==========================
  get qtdAtrasadas(): number {
    return this.materiasFiltradas.reduce((acc, m) => acc + this.getResumoMateriaLinha(m).atrasadas, 0);
  }

  get qtdHoje(): number {
    return this.materiasFiltradas.reduce((acc, m) => acc + this.getResumoMateriaLinha(m).hoje, 0);
  }

  get qtdEmDia(): number {
    return this.materiasFiltradas.reduce((acc, m) => acc + this.getResumoMateriaLinha(m).emDia, 0);
  }

  // ==========================
  // MATÃ‰RIAS
  // ==========================
  carregarMateriasParaEstudo(): void {
    this.carregandoMaterias = true;
    this.mensagemErro = undefined;

    this.materiasFiltradasPorEscopo = false;
    const escopo = this.escopoValor || 'todas';
    this.salaEstudoService.listarMateriasParaEstudo(escopo).subscribe({
      next: (lista) => {
        const materias: Materia[] = [];
        this.topicosPorMateria.clear();

        (lista || []).forEach((item: MateriaTopicosDTO) => {
          const materiaId = Number(item?.materiaId);
          const materiaNome = String(item?.materiaNome || '').trim();
          if (!Number.isFinite(materiaId) || materiaId <= 0 || !materiaNome) {
            return;
          }
          materias.push({ id: materiaId, nome: materiaNome });
          const topicos = (item?.topicos || []).map((dto: any) => this.converterDtoParaTopico(dto, 0));
          this.topicosPorMateria.set(materiaId, topicos);
        });

        this.materias = materias;
        this.materiasFiltradasPorEscopo = true;
        this.carregandoMaterias = false;
      },
      error: (err) => {
        console.error('[MATERIAS] Erro ao carregar matérias:', err);
        this.mensagemErro = 'Erro ao carregar matérias.';
        this.materiasFiltradasPorEscopo = false;
        this.carregandoMaterias = false;
      }
    });

    /*
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
    */
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
    this.carregarMateriasParaEstudo();
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
        this.carregarMateriasParaEstudo();
        this.atualizarImagemEditalSelecionado();
      },
      error: (err) => {
        console.error('[PARAMETRO] Erro ao carregar filtro do centro de estudo:', err);
        this.carregarMateriasParaEstudo();
        this.atualizarImagemEditalSelecionado();
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
    this.abrirSalaAulaTopicoModo(m, t, 'estudar');
  }

  abrirSalaAulaTopicoModo(m: Materia, t: Topico, modo: 'estudar' | 'revisar'): void {
    const materiaIdRaw = (m as any)?.id ?? (m as any)?.materiaId ?? null;
    const materiaId = Number(materiaIdRaw);

    const topicoIdRaw = (t as any)?.id ?? (t as any)?.topicoId ?? null;
    const topicoId = topicoIdRaw != null ? Number(topicoIdRaw) : null;

    if (!Number.isFinite(materiaId) || materiaId <= 0) {
      console.warn('[NAVEGACAO] materiaId invÃ¡lido:', materiaIdRaw, m);
      return;
    }

    const queryParams: any = (topicoId && Number.isFinite(topicoId)) ? { topicoId } : {};
    if (modo === 'revisar') {
      queryParams.modo = 'revisar';
    }
    this.router.navigate(['/area-restrita/sala-estudo', materiaId], { queryParams });
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
  // TÃ“PICOS
  // ==========================
  private carregarTopicos(m: Materia): void {
    const materiaId = this.asId((m as any)?.id ?? (m as any)?.materiaId);
    if (!materiaId) return;

    this.carregandoTopicos = true;
    this.topicos = [];
    this.mensagemErro = undefined;

    const lista = this.topicosPorMateria.get(materiaId) || [];
    this.topicos = lista;
    this.carregandoTopicos = false;

    // Æ’o. mÃ‡Â¸tricas sÃ‡Ã¼ no expandir
    this.atualizarResumoExpandida();

    /*
    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        this.topicos = listaSegura.map((dto: any) => this.converterDtoParaTopico(dto, 0));
        this.carregandoTopicos = false;

        // âœ… mÃ©tricas sÃ³ no expandir
        this.atualizarResumoExpandida();
      },
      error: (err) => {
        console.error('[TOPICOS] Erro ao carregar tÃ³picos:', err);
        this.mensagemErro = 'Erro ao carregar tÃ³picos da matÃ©ria.';
        this.carregandoTopicos = false;
      }
    });
    */
  }

  private converterDtoParaTopico(dto: any, nivel: number = 0): Topico {
    const idConvertido = this.primeiroIdValido([
      dto?.topicoId,
      dto?.subtopicoId,
      dto?.idTopico,
      dto?.idSubtopico,
      dto?.id
    ]);

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
      statusRevisao: dto?.statusRevisao,
      statusCanonico: dto?.statusCanonico
    } as any;

    return topico;
  }

  // ==========================
  // DASHBOARD / SEMÃFORO
  // ==========================
  private carregarRevisoesDashboard(): void {
    this.salaEstudoService.limparCacheRevisoesDashboard();
    this.salaEstudoService.listarRevisoesDashboardUnificado({ page: 0, size: 5000 }).subscribe({
      next: (resp) => {
        const itens = resp?.itens || [];
        this.revisoesPorTopico.clear();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        (itens || []).forEach((item) => {
          if (!item.topicoId || !item.materiaId) return;

          const proxima: string | null =
            (item as any).proximaRevisao ||
            (item as any).dataProximaRevisao ||
            null;

          const status = extrairStatusCanonicoRevisao(item, hoje);

          const topicoId = Number(item.topicoId);
          const atual = this.revisoesPorTopico.get(topicoId);
          if (!atual) {
            this.revisoesPorTopico.set(topicoId, {
              status,
              proximaRevisao: proxima,
              materiaId: item.materiaId
            });
            return;
          }

          const pesoAtual = this.prioridadeStatus(atual.status);
          const pesoNovo = this.prioridadeStatus(status);

          if (pesoNovo > pesoAtual) {
            this.revisoesPorTopico.set(topicoId, {
              status,
              proximaRevisao: proxima ?? atual.proximaRevisao ?? null,
              materiaId: item.materiaId
            });
            return;
          }

          if (pesoNovo === pesoAtual) {
            const dataAtual = atual.proximaRevisao || null;
            const dataNova = proxima || null;
            const manterNova = !!dataNova && (!dataAtual || dataNova < dataAtual);
            if (manterNova) {
              this.revisoesPorTopico.set(topicoId, {
                status,
                proximaRevisao: dataNova,
                materiaId: item.materiaId
              });
            }
          }
        });
      },
      error: (err) => console.error('[DASHBOARD-REVISAO] Erro ao carregar revisÃµes:', err)
    });
  }

  private atualizarImagemEditalSelecionado(): void {
    this.removerImagemEditalSelecionado();
    const edital = this.editalSelecionado;
    if (!edital) return;
    if (this.definirImagemEditalPorBytes(edital)) return;

    const templateId = this.obterTemplateIdDoEdital(edital);
    if (!templateId) return;
    if (this.activeEditalImagemTemplateId === templateId && this.activeEditalImagemUrl) {
      return;
    }
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
          this.activeEditalImagemTemplateId = templateId;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.activeEditalImagemUrl = `data:${tipo};base64,${payload.dados}`;
            this.activeEditalImagemTemplateId = templateId;
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
    this.activeEditalImagemTemplateId = null;
  }

  listarDescendentes(topico: Topico): Topico[] {
    const out: Topico[] = [];
    const walk = (t: Topico) => {
      out.push(t);
      (t.filhos || []).forEach(walk);
    };
    (topico?.filhos || []).forEach(walk);
    return out;
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
    const st = this.getStatusRevisaoTopico(t);
    return {
      'rev-sem': st === 'SEM',
      'rev-futura': st === 'FUTURA',
      'rev-hoje': st === 'HOJE',
      'rev-atrasada': st === 'ATRASADA'
    };
  }

  private getStatusRevisaoMateria(m: Materia): StatusRevisao {
    if (!m?.id) return 'SEM';
    const resumo = this.getResumoMateriaLinha(m);
    if (resumo.atrasadas > 0) return 'ATRASADA';
    if (resumo.hoje > 0) return 'HOJE';
    if (resumo.emDia > 0) return 'FUTURA';
    return 'SEM';
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

    const statusCanonico = String((topico as any)?.statusCanonico || '').toUpperCase();
    if (statusCanonico === 'ATRASADA' || statusCanonico === 'HOJE' || statusCanonico === 'FUTURA' || statusCanonico === 'SEM') {
      return statusCanonico as StatusRevisao;
    }

    const statusDto = (topico as any)?.statusRevisao;
    if (statusDto === 'ATRASADA' || statusDto === 'HOJE' || statusDto === 'FUTURA' || statusDto === 'SEM') {
      return statusDto;
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
    const st = this.getStatusRevisaoTopico(t);
    return this.labelStatus(st);
  }

  private labelStatus(st: StatusRevisao): string {
    switch (st) {
      case 'ATRASADA': return 'Atrasada';
      case 'HOJE': return 'Vence hoje';
      case 'FUTURA': return 'Em dia';
      case 'SEM':
      default: return 'Sem revisÃ£o';
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

  // âœ… Filtra E ordena por urgÃªncia (aÃ§Ã£o)
  get materiasFiltradas(): Materia[] {
    const t = (this.termoBusca || '').trim().toLowerCase();
    const base = !t
      ? (this.materias || [])
      : (this.materias || []).filter(m => (m?.nome || '').toLowerCase().includes(t));

    const filtradas = this.materiasFiltradasPorEscopo
      ? base
      : base.filter((m) => this.materiaNoEscopo(m));

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
  // UI: SEÃ‡Ã•ES / SELEÃ‡ÃƒO
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
  // CONCLUSÃƒO local + overlay
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
          this.carregarTopicosFinalizados();
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
        this.carregarTopicosFinalizados();
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
        this.carregarTopicosFinalizados();
      },
      error: () => {
        this.mensagemErro = 'Nao foi possivel desfazer o finalizado.';
      }
    });
  }

  // ==========================
  // Contadores seÃ§Ã£o
  // ==========================
  getTotalSecao(secao: Topico): number {
    return this.folhasTopicos(secao?.filhos || []).length;
  }

  getConcluidasSecao(secao: Topico): number {
    const folhas = this.folhasTopicos(secao?.filhos || []);
    return folhas.filter((x: any) => x?.id && this.concluidosPorTopico.has(x.id)).length;
  }

  getPercentSecao(secao: Topico): number {
    const total = this.getTotalSecao(secao);
    if (!total) return 0;
    return Math.round((this.getConcluidasSecao(secao) / total) * 100);
  }

  // ==========================
  // % na lista (se vocÃª ativar)
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

    const topicosMateria = this.topicosPorMateria.get(materiaId) || [];
    if (topicosMateria.length) {
      const todos = this.listarTodosTopicos(topicosMateria);
      let total = 0;
      let concluidas = 0;
      let atrasadas = 0;
      let hoje = 0;
      let emDia = 0;

      todos.forEach((t) => {
        const id = (t as any)?.id;
        if (id && this.concluidosPorTopico.has(id)) concluidas++;
        total++;

        const st = this.getStatusRevisaoTopico(t);
        if (st === 'ATRASADA') atrasadas++;
        else if (st === 'HOJE') hoje++;
        else if (st === 'FUTURA') emDia++;
      });

      return { total, concluidas, atrasadas, hoje, emDia };
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
  // âœ… Resumo do expandir (mÃ©tricas no lugar certo)
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

  private listarTodosTopicos(lista: Topico[]): Topico[] {
    const out: Topico[] = [];
    const walk = (t: Topico) => {
      out.push(t);
      const filhos = t?.filhos || [];
      if (filhos.length) filhos.forEach(walk);
    };
    (lista || []).forEach(walk);
    return out;
  }

  private encontrarCaminhoParaTopico(alvos: Topico[], topicoId: number): Topico[] {
    const stack: Array<{ node: Topico; path: Topico[] }> = [];
    (alvos || []).forEach((n) => stack.push({ node: n, path: [n] }));
    while (stack.length) {
      const atual = stack.pop();
      if (!atual) continue;
      const id = this.getTopicoId(atual.node);
      if (id === topicoId) {
        return atual.path;
      }
      (atual.node.filhos || []).forEach((filho) => {
        stack.push({ node: filho, path: [...atual.path, filho] });
      });
    }
    return [];
  }

  private atualizarConclusaoPais(topico: Topico): void {
    const id = this.getTopicoId(topico);
    if (!id) return;

    const materiaId = this.materiaExpandida?.id || null;
    const roots = materiaId ? (this.topicosPorMateria.get(materiaId) || this.topicos) : this.topicos;
    if (!roots?.length) return;

    const caminho = this.encontrarCaminhoParaTopico(roots, id);
    if (!caminho.length) return;

    for (let i = caminho.length - 2; i >= 0; i -= 1) {
      const pai = caminho[i];
      const paiId = this.getTopicoId(pai);
      if (!paiId) continue;

      const folhas = this.folhasTopicos([pai]);
      const todasConcluidas = folhas.length > 0 &&
        folhas.every((f) => {
          const fid = this.getTopicoId(f);
          return !!fid && this.concluidosPorTopico.has(fid);
        });

      if (todasConcluidas && !this.concluidosPorTopico.has(paiId)) {
        this.concluidosPorTopico.add(paiId);
        this.concluidosPorTopico = new Set(this.concluidosPorTopico);
        this.atualizarResumoExpandida();
        this.topicosFinalizadosPendentes.set(paiId, true);
        this.salaEstudoService.finalizarTopico(paiId).subscribe({
          next: () => {
            this.topicosFinalizadosPendentes.delete(paiId);
            this.atualizarResumoExpandida();
          },
          error: () => {
            this.topicosFinalizadosPendentes.delete(paiId);
            this.concluidosPorTopico.delete(paiId);
          }
        });
      }

      if (!todasConcluidas && this.concluidosPorTopico.has(paiId)) {
        this.concluidosPorTopico.delete(paiId);
        this.concluidosPorTopico = new Set(this.concluidosPorTopico);
        this.atualizarResumoExpandida();
        this.topicosFinalizadosPendentes.set(paiId, false);
        this.salaEstudoService.desfinalizarTopico(paiId).subscribe({
          next: () => {
            this.topicosFinalizadosPendentes.delete(paiId);
            this.atualizarResumoExpandida();
          },
          error: () => {
            this.topicosFinalizadosPendentes.delete(paiId);
            this.concluidosPorTopico.add(paiId);
          }
        });
      }
    }
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

        // Mantém o estado otimista local para evitar "sumir" antes do back refletir.
        this.concluidosPorTopico.forEach((id) => concluido.add(id));

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
    return this.primeiroIdValido([topico?.id, topico?.topicoId]);
  }

  private primeiroIdValido(candidatos: Array<any>): number | null {
    for (const raw of candidatos) {
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) {
        return id;
      }
    }
    return null;
  }

  trackByTopicoId(index: number, topico: Topico): number {
    return this.getTopicoId(topico) ?? index;
  }
}

