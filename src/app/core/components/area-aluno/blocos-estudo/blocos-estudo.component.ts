import { Component, OnInit, OnDestroy, ViewChild, ViewChildren, QueryList, HostListener } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { OverlayPanel } from 'primeng/overlaypanel';
import { AutoComplete } from 'primeng/autocomplete';
import { SalaEstudoService } from '../services/sala-estudo.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';

import { BlocosEstudoService } from '../services/blocos-estudo.service';
import { MateriaService } from '../services/materia.service';
import { EditalService } from '../services/edital.service';
import { EditalTemplateService } from '../services/edital-template.service';

import { BlocoEstudoDTO, BlocoEstudoItemDTO } from '../../dto/blocos-estudo.dto';
import { Materia } from '../models/materia.model';
import { Edital } from '../models/Edital';

type MateriaOption = { label: string; value: number };
type MateriaLinhaInput = MateriaOption | string | null;

type BlocoItemForm = FormGroup<{
  id: FormControl<number | null>;
  materiaEstudoId: FormControl<number>;
  materiaNome: FormControl<string | null>;
  ordem: FormControl<number>;
  peso: FormControl<number | null>;
}>;

type BlocoForm = FormGroup<{
  minutosDisponiveis: FormControl<number>;
  itens: FormArray<BlocoItemForm>;
}>;

type ResumoEquilibrioSemanal = {
  tipo: 'EQUILIBRADA' | 'CONCENTRADA';
  materiaTopId?: number;
  percentualTop?: number;
};

@Component({
  selector: 'app-blocos-estudo',
  templateUrl: './blocos-estudo.component.html',
  styleUrls: ['./blocos-estudo.component.css']
})
export class BlocosEstudoComponent implements OnInit, OnDestroy {
  @ViewChild('copiaPanel') copiaPanel?: OverlayPanel;
  @ViewChildren('autoMateria') autoMateriaRefs?: QueryList<AutoComplete>;

  diasSemana: string[] = ['Segunda Feira', 'Terca Feira', 'Quarta Feira', 'Quinta Feira', 'Sexta Feira', 'Sabado', 'Domingo'];

  blocos: BlocoEstudoDTO[] = [];
  abaAtiva = 0;
  selectedDayIndex = 0;
  showWeekly = false;
  weeklyOrderedBlocos: Array<{ bloco: BlocoEstudoDTO; index: number }> = [];

  form!: BlocoForm;

  materiasOptions: MateriaOption[] = [];
  materiasMap = new Map<number, string>();
  materiasTodas: Materia[] = [];
  get temEditalAtivo(): boolean {
    return !!this.activeEditais.length;
  }
  materiasFiltradasPorBloco: MateriaOption[][] = [];
  materiaSelecionadaPorBloco: Array<MateriaOption | null> = [];
  materiaSelecionadaPorLinha: Array<Array<MateriaLinhaInput>> = [];
  linhasFixasPorBloco: Array<Array<{ item: BlocoEstudoItemDTO | null }>> = [];
  blocoHoraInputs: string[] = [];
  blocoHoraErrors: Array<string | null> = [];
  horasMateriaInputs: Record<string, string> = {};

  blocoCopiaOrigem: number | null = null;
  blocoCopiaDestino: number | null = null;
  substituicaoAtiva: { blocoIndex: number; itemIndex: number } | null = null;
  linhaEdicaoAtiva: { blocoIndex: number; linhaIndex: number } | null = null;
  revisaoStatusPorMateria = new Map<number, 'VENCIDA' | 'EM_DIA' | 'FUTURA'>();

  salvando = false;
  carregandoBlocos = false;
  carregandoMaterias = false;
  carregandoEditais = false;
  editais: Edital[] = [];
  activeEditais: Edital[] = [];
  editalAtivo: Edital | null = null;
  editalAtivoNome = 'Nenhum edital selecionado';
  editalFiltroSelecionadoId: number | null = null;
  materiasFiltroIds = new Set<number>();
  editalAtivoImagemUrl = '';
  private editalAtivoImagemObjectUrl: string | null = null;
  mensagemTexto = '';
  mensagemTipo: 'success' | 'error' | 'warn' | null = null;
  private mensagemTimeoutId: number | null = null;
  private tentativaAutoAtivarPadrao = false;
  private autopreenchimentoExecutado = false;
  private autopreenchimentoEmExecucao = false;
  private carregamentoInicialBlocosConcluido = false;
  private linhaAddEmProcesso = new Set<string>();
  private readonly pesoPadraoNovaMateriaMinutos = 60;
  private snapshotPlanejamentoSalvo = '';
  private snapshotPlanejamentoInicializado = false;
  private autoSaveTimerId: ReturnType<typeof setTimeout> | null = null;
  private autoSaveEmExecucao = false;
  private autoSavePendente = false;
  private readonly autoSaveDelayMs = 700;

  constructor(
    private fb: FormBuilder,
    private blocosService: BlocosEstudoService,
    private materiaService: MateriaService,
    private editalService: EditalService,
    private editalTemplateService: EditalTemplateService,
    private salaEstudoService: SalaEstudoService
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      minutosDisponiveis: this.fb.control(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      itens: this.fb.array<BlocoItemForm>([])
    });

    this.blocos = this.criarBlocosPadrao();
    this.selectedDayIndex = this.getDiaAtualIndex();
    this.abaAtiva = this.selectedDayIndex;
    this.montarForm(this.blocos[this.abaAtiva]);
    this.atualizarOrdemSemanal();
    this.sincronizarInputsPorBloco();
    this.inicializarLinhasFixas();

    this.carregarEditais();
    this.carregarMaterias();
    this.carregarBlocos();
    this.carregarRevisoesDashboard();
  }

  ngOnDestroy(): void {
    this.limparImagemEditalAtivo();
    if (this.autoSaveTimerId != null) {
      window.clearTimeout(this.autoSaveTimerId);
      this.autoSaveTimerId = null;
    }
    if (this.mensagemTimeoutId != null) {
      window.clearTimeout(this.mensagemTimeoutId);
      this.mensagemTimeoutId = null;
    }
  }

  get itensFormArray(): FormArray<BlocoItemForm> {
    return this.form.controls.itens;
  }

  getDiaAtualIndex(): number {
    const hoje = new Date();
    const dia = hoje.getDay(); // 0=Domingo ... 6=Sabado
    return dia === 0 ? 6 : dia - 1;
  }

  getCarouselOffsetPercent(): number {
    const total = this.blocos.length || 1;
    const idx = Math.max(0, Math.min(total - 1, this.selectedDayIndex));
    return idx * (100 / total);
  }

  getModuloLabel(index: number): string {
    const modulo = ((index + 1) % 7) + 1;
    return `Modulo ${modulo}`;
  }

  getNomeDiaSemana(index: number): string {
    return this.diasSemana[index] || `Dia ${index + 1}`;
  }

  getNomeDiaSemanaSemFeira(index: number): string {
    const nome = this.getNomeDiaSemana(index);
    return nome.replace(/\s*Feira$/i, '').trim();
  }

  getCardBgColor(index: number): string {
    const cores = [
      'rgba(191, 230, 220, 0.3)',
      'rgba(185, 215, 242, 0.3)',
      'rgba(208, 193, 242, 0.3)',
      'rgba(242, 201, 166, 0.3)',
      'rgba(203, 230, 168, 0.3)',
      'rgba(184, 226, 238, 0.3)',
      'rgba(242, 180, 199, 0.3)'
    ];
    const idx = Math.abs(index) % cores.length;
    return cores[idx];
  }

  getBlocosOrdenadosSemana(): Array<{ bloco: BlocoEstudoDTO; index: number }> {
    return this.weeklyOrderedBlocos;
  }

  private atualizarOrdemSemanal(): void {
    this.weeklyOrderedBlocos = this.blocos
      .map((bloco, index) => ({ bloco, index }))
      .sort((a, b) => {
        const aIsDomingo = a.index === 6 ? 1 : 0;
        const bIsDomingo = b.index === 6 ? 1 : 0;
        if (aIsDomingo !== bIsDomingo) return bIsDomingo - aIsDomingo;
        return a.index - b.index;
      });
  }

  navegarDia(delta: number): void {
    if (!this.blocos.length) return;
    const total = this.blocos.length;
    const atual = Math.max(0, Math.min(total - 1, this.selectedDayIndex));
    const novo = (atual + delta + total) % total;
    this.selectedDayIndex = novo;
    this.abaAtiva = novo;
    this.montarForm(this.blocos[novo]);
  }

  toggleWeeklyView(): void {
    this.showWeekly = !this.showWeekly;
  }

  abrirDiaNoModoHoje(index: number): void {
    this.showWeekly = false;
    this.selecionarBloco(index);
  }

  get salvarDisabled(): boolean {
    return this.salvando || this.temBlocosInvalidos || !this.temBlocoPreenchido;
  }

  get hasPendenciasSalvar(): boolean {
    if (!this.snapshotPlanejamentoInicializado) return false;
    return this.snapshotPlanejamentoSalvo !== this.gerarSnapshotPlanejamentoAtual();
  }

  get temBlocosInvalidos(): boolean {
    return this.blocosInvalidos.length > 0;
  }

  get temBlocoPreenchido(): boolean {
    return this.blocos.some((bloco) => {
      const minutos = bloco.minutosDisponiveis ?? 0;
      const itens = bloco.itens || [];
      return minutos > 0 || itens.length > 0;
    });
  }

  get blocosInvalidos(): Array<{ index: number; numero: number; mensagem: string }> {
    return this.blocos
      .map((bloco, index) => {
        const mensagem = this.blocoErroMensagem(index);
        if (!mensagem) return null;
        return { index, numero: bloco.numero, mensagem };
      })
      .filter((item): item is { index: number; numero: number; mensagem: string } => item != null);
  }

  get totalCicloMinutos(): number {
    return this.blocos.reduce((total, bloco) => total + (bloco.minutosDisponiveis ?? 0), 0);
  }

  get totalCicloTexto(): string {
    return this.minutosParaTexto(this.totalCicloMinutos);
  }

  get isDistribuicaoSemanalConcentrada(): boolean {
    return this.getResumoEquilibrioSemanal().tipo === 'CONCENTRADA';
  }

  get diasPlanejados(): number {
    return (this.blocos || []).filter((bloco) => this.isBlocoPlanejado(bloco)).length;
  }

  get mediaDiariaTexto(): string {
    const dias = this.diasPlanejados;
    if (!dias) return '0 min';
    return this.minutosParaTexto(Math.round(this.totalCicloMinutos / dias));
  }

  get materiasPlanejadasSemana(): number {
    return (this.blocos || []).reduce((acc, bloco) => acc + this.obterItensOrdenados(bloco).length, 0);
  }

  get minutosDistribuidos(): number[] {
    return this.calcularDistribuicaoMinutos();
  }

  get linhasPorBloco(): number {
    return 10;
  }

  get backlogCount(): number {
    if (!this.materiasOptions.length) return 0;
    const usados = new Set<number>();
    this.blocos.forEach((bloco) => {
      (bloco.itens || []).forEach((item) => {
        if (item.materiaEstudoId != null) usados.add(item.materiaEstudoId);
      });
    });
    return Math.max(0, this.materiasOptions.length - usados.size);
  }

  carregarMaterias(): void {
    this.carregandoMaterias = true;

    this.materiaService.listarMaterias()
      .pipe(finalize(() => (this.carregandoMaterias = false)))
      .subscribe({
        next: (materias: Materia[]) => {
          this.materiasTodas = materias || [];
          const materiasComId = this.materiasTodas.filter(
            (m): m is Materia & { id: number } => m.id != null
          );

          this.materiasMap = new Map(materiasComId.map(m => [m.id, m.nome]));
          this.atualizarMateriasOptions();
        },
        error: () => {
          this.setMensagem('error', 'Falha ao carregar materias.');
        }
      });
  }

  carregarEditais(): void {
    this.carregandoEditais = true;

    this.editalService.listar()
      .subscribe({
        next: (lista) => {
          this.editais = lista || [];
          if (!this.tentativaAutoAtivarPadrao) {
            this.editalService.garantirEditalPadraoAtivo(this.editais).subscribe({
              next: (ativouPadrao) => {
                if (!ativouPadrao) {
                  return;
                }
                this.tentativaAutoAtivarPadrao = true;
                this.carregarEditais();
              },
              error: () => {}
            });
          }
          this.recalcularContextoEditaisAtivos();

          const editaisSemMaterias = (this.editais || []).filter(
            (e) => !this.editalTemMateriasCarregadas(e) && Number((e as any)?.id) > 0
          );
          if (!editaisSemMaterias.length) {
            this.carregandoEditais = false;
            return;
          }

          const requests = editaisSemMaterias.map((e) =>
            this.editalService.buscarPorId(Number((e as any).id))
          );

          forkJoin(requests)
            .pipe(finalize(() => (this.carregandoEditais = false)))
            .subscribe({
              next: (detalhes) => {
                const detalhesPorId = new Map<number, Edital>();
                (detalhes || []).forEach((detalhe) => {
                  const id = Number((detalhe as any)?.id);
                  if (Number.isFinite(id) && id > 0) {
                    detalhesPorId.set(id, detalhe);
                  }
                });

                this.editais = (this.editais || []).map((edital) => {
                  const id = Number((edital as any)?.id);
                  const detalhe = detalhesPorId.get(id);
                  return detalhe ? { ...edital, materias: detalhe.materias || [] } : edital;
                });

                this.recalcularContextoEditaisAtivos();
              },
              error: () => {
                this.recalcularContextoEditaisAtivos();
              }
            });
        },
        error: () => {
          this.activeEditais = [];
          this.editalAtivo = null;
          this.editalAtivoNome = 'Nenhum edital selecionado';
          this.editalFiltroSelecionadoId = null;
          this.materiasFiltroIds = new Set<number>();
          this.limparImagemEditalAtivo();
          this.atualizarMateriasOptions();
          this.carregandoEditais = false;
        }
      });
  }

  isDiaPlanejado(index: number): boolean {
    const bloco = this.blocos[index];
    if (!bloco) return false;
    return this.isBlocoPlanejado(bloco);
  }

  resumoDia(index: number): string {
    const bloco = this.blocos[index];
    if (!bloco) return 'Sem plano';
    const materias = this.obterItensOrdenados(bloco).length;
    const minutos = bloco.minutosDisponiveis ?? 0;
    if (!materias && !minutos) return 'Sem plano';
    if (!materias) return `${this.minutosParaTexto(minutos)}`;
    return `${materias} mat - ${this.minutosParaTexto(minutos)}`;
  }

  resumoDiaMini(index: number): string {
    const bloco = this.blocos[index];
    if (!bloco) return 'Sem plano';
    const materias = this.obterItensOrdenados(bloco).length;
    const minutos = bloco.minutosDisponiveis ?? 0;
    if (!materias && !minutos) return 'Sem plano';
    if (!materias) return this.minutosParaTexto(minutos);
    return `${materias} mat`;
  }

  getDiaCurto(index: number): string {
    const nomes = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
    return nomes[index] || this.getNomeDiaSemanaSemFeira(index).slice(0, 3);
  }

  irParaHoje(): void {
    this.showWeekly = false;
    this.selecionarBloco(this.getDiaAtualIndex());
  }

  getTotalMateriasBloco(index: number): number {
    const bloco = this.blocos[index];
    if (!bloco) return 0;
    return this.obterItensOrdenados(bloco).length;
  }

  private recalcularContextoEditaisAtivos(): void {
    this.activeEditais = (this.editais || []).filter((e) => e?.ativo);
    this.editalAtivo = this.activeEditais[0] || null;
    const nomes = this.activeEditais.map((e) => e.nome).filter(Boolean);
    this.editalAtivoNome = nomes.length ? nomes.join(' / ') : 'Nenhum edital selecionado';
    this.sincronizarFiltroEditalSelecionado();
    this.atualizarFiltroMateriasPorEditalSelecionado();
    this.carregarImagemEditalAtivo();
    this.atualizarMateriasOptions();
    this.tentarAutoPreencherPlanejamentoInicial();
  }

  onFiltroEditalChange(): void {
    this.atualizarFiltroMateriasPorEditalSelecionado();
    this.atualizarMateriasOptions();
  }

  private editalTemMateriasCarregadas(edital: Edital): boolean {
    return (edital?.materias || []).length > 0;
  }

  private extrairMateriaIdsDeEditais(editais: Edital[]): Set<number> {
    const ids = new Set<number>();
    (editais || []).forEach((edital) => {
      (edital?.materias || []).forEach((materia: any) => {
        if (materia?.ativo === false) return;
        const rawId =
          materia?.materiaId ??
          materia?.idMateria ??
          materia?.materia?.id ??
          materia?.id;
        const materiaId = Number(rawId);
        if (Number.isFinite(materiaId) && materiaId > 0) {
          ids.add(materiaId);
        }
      });
    });
    return ids;
  }

  private carregarImagemEditalAtivo(): void {
    this.limparImagemEditalAtivo();
    if (!this.editalAtivo?.id) return;
    if (this.definirImagemEditalAtivoPorBytes(this.editalAtivo)) {
      return;
    }
    const templateId = this.obterTemplateIdDoEdital(this.editalAtivo);
    if (!templateId) return;
    this.editalTemplateService.buscarImagemArquivo(templateId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        if (!blob) return;

        if (contentType.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(blob);
          this.editalAtivoImagemObjectUrl = objectUrl;
          this.editalAtivoImagemUrl = objectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) return;
            const tipo = this.normalizarContentType(payload.contentType);
            this.editalAtivoImagemUrl = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.editalAtivoImagemUrl = '';
          });
      },
      error: () => {
        this.editalAtivoImagemUrl = '';
      }
    });
  }

  private limparImagemEditalAtivo(): void {
    if (this.editalAtivoImagemObjectUrl) {
      URL.revokeObjectURL(this.editalAtivoImagemObjectUrl);
      this.editalAtivoImagemObjectUrl = null;
    }
    this.editalAtivoImagemUrl = '';
  }

  private definirImagemEditalAtivoPorBytes(edital: Edital): boolean {
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
      this.editalAtivoImagemUrl = base64;
      return true;
    }

    const contentType = this.inferirContentTypeImagem(anyEdital?.imagem);
    this.editalAtivoImagemUrl = `data:${contentType};base64,${base64}`;
    return true;
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

  private inferirContentTypeImagem(caminho?: string | null): string {
    const nome = (caminho || '').toLowerCase();
    if (nome.endsWith('.png')) return 'image/png';
    if (nome.endsWith('.jpg') || nome.endsWith('.jpeg')) return 'image/jpeg';
    if (nome.endsWith('.webp')) return 'image/webp';
    if (nome.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
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

  getEditalCargo(edital?: Edital | null): string {
    const cargo = (edital as any)?.cargo || (edital as any)?.nomeCargo || '';
    return String(cargo || '').trim();
  }

  getSiglaEdital(nome?: string | null): string {
    const texto = String(nome || '').trim();
    if (!texto) {
      return '-';
    }
    const ignorar = new Set([
      'de', 'da', 'do', 'das', 'dos',
      'e', 'em', 'no', 'na', 'nos', 'nas',
      'por', 'para', 'ao', 'a', 'o'
    ]);
    const partes = texto
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const sigla = partes
      .filter((p) => !ignorar.has(p.toLowerCase()))
      .map((p) => p[0])
      .join('');
    if (sigla) {
      return sigla.toUpperCase();
    }
    return texto[0].toUpperCase();
  }

  private atualizarMateriasOptions(): void {
    const materiasComId = this.materiasTodas.filter(
      (m): m is Materia & { id: number } => m.id != null
    );
    const aplicarFiltro = this.editalFiltroSelecionadoId != null;
    this.materiasOptions = materiasComId
      .filter((m) => !aplicarFiltro || this.materiasFiltroIds.has(m.id))
      .map(m => ({ label: m.nome, value: m.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    this.tentarAutoPreencherPlanejamentoInicial();
  }

  private sincronizarFiltroEditalSelecionado(): void {
    const editalId = Number(this.editalFiltroSelecionadoId || 0);
    const existeNoCatalogo = (this.editais || []).some((e) => Number((e as any)?.id || 0) === editalId);
    if (existeNoCatalogo) return;
    // Nao aplica filtro por edital automaticamente no planner.
    // A lista de materias deve abrir completa e so ser restringida
    // quando o usuario escolher um edital explicitamente.
    this.editalFiltroSelecionadoId = null;
  }

  private atualizarFiltroMateriasPorEditalSelecionado(): void {
    const editalId = Number(this.editalFiltroSelecionadoId || 0);
    if (!editalId) {
      this.materiasFiltroIds = new Set<number>();
      return;
    }
    const editalSelecionado = (this.editais || []).find((e) => Number((e as any)?.id || 0) === editalId) || null;
    this.materiasFiltroIds = this.extrairMateriaIdsDeEditais(editalSelecionado ? [editalSelecionado] : []);
  }

  carregarBlocos(): void {
    this.carregandoBlocos = true;

    this.blocosService.listarBlocos()
      .pipe(finalize(() => (this.carregandoBlocos = false)))
      .subscribe({
        next: (blocos) => {
          const lista = (blocos || []).slice().sort((a, b) => a.numero - b.numero);

          if (lista.length === 0) {
            this.blocos = this.criarBlocosPadrao();
            this.selectedDayIndex = this.getDiaAtualIndex();
            this.abaAtiva = this.selectedDayIndex;
            this.montarForm(this.blocos[this.abaAtiva]);
          this.sincronizarInputsPorBloco();
          this.inicializarLinhasFixas();
          this.atualizarOrdemSemanal();
          this.setMensagem('warn', 'Nenhum bloco veio do backend. Exibindo 7 blocos padrao.');
          this.carregamentoInicialBlocosConcluido = true;
          this.tentarAutoPreencherPlanejamentoInicial();
          this.atualizarSnapshotPlanejamentoSalvo();
          return;
        }

          this.blocos = lista;
          this.selectedDayIndex = Math.min(this.getDiaAtualIndex(), this.blocos.length - 1);
          this.abaAtiva = this.selectedDayIndex;
          this.montarForm(this.blocos[this.abaAtiva]);
          this.sincronizarInputsPorBloco();
          this.inicializarLinhasFixas();
          this.atualizarOrdemSemanal();
          this.carregamentoInicialBlocosConcluido = true;
          this.tentarAutoPreencherPlanejamentoInicial();
          this.atualizarSnapshotPlanejamentoSalvo();
        },
        error: () => {
          this.blocos = this.criarBlocosPadrao();
          this.selectedDayIndex = this.getDiaAtualIndex();
          this.abaAtiva = this.selectedDayIndex;
          this.montarForm(this.blocos[this.abaAtiva]);
          this.sincronizarInputsPorBloco();
          this.inicializarLinhasFixas();
          this.atualizarOrdemSemanal();
          this.setMensagem('error', 'Falha ao carregar blocos. Mostrando blocos padrao.');
          this.carregamentoInicialBlocosConcluido = true;
          this.tentarAutoPreencherPlanejamentoInicial();
          this.atualizarSnapshotPlanejamentoSalvo();
        }
      });
  }

  private isBlocoPlanejado(bloco: BlocoEstudoDTO): boolean {
    const minutos = bloco?.minutosDisponiveis ?? 0;
    const materias = this.obterItensOrdenados(bloco).length;
    return minutos > 0 || materias > 0;
  }

  carregarRevisoesDashboard(): void {
    this.salaEstudoService.listarRevisoesDashboard()
      .subscribe({
        next: (itens: RevisaoDashboardItem[]) => {
          const mapa = new Map<number, 'VENCIDA' | 'EM_DIA' | 'FUTURA'>();
          (itens || []).forEach((item) => {
            const atual = mapa.get(item.materiaId);
            mapa.set(item.materiaId, this.priorizarStatusRevisao(atual, item.status));
          });
          this.revisaoStatusPorMateria = mapa;
        },
        error: () => {
          this.revisaoStatusPorMateria = new Map();
        }
      });
  }

  private criarBlocosPadrao(): BlocoEstudoDTO[] {
    return Array.from({ length: 7 }, (_, i) => ({
      id: 0,
      numero: i + 1,
      minutosDisponiveis: 0,
      ativo: true,
      itens: []
    } as BlocoEstudoDTO));
  }

  montarForm(bloco: BlocoEstudoDTO): void {
    this.inicializarPesosBloco(bloco);
    this.form = this.fb.group({
      minutosDisponiveis: this.fb.control(bloco.minutosDisponiveis ?? 0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)]
      }),
      itens: this.fb.array<BlocoItemForm>([])
    });

    const itensOrdenados = this.obterItensOrdenados(bloco);
    itensOrdenados.forEach((item) => this.itensFormArray.push(this.criarItemForm(item)));

    this.recalcularOrdem();
    this.form.markAsPristine();
  }

  criarItemForm(item: Partial<BlocoEstudoItemDTO> & { materiaEstudoId: number }): BlocoItemForm {
    return this.fb.group({
      id: this.fb.control<number | null>(item.id ?? null),
      materiaEstudoId: this.fb.control<number>(item.materiaEstudoId, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      materiaNome: this.fb.control<string | null>(item.materiaNome ?? null),
      ordem: this.fb.control<number>(item.ordem ?? 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)]
      }),
      peso: this.fb.control<number | null>(item.peso ?? null)
    });
  }

  selecionarBloco(index: number): void {
    this.abaAtiva = index;
    this.selectedDayIndex = index;
    const bloco = this.blocos[this.abaAtiva];
    if (bloco) this.montarForm(bloco);
  }

  onHorasChange(bloco: BlocoEstudoDTO, valor: string, index: number): void {
    this.blocoHoraInputs[index] = valor;
    const resultado = this.parseHora(valor);
    if (resultado.erro) {
      this.blocoHoraErrors[index] = resultado.erro;
      return;
    }
    if (resultado.minutos == null) {
      this.blocoHoraErrors[index] = null;
      return;
    }

    const minutos = resultado.minutos ?? 0;
    this.blocoHoraErrors[index] = null;
    bloco.minutosDisponiveis = minutos;

    if (index === this.abaAtiva) {
      this.form.controls.minutosDisponiveis.setValue(minutos);
      this.form.markAsDirty();
    }
  }

  onHorasBlur(bloco: BlocoEstudoDTO, index: number): void {
    const valorAtual = this.blocoHoraInputs[index];
    const resultado = this.parseHora(valorAtual);
    if (resultado.erro || resultado.minutos == null) {
      this.blocoHoraInputs[index] = this.formatMinutosParaHora(bloco.minutosDisponiveis ?? 0);
      this.blocoHoraErrors[index] = null;
      return;
    }
    const minutos = resultado.minutos ?? 0;
    this.blocoHoraInputs[index] = this.formatMinutosParaHora(minutos);
    this.blocoHoraErrors[index] = null;
    bloco.minutosDisponiveis = minutos;
    if (index === this.abaAtiva) {
      this.form.controls.minutosDisponiveis.setValue(minutos);
      this.form.markAsDirty();
    }
    this.solicitarAutoSave();
  }

  formatMinutosParaHora(minutos: number): string {
    const total = Math.max(0, Math.min(this.maxMinutos, Number(minutos) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${this.pad2(h)}:${this.pad2(m)}`;
  }

  private parseHora(valor: string): { minutos: number | null; erro: string | null } {
    const raw = String(valor || '').trim();
    if (!raw || raw.includes('_')) {
      return { minutos: null, erro: null };
    }
    if (/^\d{1,2}$/.test(raw)) {
      const h = Number(raw);
      if (!Number.isInteger(h) || h < 0 || h > 99) {
        return { minutos: null, erro: 'Informe de 00:00 a 99:59.' };
      }
      return { minutos: h * 60, erro: null };
    }
    if (/^\d{1,2}:\d{0,1}$/.test(raw)) {
      return { minutos: null, erro: null };
    }

    let hStr = '';
    let mStr = '';
    if (/^\d{1,2}:\d{1,2}$/.test(raw)) {
      [hStr, mStr] = raw.split(':');
    } else if (/^\d{3,4}$/.test(raw)) {
      hStr = raw.slice(0, -2);
      mStr = raw.slice(-2);
    } else {
      return { minutos: null, erro: 'Formato invalido. Use HH:MM.' };
    }

    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 99 || m < 0 || m > 59) {
      return { minutos: null, erro: 'Informe de 00:00 a 99:59.' };
    }
    return { minutos: h * 60 + m, erro: null };
  }

  private pad2(v: number): string {
    return String(v).padStart(2, '0');
  }

  private get maxMinutos(): number {
    return 99 * 60 + 59;
  }

  removerItem(index: number): void {
    this.itensFormArray.removeAt(index);
    this.recalcularOrdem();
    this.form.markAsDirty();
    this.atualizarBlocoAtualComForm();
  }

  onRowReorder(event: any): void {
    const dragIndex = event?.dragIndex;
    const dropIndex = event?.dropIndex;

    if (dragIndex == null || dropIndex == null || dragIndex === dropIndex) {
      this.recalcularOrdem();
      return;
    }

    const ctrl = this.itensFormArray.at(dragIndex);
    this.itensFormArray.removeAt(dragIndex);
    this.itensFormArray.insert(dropIndex, ctrl);

    this.recalcularOrdem();
    this.form.markAsDirty();
    this.atualizarBlocoAtualComForm();
  }

  recalcularOrdem(): void {
    this.itensFormArray.controls.forEach((ctrl, idx) => {
      ctrl.controls.ordem.setValue(idx + 1);
    });
  }

  salvar(): void {
    if (!this.sincronizarHorasMateriaNoBloco(this.abaAtiva)) {
      return;
    }
    this.atualizarBlocoAtualComForm();
    const erroBlocoAtual = this.blocoErroMensagem(this.abaAtiva);
    if (erroBlocoAtual) {
      this.setMensagem('warn', erroBlocoAtual);
      return;
    }

    const blocoNumero = this.blocos[this.abaAtiva]?.numero ?? (this.abaAtiva + 1);

    const minutosDisponiveis = this.form.controls.minutosDisponiveis.value ?? 0;
    const itensPayload = this.itensFormArray.controls.map((ctrl, idx) => ({
      materiaEstudoId: ctrl.controls.materiaEstudoId.value,
      ordem: idx + 1,
      peso: ctrl.controls.peso.value ?? undefined
    }));

    const payload = { minutosDisponiveis, itens: itensPayload };

    this.salvando = true;

    this.blocosService.atualizarBloco(blocoNumero, payload)
      .pipe(finalize(() => (this.salvando = false)))
      .subscribe({
        next: (blocoAtualizado) => {
          const idx = this.blocos.findIndex(b => b.numero === blocoNumero);
          if (idx >= 0) this.blocos[idx] = blocoAtualizado;

          this.montarForm(blocoAtualizado);
          this.atualizarSnapshotPlanejamentoSalvo();
          this.setMensagem('success', `Bloco ${blocoNumero} salvo.`);
        },
        error: (err) => {
          if (err?.error instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              const texto = String(reader.result || '');
              let detalhe = '';
              try {
                const parsed = JSON.parse(texto);
                detalhe = parsed?.message || parsed?.error || parsed?.erro || '';
              } catch {
                detalhe = texto;
              }
              this.setMensagem('error', detalhe || 'Falha ao salvar.');
            };
            reader.onerror = () => {
              this.setMensagem('error', 'Falha ao salvar.');
            };
            reader.readAsText(err.error);
            return;
          }

          const detalhe = this.extrairMensagemErro(err) || 'Falha ao salvar.';
          this.setMensagem('error', detalhe);
        }
      });
  }

  salvarTodos(): void {
    this.persistirTodos(false);
  }

  private persistirTodos(autoSave: boolean): void {
    if (this.salvando || this.autoSaveEmExecucao) {
      if (autoSave) this.autoSavePendente = true;
      return;
    }

    for (let i = 0; i < this.blocos.length; i += 1) {
      if (!this.sincronizarHorasMateriaNoBloco(i)) {
        return;
      }
    }

    if (this.temBlocosInvalidos) {
      if (!autoSave) {
        this.setMensagem('warn', 'Ajuste os blocos antes de salvar.');
      }
      return;
    }

    this.atualizarBlocoAtualComForm();
    if (autoSave && !this.hasPendenciasSalvar) return;

    const blocosParaSalvar = this.blocos.filter((bloco) => {
      const minutos = Number(bloco.minutosDisponiveis || 0);
      const itens = this.obterItensOrdenados(bloco);
      return minutos > 0 || itens.length > 0;
    });

    if (!blocosParaSalvar.length) {
      this.atualizarSnapshotPlanejamentoSalvo();
      return;
    }

    const requests = blocosParaSalvar.map((bloco) => {
      const itens = this.obterItensOrdenados(bloco);
      const itensPayload = itens.map((it, idx) => ({
        materiaEstudoId: it.materiaEstudoId,
        ordem: idx + 1,
        peso: it.peso ?? undefined
      }));

      return this.blocosService.atualizarBloco(bloco.numero, {
        minutosDisponiveis: bloco.minutosDisponiveis ?? 0,
        itens: itensPayload
      });
    });

    this.salvando = true;
    this.autoSaveEmExecucao = true;

    forkJoin(requests)
      .pipe(finalize(() => {
        this.salvando = false;
        this.autoSaveEmExecucao = false;
        if (this.autoSavePendente) {
          this.autoSavePendente = false;
          this.solicitarAutoSave(true);
        }
      }))
      .subscribe({
        next: (blocosAtualizados) => {
          blocosAtualizados.forEach((blocoAtualizado) => {
            const idx = this.blocos.findIndex(b => b.numero === blocoAtualizado.numero);
            if (idx >= 0) this.blocos[idx] = blocoAtualizado;
          });

          const blocoAtivo = this.blocos[this.abaAtiva];
          if (blocoAtivo) this.montarForm(blocoAtivo);

          this.atualizarSnapshotPlanejamentoSalvo();
          if (!autoSave) {
            this.setMensagem('success', 'Blocos salvos.');
          }
        },
        error: (err) => {
          const detalhe = this.extrairMensagemErro(err) || 'Falha ao salvar blocos.';
          this.setMensagem('error', detalhe);
        }
      });
  }

  nomeMateria(id: number): string {
    return this.materiasMap.get(id) || `Materia #${id}`;
  }

  getTotalMinutosItens(blocoIndex: number): number {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return 0;
    return this.obterItensOrdenados(bloco).reduce((total, item) => {
      const peso = Number(item?.peso ?? 0);
      if (peso <= 0) return total;
      return total + peso;
    }, 0);
  }

  getPercentualItemNoDia(blocoIndex: number, item: BlocoEstudoItemDTO | null | undefined): number {
    if (!item) return 0;
    const peso = Number(item?.peso ?? 0);
    if (peso <= 0) return 0;
    const total = this.getTotalMinutosItens(blocoIndex);
    if (total <= 0) return 0;
    return Math.round((peso / total) * 100);
  }

  getBarWidthPercent(blocoIndex: number, item: BlocoEstudoItemDTO | null | undefined): string {
    return `${this.getPercentualItemNoDia(blocoIndex, item)}%`;
  }

  getTextoItem(blocoIndex: number, item: BlocoEstudoItemDTO | null | undefined): string {
    if (!item) return '';
    const nome = item.materiaNome || this.nomeMateria(item.materiaEstudoId);
    const peso = Math.max(0, Number(item?.peso ?? 0) || 0);
    const percentual = this.getPercentualItemNoDia(blocoIndex, item);
    return `${nome} - ${this.formatMinutosParaHora(peso)} (${percentual}%)`;
  }

  getDistribuicaoSemanalPorMateria(): Map<number, number> {
    const distribuicao = new Map<number, number>();
    (this.blocos || []).forEach((bloco) => {
      this.obterItensOrdenados(bloco).forEach((item) => {
        const materiaId = Number(item?.materiaEstudoId);
        const peso = Number(item?.peso ?? 0);
        if (!Number.isFinite(materiaId) || materiaId <= 0 || peso <= 0) return;
        distribuicao.set(materiaId, (distribuicao.get(materiaId) || 0) + peso);
      });
    });
    return distribuicao;
  }

  getResumoEquilibrioSemanal(): ResumoEquilibrioSemanal {
    const distribuicao = this.getDistribuicaoSemanalPorMateria();
    if (!distribuicao.size) {
      return { tipo: 'EQUILIBRADA' };
    }

    let totalMinutos = 0;
    let materiaTopId: number | undefined;
    let maiorCarga = 0;

    distribuicao.forEach((minutos, materiaId) => {
      totalMinutos += minutos;
      if (minutos > maiorCarga) {
        maiorCarga = minutos;
        materiaTopId = materiaId;
      }
    });

    if (totalMinutos <= 0 || !materiaTopId) {
      return { tipo: 'EQUILIBRADA' };
    }

    const percentualTop = maiorCarga / totalMinutos;
    if (percentualTop >= 0.55) {
      return { tipo: 'CONCENTRADA', materiaTopId, percentualTop };
    }

    return { tipo: 'EQUILIBRADA', materiaTopId, percentualTop };
  }

  getTextoEquilibrioSemanal(): string {
    const resumo = this.getResumoEquilibrioSemanal();
    if (resumo.tipo === 'EQUILIBRADA') {
      return 'Distribuicao equilibrada';
    }

    const percentual = Math.round((resumo.percentualTop ?? 0) * 100);
    const nome = this.nomeMateria(resumo.materiaTopId ?? 0);
    return `Distribuicao concentrada em ${nome} (${percentual}%)`;
  }

  minutosParaTexto(minutos?: number | null): string {
    const m = Math.max(0, minutos ?? 0);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${r} min`;
    if (r === 0) return `${h}h`;
    return `${h}h ${r}min`;
  }

  private extrairMensagemErro(err: any): string {
    const payload = err?.error;
    if (!payload) return err?.message || '';
    if (typeof payload === 'string') return payload;
    return payload?.message || payload?.error || payload?.erro || payload?.mensagem || '';
  }

  private calcularDistribuicaoMinutos(): number[] {
    const total = this.form?.controls?.minutosDisponiveis?.value ?? 0;
    const itens = this.itensFormArray?.controls || [];
    if (!itens.length) return [];
    if (total <= 0) return itens.map(() => 0);

    const count = itens.length;
    const base = Math.floor(total / count);
    let restante = total - base * count;
    const distribuido = Array.from({ length: count }, () => base);

    for (let i = 0; i < restante; i += 1) {
      distribuido[i % count] += 1;
    }

    return distribuido;
  }

  private setMensagem(tipo: 'success' | 'error' | 'warn', texto: string): void {
    this.mensagemTipo = tipo;
    this.mensagemTexto = texto;
    if (this.mensagemTimeoutId != null) {
      window.clearTimeout(this.mensagemTimeoutId);
    }
    this.mensagemTimeoutId = window.setTimeout(() => {
      this.mensagemTipo = null;
      this.mensagemTexto = '';
      this.mensagemTimeoutId = null;
    }, 5000);
  }

  obterItensOrdenados(bloco: BlocoEstudoDTO): BlocoEstudoItemDTO[] {
    return [...(bloco.itens || [])].sort((a, b) => a.ordem - b.ordem);
  }

  private atualizarBlocoAtualComForm(): void {
    const bloco = this.blocos[this.abaAtiva];
    if (!bloco) return;
    const itensAtuaisOrdenados = this.obterItensOrdenados(bloco);
    bloco.minutosDisponiveis = this.form.controls.minutosDisponiveis.value ?? 0;
    bloco.itens = this.itensFormArray.controls.map((ctrl, idx) => ({
      id: ctrl.controls.id.value ?? undefined,
      materiaEstudoId: ctrl.controls.materiaEstudoId.value,
      materiaNome: ctrl.controls.materiaNome.value ?? this.nomeMateria(ctrl.controls.materiaEstudoId.value),
      ordem: idx + 1,
      peso: ctrl.controls.peso.value ?? itensAtuaisOrdenados[idx]?.peso ?? undefined
    }));
  }

  focoNoBlocoInvalido(index: number): void {
    const bloco = this.blocos[index];
    if (!bloco) return;
    this.selecionarBloco(index);
    const input = document.getElementById(`minutos-${bloco.numero}`) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }

  blocoErroMensagem(index: number): string {
    const erroFormato = this.blocoHoraErrors[index];
    if (erroFormato) return erroFormato;
    const bloco = this.blocos[index];
    if (!bloco) return '';
    const minutos = bloco.minutosDisponiveis ?? 0;
    const itens = this.obterItensOrdenados(bloco);
    const itensSelecionados = itens.filter((item) => Number(item?.materiaEstudoId) > 0);
    const materiaComHoraZerada = itensSelecionados.some((item) => (Number(item?.peso) || 0) <= 0);
    if (itensSelecionados.length > 0 && materiaComHoraZerada) {
      return 'Ha materias no bloco com 0h. Defina um tempo (ex.: 00:30) ou remova a materia do dia.';
    }
    if (minutos <= 0 && itensSelecionados.length > 0) return 'Informe as horas deste bloco.';
    return '';
  }

  isBlocoInvalido(index: number): boolean {
    return Boolean(this.blocoErroMensagem(index));
  }

  filtrarMaterias(event: { query: string }, blocoIndex: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    const termo = (event.query || '').toLowerCase();
    const idsUsados = new Set(this.obterItensOrdenados(bloco).map(item => item.materiaEstudoId));
    this.materiasFiltradasPorBloco[blocoIndex] = this.materiasOptions.filter((opt) => {
      if (idsUsados.has(opt.value)) return false;
      if (!termo) return true;
      return opt.label.toLowerCase().includes(termo);
    });
  }

  adicionarMateriaSelecionada(blocoIndex: number, event?: { value?: MateriaOption }): void {
    const selecionada = event?.value || this.materiaSelecionadaPorBloco[blocoIndex];
    if (!selecionada?.value) return;
    if (this.substituicaoAtiva && this.substituicaoAtiva.blocoIndex === blocoIndex) {
      this.substituirMateriaNoBloco(blocoIndex, this.substituicaoAtiva.itemIndex, selecionada.value);
      this.substituicaoAtiva = null;
      this.materiaSelecionadaPorBloco[blocoIndex] = null;
      this.limparAutoCompleteInput(blocoIndex);
      return;
    }

    this.adicionarMateriaAoBloco(blocoIndex, selecionada.value);
    this.materiaSelecionadaPorBloco[blocoIndex] = null;
    this.limparAutoCompleteInput(blocoIndex);
  }

  adicionarMateriaNaLinha(blocoIndex: number, linhaIndex: number, event?: { value?: MateriaOption }): void {
    const materiaId = this.resolverMateriaIdNaLinha(blocoIndex, linhaIndex, event);
    if (materiaId) {
      this.aplicarMateriaNaLinha(blocoIndex, linhaIndex, materiaId);
      return;
    }

    const nomeNovo = this.resolverNomeNovoMateriaNaLinha(blocoIndex, linhaIndex, event);
    if (!nomeNovo) return;

    this.criarMateriaEAdicionarNaLinha(blocoIndex, linhaIndex, nomeNovo);
  }

  adicionarMateriaAoBloco(blocoIndex: number, materiaId: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco || materiaId == null) return;

    const itens = this.obterItensOrdenados(bloco);
    if (itens.length >= this.linhasPorBloco) {
      this.setMensagem('warn', 'Limite de materias atingido neste dia.');
      return;
    }
    const jaExiste = itens.some((it) => it.materiaEstudoId === materiaId);
    if (jaExiste) {
      this.setMensagem('warn', 'Essa materia ja esta no bloco.');
      return;
    }

    const materiaNome = this.nomeMateria(materiaId);
    itens.push({
      id: undefined,
      materiaEstudoId: materiaId,
      materiaNome,
      ordem: itens.length + 1,
      peso: this.pesoPadraoNovaMateriaMinutos
    });

    bloco.itens = itens.map((it, idx) => ({ ...it, ordem: idx + 1 }));
    this.materiaSelecionadaPorBloco[blocoIndex] = null;
    this.atualizarLinhasFixas(blocoIndex);

    if (this.abaAtiva === blocoIndex) {
      this.montarForm(bloco);
      this.form.markAsDirty();
    }
    this.recalcularHorasLiquidasDoBloco(blocoIndex);
    this.solicitarAutoSave();
  }

  removerMateriaBloco(blocoIndex: number, linha: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    const itens = this.obterItensOrdenados(bloco);
    if (linha >= itens.length) return;

    const removido = { ...itens[linha] };
    itens.splice(linha, 1);
    bloco.itens = itens.map((it, idx) => ({ ...it, ordem: idx + 1 }));

    const itemId = Number(removido.id || 0);
    if (itemId > 0) {
      this.blocosService.removerItem(itemId).subscribe({
        error: () => this.setMensagem('error', 'Nao foi possivel persistir a remocao da materia.')
      });
    }

    this.atualizarLinhasFixas(blocoIndex);

    if (this.abaAtiva === blocoIndex) {
      this.montarForm(bloco);
      this.form.markAsDirty();
    }
    this.recalcularHorasLiquidasDoBloco(blocoIndex);
    this.solicitarAutoSave();
  }

  iniciarSubstituicao(blocoIndex: number, itemIndex: number): void {
    this.substituicaoAtiva = { blocoIndex, itemIndex };
    this.linhaEdicaoAtiva = { blocoIndex, linhaIndex: itemIndex };
    if (this.materiaSelecionadaPorLinha[blocoIndex]) {
      this.materiaSelecionadaPorLinha[blocoIndex][itemIndex] = null;
    }
    setTimeout(() => {
      const input = document.getElementById(
        `materia-add-${this.blocos[blocoIndex]?.numero}-${itemIndex}`
      ) as HTMLInputElement | null;
      if (input) input.focus();
    });
  }

  estaSubstituindo(blocoIndex: number, itemIndex: number): boolean {
    return this.substituicaoAtiva?.blocoIndex === blocoIndex && this.substituicaoAtiva?.itemIndex === itemIndex;
  }

  estaEditandoLinha(blocoIndex: number, linhaIndex: number): boolean {
    return this.linhaEdicaoAtiva?.blocoIndex === blocoIndex && this.linhaEdicaoAtiva?.linhaIndex === linhaIndex;
  }

  iniciarEdicaoLinha(blocoIndex: number, linhaIndex: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    this.linhaEdicaoAtiva = { blocoIndex, linhaIndex };
    setTimeout(() => {
      const input = document.getElementById(`materia-add-${bloco.numero}-${linhaIndex}`) as HTMLInputElement | null;
      if (input) input.focus();
    });
  }

  abrirSugestoes(blocoIndex: number): void {
    this.filtrarMaterias({ query: '' }, blocoIndex);
  }

  mostrarBotaoAdicionarNaLinha(blocoIndex: number, linhaIndex: number): boolean {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return false;
    const itens = this.obterItensOrdenados(bloco);
    if (itens.length >= this.linhasPorBloco) return false;
    return linhaIndex === itens.length;
  }

  fecharEdicaoLinha(blocoIndex: number, linhaIndex: number): void {
    setTimeout(() => {
      if (this.estaEditandoLinha(blocoIndex, linhaIndex)) {
        this.linhaEdicaoAtiva = null;
      }
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.linhaEdicaoAtiva) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest('.bloco-linha-edit') ||
      target.closest('.p-autocomplete-panel') ||
      target.closest('.p-autocomplete')
    ) {
      return;
    }
    this.linhaEdicaoAtiva = null;
    this.substituicaoAtiva = null;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasPendenciasSalvar) return;
    event.preventDefault();
    event.returnValue = '';
  }

  podeSubstituir(item: BlocoEstudoItemDTO): boolean {
    return this.statusMateriaKey(item) === 'emdia';
  }

  statusMateriaKey(item: BlocoEstudoItemDTO): string {
    const statusBackend = String(item?.statusMateriaKey || '').toLowerCase();
    if (statusBackend === 'revisao' || statusBackend === 'estudo' || statusBackend === 'emdia' || statusBackend === 'indef') {
      return statusBackend;
    }

    const statusRevisao = this.revisaoStatusPorMateria.get(item.materiaEstudoId);
    if (statusRevisao === 'VENCIDA' || statusRevisao === 'EM_DIA') return 'revisao';
    if (statusRevisao === 'FUTURA') return 'emdia';

    const statusRaw = this.normalizarStatus(
      item.status || item.statusRevisao || (item as any).statusMateria || (item as any).situacao
    );

    const revisoesHoje = Number(item.revisoesHojeQtd ?? (item as any).revisoesHoje ?? 0);
    const revisoesAtrasadas = Number(item.revisoesAtrasadasQtd ?? (item as any).revisoesAtrasadas ?? 0);
    const pendencias = Number(
      item.conteudoPendenteQtd ?? item.estudoPendenteQtd ?? (item as any).pendenciasEstudoQtd ?? 0
    );

    if (revisoesHoje > 0 || revisoesAtrasadas > 0) return 'revisao';
    if (pendencias > 0) return 'estudo';
    if (item.emDia === true) return 'emdia';

    if (statusRaw) {
      if (['REVISAO', 'REVISAO_HOJE', 'ATRASADA', 'HOJE', 'VENCIDA', 'VENCE_HOJE'].includes(statusRaw)) {
        return 'revisao';
      }
      if (['ESTUDO', 'PENDENTE', 'NOVO', 'NOVO_CONTEUDO', 'CONTEUDO_NOVO'].includes(statusRaw)) {
        return 'estudo';
      }
      if (['EM_DIA', 'EMDIA', 'OK', 'SEM'].includes(statusRaw)) {
        return 'emdia';
      }
    }

    return 'indef';
  }

  temRevisaoVencida(item: BlocoEstudoItemDTO): boolean {
    return this.revisaoStatusPorMateria.get(item.materiaEstudoId) === 'VENCIDA';
  }

  temRevisaoHoje(item: BlocoEstudoItemDTO): boolean {
    return this.revisaoStatusPorMateria.get(item.materiaEstudoId) === 'EM_DIA';
  }

  temRevisaoFutura(item: BlocoEstudoItemDTO): boolean {
    return this.revisaoStatusPorMateria.get(item.materiaEstudoId) === 'FUTURA';
  }

  statusMateriaLabel(item: BlocoEstudoItemDTO): string {
    const key = this.statusMateriaKey(item);
    if (key === 'revisao') return 'Revisao';
    if (key === 'estudo') return 'Estudo';
    if (key === 'emdia') return 'Em dia';
    return '—';
  }

  private limparAutoCompleteInput(blocoIndex: number, linhaIndex?: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    setTimeout(() => {
      const inputId = linhaIndex == null
        ? `materia-add-${bloco.numero}`
        : `materia-add-${bloco.numero}-${linhaIndex}`;
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (input) input.value = '';
    });
  }

  obterLinhasBloco(bloco: BlocoEstudoDTO): Array<{ item: BlocoEstudoItemDTO | null }> {
    const itens = this.obterItensOrdenados(bloco);
    return Array.from({ length: this.linhasPorBloco }, (_, idx) => ({
      item: itens[idx] ?? null
    }));
  }

  private atualizarLinhasFixas(blocoIndex: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    const itens = this.obterItensOrdenados(bloco);
    this.linhasFixasPorBloco[blocoIndex] = Array.from({ length: this.linhasPorBloco }, (_, idx) => ({
      item: itens[idx] ?? null
    }));
  }

  private inicializarLinhasFixas(): void {
    this.linhasFixasPorBloco = this.blocos.map((bloco) => {
      const itens = this.obterItensOrdenados(bloco);
      return Array.from({ length: this.linhasPorBloco }, (_, idx) => ({
        item: itens[idx] ?? null
      }));
    });
  }

  trackByLinha(index: number): number {
    return index;
  }

  private substituirMateriaNoBloco(blocoIndex: number, itemIndex: number, materiaId: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    const itens = this.obterItensOrdenados(bloco);
    if (itemIndex >= itens.length) return;

    const jaExiste = itens.findIndex((it) => it.materiaEstudoId === materiaId);
    if (jaExiste >= 0 && jaExiste !== itemIndex) {
      this.setMensagem('warn', 'Essa materia ja esta no bloco.');
      return;
    }

    const materiaNome = this.nomeMateria(materiaId);
    const base = itens[itemIndex];
    itens[itemIndex] = {
      ...base,
      id: undefined,
      materiaEstudoId: materiaId,
      materiaNome
    };

    bloco.itens = itens.map((it, idx) => ({ ...it, ordem: idx + 1 }));
    this.atualizarLinhasFixas(blocoIndex);

    if (this.abaAtiva === blocoIndex) {
      this.montarForm(bloco);
      this.form.markAsDirty();
    }
    this.solicitarAutoSave();
  }

  private normalizarStatus(status?: string | null): string {
    if (!status) return '';
    return String(status)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  private priorizarStatusRevisao(
    atual?: 'VENCIDA' | 'EM_DIA' | 'FUTURA',
    novo?: 'VENCIDA' | 'EM_DIA' | 'FUTURA'
  ): 'VENCIDA' | 'EM_DIA' | 'FUTURA' {
    const ordem = { VENCIDA: 3, EM_DIA: 2, FUTURA: 1 };
    const atualScore = atual ? ordem[atual] : 0;
    const novoScore = novo ? ordem[novo] : 0;
    return (novoScore >= atualScore ? novo : atual) || 'FUTURA';
  }

  limparBloco(blocoIndex: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;
    const idsRemocao = this.obterItensOrdenados(bloco)
      .map((item) => Number(item?.id || 0))
      .filter((id) => id > 0);

    if (idsRemocao.length) {
      forkJoin(idsRemocao.map((id) => this.blocosService.removerItem(id))).subscribe({
        error: () => this.setMensagem('error', 'Nao foi possivel limpar todas as materias no servidor.')
      });
    }

    bloco.minutosDisponiveis = 0;
    bloco.itens = [];
    this.blocoHoraInputs[blocoIndex] = this.formatMinutosParaHora(0);
    this.blocoHoraErrors[blocoIndex] = null;
    this.materiaSelecionadaPorBloco[blocoIndex] = null;
    if (this.materiaSelecionadaPorLinha[blocoIndex]) {
      this.materiaSelecionadaPorLinha[blocoIndex] = Array.from({ length: this.linhasPorBloco }, () => null);
    }
    this.atualizarLinhasFixas(blocoIndex);

    if (this.abaAtiva === blocoIndex) {
      this.montarForm(bloco);
      this.form.markAsDirty();
    }
    this.recalcularHorasLiquidasDoBloco(blocoIndex);
    this.solicitarAutoSave();
  }

  private resolverMateriaIdNaLinha(
    blocoIndex: number,
    linhaIndex: number,
    event?: { value?: MateriaOption }
  ): number | null {
    const selecionada = event?.value || this.materiaSelecionadaPorLinha[blocoIndex]?.[linhaIndex];
    if (!selecionada || typeof selecionada === 'string') return null;

    const materiaId = Number(selecionada.value || 0);
    return Number.isFinite(materiaId) && materiaId > 0 ? materiaId : null;
  }

  private resolverNomeNovoMateriaNaLinha(
    blocoIndex: number,
    linhaIndex: number,
    event?: { value?: MateriaOption }
  ): string {
    const selecionada = event?.value || this.materiaSelecionadaPorLinha[blocoIndex]?.[linhaIndex];
    const texto = typeof selecionada === 'string'
      ? selecionada
      : String((selecionada as MateriaOption | undefined)?.label || '');
    const nomeDigitado = this.normalizarNomeMateria(texto);
    if (!nomeDigitado) return '';

    const existente = this.encontrarMateriaOptionPorNome(nomeDigitado);
    if (existente?.value) {
      this.aplicarMateriaNaLinha(blocoIndex, linhaIndex, existente.value);
      return '';
    }

    return nomeDigitado;
  }

  private aplicarMateriaNaLinha(blocoIndex: number, linhaIndex: number, materiaId: number): void {
    if (this.substituicaoAtiva && this.substituicaoAtiva.blocoIndex === blocoIndex) {
      this.substituirMateriaNoBloco(blocoIndex, this.substituicaoAtiva.itemIndex, materiaId);
      this.substituicaoAtiva = null;
      this.linhaEdicaoAtiva = null;
      this.materiaSelecionadaPorLinha[blocoIndex][linhaIndex] = null;
      this.limparAutoCompleteInput(blocoIndex, linhaIndex);
      return;
    }

    const itens = this.obterItensOrdenados(this.blocos[blocoIndex]);
    if (linhaIndex < itens.length) return;

    this.adicionarMateriaAoBloco(blocoIndex, materiaId);
    this.linhaEdicaoAtiva = null;
    this.materiaSelecionadaPorLinha[blocoIndex][linhaIndex] = null;
    this.limparAutoCompleteInput(blocoIndex, linhaIndex);
    this.atualizarLinhasFixas(blocoIndex);
  }

  private criarMateriaEAdicionarNaLinha(blocoIndex: number, linhaIndex: number, nomeMateria: string): void {
    const lockKey = `${blocoIndex}-${linhaIndex}`;
    if (this.linhaAddEmProcesso.has(lockKey)) return;
    this.linhaAddEmProcesso.add(lockKey);

    this.materiaService.salvarMateria({ nome: nomeMateria }).pipe(
      finalize(() => this.linhaAddEmProcesso.delete(lockKey))
    ).subscribe({
      next: (materiaCriada) => {
        const materiaId = Number(materiaCriada?.id || 0);
        const materiaNome = this.normalizarNomeMateria(String(materiaCriada?.nome || nomeMateria));
        if (!materiaId || !materiaNome) {
          this.setMensagem('error', 'Nao foi possivel cadastrar a materia agora.');
          return;
        }

        if (!this.materiasMap.has(materiaId)) {
          this.materiasTodas = [...this.materiasTodas, { id: materiaId, nome: materiaNome }];
          this.materiasMap.set(materiaId, materiaNome);
        }
        // Se houver filtro por edital ativo, garante que a materia criada agora
        // apareca imediatamente no autocomplete do planner.
        if (this.editalFiltroSelecionadoId != null) {
          this.materiasFiltroIds.add(materiaId);
        }
        this.atualizarMateriasOptions();

        this.materiaService.notificarMateriasAlteradas();
        this.aplicarMateriaNaLinha(blocoIndex, linhaIndex, materiaId);
        this.setMensagem('success', 'Materia criada e adicionada no card.');
      },
      error: () => {
        this.setMensagem('error', 'Nao foi possivel cadastrar a nova materia.');
      }
    });
  }

  private encontrarMateriaOptionPorNome(nome: string): MateriaOption | null {
    const key = this.normalizarChaveMateria(nome);
    if (!key) return null;
    const materiaExistente = this.materiasTodas.find((m) => this.normalizarChaveMateria(m.nome) === key);
    const materiaId = Number(materiaExistente?.id || 0);
    if (!materiaExistente || !Number.isFinite(materiaId) || materiaId <= 0) return null;
    return { label: materiaExistente.nome, value: materiaId };
  }

  private normalizarNomeMateria(valor: string): string {
    return String(valor || '').replace(/\s+/g, ' ').trim();
  }

  private normalizarChaveMateria(valor: string): string {
    return this.normalizarNomeMateria(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
  }

  abrirCopiaPanel(blocoIndex: number, event: Event): void {
    event.stopPropagation();
    this.blocoCopiaOrigem = blocoIndex;
    this.blocoCopiaDestino = null;
    this.copiaPanel?.toggle(event);
  }

  get blocosDestinoOptions(): Array<{ label: string; value: number }> {
    return this.blocos
      .map((bloco, index) => ({ label: `Bloco ${bloco.numero}`, value: index }))
      .filter((item) => item.value !== this.blocoCopiaOrigem);
  }

  confirmarCopiaBloco(): void {
    if (this.blocoCopiaOrigem == null || this.blocoCopiaDestino == null) return;
    this.copiarBloco(this.blocoCopiaOrigem, this.blocoCopiaDestino);
    this.copiaPanel?.hide();
  }

  copiarBloco(origemIndex: number, destinoIndex: number): void {
    const origem = this.blocos[origemIndex];
    const destino = this.blocos[destinoIndex];
    if (!origem || !destino) return;

    destino.minutosDisponiveis = origem.minutosDisponiveis ?? 0;
    destino.itens = this.obterItensOrdenados(origem).map((item, idx) => ({
      id: undefined,
      materiaEstudoId: item.materiaEstudoId,
      materiaNome: item.materiaNome ?? this.nomeMateria(item.materiaEstudoId),
      ordem: idx + 1,
      peso: item.peso ?? 0
    }));
    this.atualizarLinhasFixas(destinoIndex);

    this.blocoHoraInputs[destinoIndex] = this.formatMinutosParaHora(destino.minutosDisponiveis ?? 0);
    this.blocoHoraErrors[destinoIndex] = null;
    this.materiaSelecionadaPorBloco[destinoIndex] = null;
    if (this.materiaSelecionadaPorLinha[destinoIndex]) {
      this.materiaSelecionadaPorLinha[destinoIndex] = Array.from({ length: this.linhasPorBloco }, () => null);
    }

    if (this.abaAtiva === destinoIndex) {
      this.montarForm(destino);
      this.form.markAsDirty();
    }
    this.recalcularHorasLiquidasDoBloco(destinoIndex);
    this.solicitarAutoSave();
  }

  private sincronizarInputsPorBloco(): void {
    this.blocoHoraInputs = this.blocos.map((bloco) => this.formatMinutosParaHora(bloco.minutosDisponiveis ?? 0));
    this.blocoHoraErrors = this.blocos.map(() => null);
    this.materiasFiltradasPorBloco = this.blocos.map(() => []);
    this.materiaSelecionadaPorBloco = this.blocos.map(() => null);
    this.materiaSelecionadaPorLinha = this.blocos.map(() =>
      Array.from({ length: this.linhasPorBloco }, () => null)
    );
  }

  getHorasMateriaInput(blocoIndex: number, linhaIndex: number, item: BlocoEstudoItemDTO): string {
    const key = `${blocoIndex}-${linhaIndex}`;
    if (this.horasMateriaInputs[key] != null) {
      return this.horasMateriaInputs[key];
    }
    return this.formatMinutosParaHora(Math.max(0, Number(item?.peso ?? 0) || 0));
  }

  onHorasMateriaChange(blocoIndex: number, linhaIndex: number, valor: string): void {
    const key = `${blocoIndex}-${linhaIndex}`;
    this.horasMateriaInputs[key] = valor;
  }

  onHorasMateriaBlur(blocoIndex: number, linhaIndex: number, item: BlocoEstudoItemDTO): void {
    const key = `${blocoIndex}-${linhaIndex}`;
    const valor = this.horasMateriaInputs[key] ?? '';
    const resultado = this.parseHora(valor);
    if (resultado.erro || resultado.minutos == null) {
      this.horasMateriaInputs[key] = this.formatMinutosParaHora(Math.max(0, Number(item?.peso ?? 0) || 0));
      return;
    }

    item.peso = resultado.minutos;
    this.horasMateriaInputs[key] = this.formatMinutosParaHora(resultado.minutos);
    if (blocoIndex === this.abaAtiva) {
      const itemCtrl = this.itensFormArray.at(linhaIndex);
      if (itemCtrl) {
        itemCtrl.controls.peso.setValue(resultado.minutos);
      }
    }
    this.recalcularHorasLiquidasDoBloco(blocoIndex);
    this.solicitarAutoSave();
  }

  private solicitarAutoSave(imediato = false): void {
    if (!this.carregamentoInicialBlocosConcluido || !this.snapshotPlanejamentoInicializado) return;

    if (this.autoSaveTimerId != null) {
      window.clearTimeout(this.autoSaveTimerId);
      this.autoSaveTimerId = null;
    }

    const delay = imediato ? 0 : this.autoSaveDelayMs;
    this.autoSaveTimerId = window.setTimeout(() => {
      this.autoSaveTimerId = null;
      this.persistirTodos(true);
    }, delay);
  }

  abrirPickerHora(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    try {
      const anyInput = input as any;
      if (typeof anyInput.showPicker === 'function') {
        anyInput.showPicker();
      }
    } catch {}
  }

  private recalcularHorasLiquidasDoBloco(blocoIndex: number): void {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return;

    const total = this.obterItensOrdenados(bloco).reduce((acc, it) => acc + (Number(it?.peso) || 0), 0);
    bloco.minutosDisponiveis = Math.max(0, total);
    this.blocoHoraInputs[blocoIndex] = this.formatMinutosParaHora(bloco.minutosDisponiveis);
    this.blocoHoraErrors[blocoIndex] = null;

    if (this.abaAtiva === blocoIndex && this.form?.controls?.minutosDisponiveis) {
      this.form.controls.minutosDisponiveis.setValue(bloco.minutosDisponiveis);
      this.form.markAsDirty();
    }
  }

  private inicializarPesosBloco(bloco: BlocoEstudoDTO): void {
    const itens = this.obterItensOrdenados(bloco);
    if (!itens.length) return;
    const algumComPeso = itens.some((it) => Number.isFinite(Number(it?.peso)));
    if (algumComPeso) return;

    const total = Math.max(0, bloco.minutosDisponiveis ?? 0);
    const base = Math.floor(total / itens.length);
    let resto = total - base * itens.length;

    itens.forEach((it) => {
      it.peso = base + (resto > 0 ? 1 : 0);
      if (resto > 0) resto -= 1;
    });
  }

  private sincronizarHorasMateriaNoBloco(blocoIndex: number): boolean {
    const bloco = this.blocos[blocoIndex];
    if (!bloco) return true;

    const itens = this.obterItensOrdenados(bloco);
    for (let li = 0; li < itens.length; li += 1) {
      const key = `${blocoIndex}-${li}`;
      const valor = this.horasMateriaInputs[key];
      if (valor == null) continue;

      const resultado = this.parseHora(valor);
      if (resultado.erro || resultado.minutos == null) {
        this.setMensagem('warn', 'Hora invalida em uma materia. Ajuste antes de salvar.');
        return false;
      }

      itens[li].peso = resultado.minutos;
      this.horasMateriaInputs[key] = this.formatMinutosParaHora(resultado.minutos);
      if (blocoIndex === this.abaAtiva) {
        const itemCtrl = this.itensFormArray.at(li);
        if (itemCtrl) {
          itemCtrl.controls.peso.setValue(resultado.minutos);
        }
      }
    }

    bloco.itens = itens.map((item, idx) => ({ ...item, ordem: idx + 1 }));
    this.recalcularHorasLiquidasDoBloco(blocoIndex);
    return true;
  }

  private tentarAutoPreencherPlanejamentoInicial(): void {
    return;
  }

  private semanaEstaVazia(): boolean {
    return (this.blocos || []).every((bloco) => {
      const itens = this.obterItensOrdenados(bloco);
      const minutos = Number(bloco?.minutosDisponiveis || 0);
      return itens.length === 0 && minutos <= 0;
    });
  }

  private obterPoolMateriasAtivasParaAutoplano(): number[] {
    const ids = this.materiasOptions
      .map((opt) => Number(opt.value))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 6);
    return ids;
  }

  private gerarDistribuicaoAutoplano(poolIds: number[]): number[][] {
    const dias = 6;
    const slotsPorDia = 3;
    const distribuicao: number[][] = Array.from({ length: dias }, () => []);
    const restante = new Map<number, number>(poolIds.map((id) => [id, 2]));
    const alvo = poolIds.length * 2;
    let alocados = 0;
    let cursorDia = 0;
    let guard = 0;

    while (alocados < alvo && guard < 1000) {
      guard += 1;
      const dia = cursorDia % dias;
      cursorDia += 1;

      if (distribuicao[dia].length >= slotsPorDia) {
        continue;
      }

      const candidatos = poolIds.filter((id) => {
        const falta = restante.get(id) || 0;
        if (falta <= 0) return false;
        if (distribuicao[dia].includes(id)) return false;
        return true;
      });

      if (!candidatos.length) {
        continue;
      }

      const diaAnterior = dia > 0 ? distribuicao[dia - 1] : [];
      const semRepetirDiaAnterior = candidatos.filter((id) => !diaAnterior.includes(id));
      const universoEscolha = semRepetirDiaAnterior.length ? semRepetirDiaAnterior : candidatos;

      const escolhida = universoEscolha
        .slice()
        .sort((a, b) => {
          const ra = restante.get(a) || 0;
          const rb = restante.get(b) || 0;
          if (rb !== ra) return rb - ra;
          return a - b;
        })[0];

      if (!escolhida) {
        continue;
      }

      distribuicao[dia].push(escolhida);
      restante.set(escolhida, Math.max(0, (restante.get(escolhida) || 0) - 1));
      alocados += 1;
    }

    return distribuicao;
  }

  private atualizarSnapshotPlanejamentoSalvo(): void {
    this.snapshotPlanejamentoSalvo = this.gerarSnapshotPlanejamentoAtual();
    this.snapshotPlanejamentoInicializado = true;
  }

  private gerarSnapshotPlanejamentoAtual(): string {
    const base = (this.blocos || [])
      .slice()
      .sort((a, b) => Number(a?.numero || 0) - Number(b?.numero || 0))
      .map((bloco) => ({
        numero: Number(bloco?.numero || 0),
        minutosDisponiveis: Number(bloco?.minutosDisponiveis || 0),
        itens: this.obterItensOrdenados(bloco).map((item, idx) => ({
          ordem: idx + 1,
          materiaEstudoId: Number(item?.materiaEstudoId || 0),
          peso: Number(item?.peso || 0)
        }))
      }));
    return JSON.stringify(base);
  }
}
