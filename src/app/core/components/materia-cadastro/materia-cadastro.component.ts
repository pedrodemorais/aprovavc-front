import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

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
interface MateriaImport {
  nome: string;
  topicos: Topico[];
}

@Component({
  selector: 'app-materia-cadastro',
  templateUrl: './materia-cadastro.component.html',
  styleUrls: ['./materia-cadastro.component.css']
})
export class MateriaCadastroComponent implements OnInit {

  private revisaoPorMateria = new Map<number, StatusRevisao>();
  private revisoesPorTopico = new Map<number, InfoRevisaoTopico>();

  materiaForm!: FormGroup;
  submeteuMateria: boolean = false;
mostrarModalEdital = false;
textoEdital = '';
salvandoEdital = false;
  modoTopicoGlobal: boolean = false;
  previewTopicosArvore: Topico[] = [];
previewTotalItens = 0;
previewDuplicadosIgnorados = 0;


  // edição de tópico
  modoEdicaoTopico: boolean = false;
  topicoEmEdicao: any | null = null;

  materias: Materia[] = [];
  materiaSelecionada?: Materia;
  materiaExpandida?: Materia | null;

  topicos: Topico[] = [];
  novoTopicoDescricao: string = '';

  // ==========================
  // ✅ MODAL LOTE (NOME NOVO)
  // ==========================
  mostrarModalLote = false;
  textoLoteTopicos: string = '';
  salvandoLote = false;

  // ==========================
  // ✅ ALIASES (COMPAT) - se seu HTML usa nomes antigos
  // ==========================
  get modalLoteAberto(): boolean { return this.mostrarModalLote; }
  set modalLoteAberto(v: boolean) { this.mostrarModalLote = v; }

  get loteTexto(): string { return this.textoLoteTopicos; }
  set loteTexto(v: string) { this.textoLoteTopicos = v; }

  // se houver pai selecionado, importar como subtópico desse pai
  loteComoSubtopico = true;

  topicoSelecionado?: Topico | null;

  carregandoMaterias = false;
  carregandoTopicos = false;
  salvando = false;
  mensagemErro?: string;

  @ViewChild('nomeMateriaInput') nomeMateriaInput!: ElementRef<HTMLInputElement>;
  @ViewChild('novoTopicoInput') novoTopicoInput!: ElementRef<HTMLInputElement>;

  constructor(
    private fb: FormBuilder,
    private materiaService: MateriaService,
    private router: Router,
    private salaEstudoService: SalaEstudoService
  ) { }

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
    this.carregarRevisoesDashboard();
  }

  private montarForm(): void {
    this.materiaForm = this.fb.group({
      id: [null],
      nome: ['', [Validators.required, Validators.maxLength(100)]]
    });
  }

  // ==========================
  // ✅ HOTKEYS
  // ==========================
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.mostrarModalLote) {
      this.fecharModalLote();
    }
  }

  // ==========================
  // ✅ PREVIEW (se seu HTML mostra preview)
  // ==========================
  get loteItensPreview(): string[] {
    return this.extrairItensDoLote(this.textoLoteTopicos);
  }

  // ==========================
  // ✅ MODAL LOTE
  // ==========================
  abrirModalLote(): void {
    if (!this.materiaSelecionada?.id) {
      alert('Selecione uma matéria antes de importar tópicos.');
      return;
    }
    this.mostrarModalLote = true;
    this.textoLoteTopicos = '';
     this.atualizarPreviewLote();
  }
atualizarPreviewLote(): void {
  const texto = (this.textoLoteTopicos || '').trim();

  if (!texto) {
    this.previewTopicosArvore = [];
    this.previewTotalItens = 0;
    this.previewDuplicadosIgnorados = 0;
    return;
  }

  // 1) monta árvore a partir do texto colado
  const arvore = this.parseTopicosHierarquicos(texto);

  // 2) remove duplicados contra o destino (raiz ou filhos do selecionado)
  const destino = this.topicoSelecionado
    ? (this.topicoSelecionado.filhos || [])
    : this.topicos;

  const res = this.removerDuplicadosArvore(arvore, destino);

  this.previewTopicosArvore = res.arvore;
  this.previewTotalItens = res.total;
  this.previewDuplicadosIgnorados = res.removidos;
}

private removerDuplicadosArvore(
  entrada: Topico[],
  destinoNivel: Topico[]
): { arvore: Topico[]; total: number; removidos: number } {

  const vistos = new Set<string>();
  const existentesNoDestino = new Set<string>((destinoNivel || []).map(d => this.chaveTopico(d.descricao)));

  let total = 0;
  let removidos = 0;

  const filtrarNivel = (nodos: Topico[], destinoAqui: Topico[]): Topico[] => {
    const saida: Topico[] = [];

    for (const n of (nodos || [])) {
      const key = this.chaveTopico(n.descricao);

      // duplicado no PRÓPRIO lote (mesmo nível) OU já existe no destino desse nível
      if (vistos.has(key) || (destinoAqui || []).some(d => this.chaveTopico(d.descricao) === key) || existentesNoDestino.has(key)) {
        removidos++;
        continue;
      }

      vistos.add(key);

      const copia: any = {
        ...n,
        filhos: []
      };

      total++;

      // filhos: o "destino" dos filhos é o array de filhos do item existente (se existir),
      // mas como esse é preview, basta comparar com filhos do destino equivalente (se houver).
      const filhosEntrada = (n.filhos || []) as Topico[];

      // tenta achar item equivalente no destino para comparar filhos
      const existenteNoDestino = (destinoAqui || []).find(d => this.chaveTopico(d.descricao) === key);
      const destinoFilhos = existenteNoDestino?.filhos || [];

      if (filhosEntrada.length) {
        copia.filhos = filtrarNivel(filhosEntrada, destinoFilhos);
      }

      saida.push(copia);
    }

    return saida;
  };

  const arvoreFiltrada = filtrarNivel(entrada || [], destinoNivel || []);

  return { arvore: arvoreFiltrada, total, removidos };
}

  fecharModalLote(): void {
    this.mostrarModalLote = false;
    this.textoLoteTopicos = '';
  }

  // =========================================================
  // ✅ LOTE: ORDEM EXATA + SEM DUPLICADAS (MESCLA)
  // =========================================================

  /** Normaliza (chave) para comparar duplicados (mesmo pai) */
  private chaveTopico(descricao: string): string {
    return (descricao || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private encontrarPorDescricao(array: Topico[], descricao: string): Topico | undefined {
    const chave = this.chaveTopico(descricao);
    return (array || []).find(t => this.chaveTopico((t as any).descricao) === chave);
  }

  /** Remove bullets/numeração e normaliza espaços */
  private limparLinhaTopico(linha: string): string {
    let s = (linha || '').replace(/\r/g, '');

    // bullets comuns
    s = s.replace(/^\s*([\-*•]+)\s+/, '');

    // numeração tipo "1.", "1.2", "01)", "01 -"
    s = s.replace(/^\s*(\d+(\.\d+)*[\)\.\-]?)\s+/, '');

    // romanos tipo "I)", "II."
    s = s.replace(/^\s*([IVXLCDM]+[\)\.\-]?)\s+/i, '');

    // letras tipo "a)", "b."
    s = s.replace(/^\s*([a-zA-Z][\)\.\-]?)\s+/, '');

    return s.trim();
  }

  /**
   * Detecta unidade de indentação (2 ou 4 espaços, etc) baseado no menor recuo encontrado.
   * Aceita tabs (vira 2 espaços).
   */
  private detectarUnidadeIndentacao(linhas: string[]): number {
    const indents: number[] = [];

    for (const l of linhas) {
      const raw = l.replace(/\t/g, '  ');
      const match = raw.match(/^(\s+)/);
      if (match) {
        const n = match[1].length;
        if (n > 0) indents.push(n);
      }
    }

    if (!indents.length) return 2;
    return Math.max(2, Math.min(...indents));
  }

  /**
   * Parseia texto em árvore por indentação.
   * ✅ Mantém ordem do texto
   * ✅ Não cria duplicado no mesmo pai (mescla)
   */
private parseTopicosHierarquicos(texto: string): Topico[] {
  const linhasBrutas = (texto || '')
    .split('\n')
    .map(l => l.replace(/\r/g, ''))
    .filter(l => l.trim().length > 0);

  const unidade = this.detectarUnidadeIndentacao(linhasBrutas);

  const raiz: Topico[] = [];
  const stack: { nivel: number; node: Topico }[] = [];

  for (const linhaBruta of linhasBrutas) {
    const raw = linhaBruta.replace(/\t/g, '  ');
    const indent = (raw.match(/^(\s*)/)?.[1]?.length ?? 0);
    let nivel = Math.floor(indent / unidade);

    const desc = this.limparLinhaTopico(raw);
    if (!desc) continue;

    if (stack.length > 0) {
      const maxPermitido = stack[stack.length - 1].nivel + 1;
      if (nivel > maxPermitido) nivel = maxPermitido;
    }

    // =========================
    // NÍVEL RAIZ (0)
    // =========================
    if (nivel <= 0) {
      const achado = this.encontrarPorDescricao(raiz, desc);
      let node: Topico;

      if (achado) {
        node = achado;
        (node as any).filhos = (node as any).filhos || [];
      } else {
        node = {
          id: undefined as any,
          descricao: desc as any,
          ativo: true as any,
          nivel: 0 as any,
          filhos: [] as any
        } as any;

        raiz.push(node);
      }

      stack.length = 0;
      stack.push({ nivel: 0, node });
      continue;
    }

    // =========================
    // NÍVEL > 0 (FILHOS)
    // =========================
    while (stack.length && stack[stack.length - 1].nivel >= nivel) {
      stack.pop();
    }

    const pai = stack[stack.length - 1]?.node;

    // se por algum motivo não achou pai, volta pra raiz
    const destino = pai
      ? (((pai as any).filhos || ((pai as any).filhos = [])) as Topico[])
      : raiz;

    const achado = this.encontrarPorDescricao(destino, desc);
    let node: Topico;

    if (achado) {
      node = achado;
      (node as any).filhos = (node as any).filhos || [];
    } else {
      node = {
        id: undefined as any,
        descricao: desc as any,
        ativo: true as any,
        nivel: nivel as any,
        filhos: [] as any
      } as any;

      destino.push(node);
    }

    stack.push({ nivel, node });
  }

  return raiz;
}
/** Salva árvore em sequência (pai antes dos filhos) */
private async salvarArvoreTopicos(nodos: Topico[], pai?: Topico): Promise<void> {
  for (const n of nodos) {
    await this.salvarTopicoAutomaticoPromise(n, pai);
    if ((n.filhos || []).length) {
      await this.salvarArvoreTopicos(n.filhos || [], n);
    }
  }
}


  /** Promisifica salvarTopico (pra salvar em sequência pai->filhos) */
  private salvarTopicoAutomaticoPromise(topico: Topico, pai?: Topico): Promise<void> {
    const desc = String((topico as any).descricao || '');
if (desc.length > 255) {
  console.warn('[TOPICO] Muito grande:', desc.length, desc);
}
    return new Promise((resolve, reject) => {
      if (!this.materiaSelecionada?.id) {
        reject('Matéria não selecionada.');
        return;
      }

      const payload: any = {
        id: (topico as any).id ?? null,
        descricao: (topico as any).descricao,
        ativo: (topico as any).ativo
      };

      if (pai && (pai as any).id) {
        payload.topicoPaiId = (pai as any).id;
      }

      this.materiaService.salvarTopico(this.materiaSelecionada.id, payload).subscribe({
        next: (salvo) => {
          if (salvo && (salvo as any).id) {
            (topico as any).id = (salvo as any).id;
          }
          resolve();
        },
        error: (err) => reject(err)
      });
    });
  }

  /**
   * Mescla árvore colada no destino:
   * ✅ não duplica no mesmo pai
   * ✅ mantém ordem exata do texto (para os novos que entram)
   * ✅ salva apenas o que for novo, na sequência correta
   */
  private async mesclarESalvar(destArray: Topico[], incoming: Topico[], pai?: Topico): Promise<void> {
    for (const inc of incoming) {
      const desc = (inc as any).descricao;

      const existente = this.encontrarPorDescricao(destArray, desc);

      if (existente) {
        (existente as any).filhos = (existente as any).filhos || [];
        const filhosInc: Topico[] = (inc as any).filhos || [];
        if (filhosInc.length) {
          await this.mesclarESalvar((existente as any).filhos, filhosInc, existente);
        }
        continue;
      }

      // Novo -> entra na ordem exata do texto
      const novo: Topico = {
        id: undefined as any,
        descricao: desc as any,
        ativo: ((inc as any).ativo ?? true) as any,
        nivel: ((inc as any).nivel ?? 0) as any,
        filhos: [] as any
      } as any;

      // garante filhos
      (novo as any).filhos = ((inc as any).filhos || []).map((f: any) => ({
        id: undefined,
        descricao: f.descricao,
        ativo: f.ativo ?? true,
        nivel: f.nivel,
        filhos: (f.filhos || [])
      })) as any;

      destArray.push(novo);

      // salva nó (pai->filho)
      await this.salvarTopicoAutomaticoPromise(novo, pai);

      // salva filhos (e mescla se necessário)
      const filhosNovo: Topico[] = (novo as any).filhos || [];
      if (filhosNovo.length) {
        await this.mesclarESalvar((novo as any).filhos, filhosNovo, novo);
      }
    }
  }

  /** Ação principal do botão do modal */
  async importarTopicosEmLote(): Promise<void> {
    const texto = (this.textoLoteTopicos || '').trim();
    if (!texto) return;

    if (!this.materiaSelecionada?.id) {
      alert('Selecione uma matéria antes de importar.');
      return;
    }

    this.salvandoLote = true;
    this.mensagemErro = undefined;

    try {
      const arvore = this.parseTopicosHierarquicos(texto);

      const paiDestino = (this.topicoSelecionado && this.loteComoSubtopico) ? this.topicoSelecionado : undefined;
      const destinoArray: Topico[] = paiDestino
        ? (((paiDestino as any).filhos || ((paiDestino as any).filhos = [])) as Topico[])
        : this.topicos;

      // ✅ mescla + salva (ordem do texto garantida para os novos)
      await this.mesclarESalvar(destinoArray, arvore, paiDestino);

      // ✅ NÃO recarrega aqui (pra não perder a ordem colada na UI)
      this.fecharModalLote();
      this.focarNovoTopico();
    } catch (err) {
      console.error('[LOTE-TOPICOS] Erro ao importar:', err);
      this.mensagemErro = 'Erro ao importar tópicos por lote.';
    } finally {
      this.salvandoLote = false;
    }
  }

  // ✅ Se seu HTML antigo chama salvarLote(), mantém compatível:
  async salvarLote(): Promise<void> {
    await this.importarTopicosEmLote();
  }

  // =========================================================
  // Helpers de preview (lista simples)
  // =========================================================
  private extrairItensDoLote(texto: string): string[] {
    const linhas = (texto || '')
      .split('\n')
      .map(l => this.limparPrefixosLista(l))
      .map(l => (l || '').trim())
      .filter(Boolean);

    // remove duplicados dentro do próprio lote
    const vistos = new Set<string>();
    const saida: string[] = [];

    for (const l of linhas) {
      const key = this.normalizarTexto(l);
      if (!key) continue;
      if (vistos.has(key)) continue;
      vistos.add(key);
      saida.push(l);
    }

    return saida;
  }

  private limparPrefixosLista(linha: string): string {
    let s = (linha || '').trim();
    s = s.replace(/^(\s*[-•*]+\s+)/, '');
    s = s.replace(/^(\s*\d+(\.\d+)*\s*[-–—.)]?\s+)/, '');
    s = s.replace(/^(\s*[IVXLCDM]+\s*[-–—.)]?\s+)/i, '');
    s = s.replace(/^(\s*[a-zA-Z]\s*[-–—.)]\s+)/, '');
    return s.trim();
  }

  // ==========================
  // DASHBOARD REVISÕES
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

  /** Status consolidado da MATÉRIA (pior status entre todos os tópicos) */
  private getStatusRevisaoMateria(m: Materia): StatusRevisao {
    if (!m.id) return 'SEM';

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

  campoInvalido(campo: string): boolean {
    const control = this.materiaForm.get(campo);
    if (!control) return false;
    return control.invalid && this.submeteuMateria;
  }

  // ---------- SALA DE ESTUDO ----------
  abrirSalaEstudoMateria(m: Materia): void {
    if (!m.id) {
      alert('Salve a matéria antes de entrar na sala de estudo.');
      return;
    }
    this.router.navigate(['/area-restrita/sala-estudo', m.id]);
  }

  // ---------- UTIL ----------
  private normalizarTexto(texto: string | undefined | null): string {
    return (texto || '').trim().toLowerCase();
  }

  private focarNomeMateria(): void {
    setTimeout(() => {
      if (this.nomeMateriaInput) {
        this.nomeMateriaInput.nativeElement.focus();
        this.nomeMateriaInput.nativeElement.select();
      }
    });
  }

  private focarNovoTopico(): void {
    setTimeout(() => {
      if (this.novoTopicoInput) {
        this.novoTopicoInput.nativeElement.focus();
        this.novoTopicoInput.nativeElement.select();
      }
    });
  }

  // ---------- MATÉRIA ----------
  carregarMaterias(): void {
    this.carregandoMaterias = true;
    this.mensagemErro = undefined;

    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista;
        this.carregandoMaterias = false;
      },
      error: () => {
        this.mensagemErro = 'Erro ao carregar matérias.';
        this.carregandoMaterias = false;
      }
    });
  }

  novaMateria(): void {
    this.materiaForm.reset({ id: null, nome: '' });
    this.materiaSelecionada = undefined;
    this.materiaExpandida = null;
    this.modoTopicoGlobal = false;
    this.topicos = [];
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
    this.modoEdicaoTopico = false;
    this.topicoEmEdicao = null;
    this.submeteuMateria = false;
    this.materiaForm.markAsPristine();
    this.materiaForm.markAsUntouched();
    this.focarNomeMateria();
  }

  toggleMateria(m: Materia): void {
    if (this.materiaExpandida?.id === m.id) {
      if (!this.podeMudarContextoTopico()) return;

      this.materiaExpandida = null;
      this.materiaSelecionada = undefined;
      this.modoTopicoGlobal = false;
      this.topicos = [];
      this.topicoSelecionado = null;
      this.novoTopicoDescricao = '';
      this.modoEdicaoTopico = false;
      this.topicoEmEdicao = null;
      this.submeteuMateria = false;
      this.materiaForm.markAsPristine();
      this.materiaForm.markAsUntouched();
      return;
    }

    if (!this.podeMudarContextoTopico()) return;

    this.materiaExpandida = m;
    this.selecionarMateria(m);
    this.modoTopicoGlobal = true;
    this.focarNovoTopico();
  }

  selecionarMateria(m: Materia): void {
    this.materiaForm.reset({ id: null, nome: '' });

    this.materiaSelecionada = m;
    this.topicoSelecionado = undefined;
    this.novoTopicoDescricao = '';
    this.modoEdicaoTopico = false;
    this.topicoEmEdicao = null;

    this.submeteuMateria = false;
    this.materiaForm.markAsPristine();
    this.materiaForm.markAsUntouched();

    this.carregarTopicos(m);
  }

  editarMateria(m: Materia): void {
    this.submeteuMateria = false;

    this.materiaSelecionada = m;
    this.materiaExpandida = m;
    this.topicoSelecionado = null;

    this.modoTopicoGlobal = false;

    this.materiaForm.reset({ id: m.id, nome: m.nome });
    this.materiaForm.markAsPristine();
    this.materiaForm.markAsUntouched();

    this.carregarTopicos(m);
    this.focarNomeMateria();
  }

  iniciarEdicaoTopico(topico: any): void {
    this.modoTopicoGlobal = true;
    this.modoEdicaoTopico = true;
    this.topicoEmEdicao = topico;
    this.topicoSelecionado = topico;
    this.novoTopicoDescricao = topico.descricao || '';
    this.focarNovoTopico();
  }

  salvarMateria(): void {
    this.submeteuMateria = true;

    if (this.materiaForm.invalid) {
      this.materiaForm.markAllAsTouched();
      this.focarNomeMateria();
      return;
    }

    const dto: Materia = this.materiaForm.value;
    const nomeNormalizado = this.normalizarTexto(dto.nome);

    const duplicado = this.materias.some(m =>
      this.normalizarTexto(m.nome) === nomeNormalizado &&
      m.id !== dto.id
    );

    if (duplicado) {
      this.mensagemErro = 'Já existe uma matéria com esse nome.';
      this.materiaForm.get('nome')?.setErrors({ duplicado: true });
      this.focarNomeMateria();
      return;
    }

    this.salvando = true;

    this.materiaService.salvarMateria(dto).subscribe({
      next: (salva) => {
        this.salvando = false;
        this.mensagemErro = undefined;

        const idx = this.materias.findIndex(m => m.id === salva.id);
        if (idx >= 0) this.materias[idx] = salva;
        else this.materias.push(salva);

        this.materiaSelecionada = salva;
        this.materiaExpandida = salva;
        this.carregarTopicos(salva);

        this.materiaForm.reset({ id: null, nome: '' });
        this.submeteuMateria = false;
        this.materiaForm.markAsPristine();
        this.materiaForm.markAsUntouched();

        this.focarNomeMateria();
      },
      error: () => {
        this.salvando = false;
        this.mensagemErro = 'Erro ao salvar matéria.';
        this.focarNomeMateria();
      }
    });
  }

  excluirMateria(m: Materia): void {
    if (!m.id) return;

    const ok = confirm(`Excluir a matéria "${m.nome}"?`);
    if (!ok) return;

    this.materiaService.excluirMateria(m.id).subscribe({
      next: () => {
        this.materias = this.materias.filter(x => x.id !== m.id);

        if (this.materiaSelecionada?.id === m.id) {
          this.novaMateria();
        } else if (this.materiaExpandida?.id === m.id) {
          this.materiaExpandida = null;
          this.topicos = [];
          this.topicoSelecionado = null;
          this.novoTopicoDescricao = '';
          this.modoTopicoGlobal = false;
        } else {
          this.focarNomeMateria();
        }
      },
      error: () => {
        this.mensagemErro = 'Não foi possível excluir a matéria.';
        this.focarNomeMateria();
      }
    });
  }

  // ---------- TÓPICOS ----------
  private carregarTopicos(m: Materia): void {
    if (!m.id) return;

    this.carregandoTopicos = true;
    this.topicos = [];
    this.topicoSelecionado = null;
    this.mensagemErro = undefined;

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        this.topicos = listaSegura.map((dto: any) => this.converterDtoParaTopico(dto, 0));
        this.carregandoTopicos = false;
      },
      error: (err) => {
        this.carregandoTopicos = false;
        this.mensagemErro = 'Erro ao carregar tópicos da matéria.';
        console.error('[TOPICOS] Erro ao carregar tópicos:', err);
      }
    });
  }

  selecionarTopico(topico: any): void {
    if (this.topicoSelecionado === topico) {
      this.limparTopicoSelecionado();
      return;
    }

    if (this.topicoSelecionado && this.topicoSelecionado !== topico) {
      if (!this.podeMudarContextoTopico()) return;
    }

    this.modoTopicoGlobal = true;
    this.topicoSelecionado = topico;
    this.novoTopicoDescricao = '';
    this.modoEdicaoTopico = false;
    this.topicoEmEdicao = null;
    this.focarNovoTopico();
  }

  limparTopicoSelecionado(): void {
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
    this.modoEdicaoTopico = false;
    this.topicoEmEdicao = null;
    this.focarNovoTopico();
  }

  private salvarTopicoAutomatico(topico: Topico, pai?: Topico): void {
    if (!this.materiaSelecionada?.id) {
      alert('Selecione e salve a matéria antes de adicionar tópicos.');
      this.focarNomeMateria();
      return;
    }

    const payload: any = {
      id: (topico as any).id ?? null,
      descricao: (topico as any).descricao,
      ativo: (topico as any).ativo
    };

    if (pai && (pai as any).id) {
      payload.topicoPaiId = (pai as any).id;
    }

    this.salvando = true;

    this.materiaService.salvarTopico(this.materiaSelecionada.id, payload).subscribe({
      next: (salvo) => {
        this.salvando = false;
        if (salvo && (salvo as any).id) {
          (topico as any).id = (salvo as any).id;
        }
      },
      error: (err) => {
        this.salvando = false;
        this.mensagemErro = 'Erro ao salvar o tópico.';
        console.error('[SALVAR-TOPICO] Erro ao salvar tópico:', err);
      }
    });
  }

  adicionarTopico(): void {
    const descricao = (this.novoTopicoDescricao || '').trim();
    if (!descricao) return;

    if (!this.materiaSelecionada?.id) {
      alert('Selecione e salve a matéria antes de adicionar tópicos.');
      return;
    }

    // edição
    if (this.modoEdicaoTopico && this.topicoEmEdicao) {
      this.topicoEmEdicao.descricao = descricao;
      this.salvarTopicoAutomatico(this.topicoEmEdicao);
      this.novoTopicoDescricao = '';
      this.modoEdicaoTopico = false;
      this.topicoEmEdicao = null;
      this.focarNovoTopico();
      return;
    }

    // ✅ evita duplicado no mesmo pai (manual também)
    const destino = this.topicoSelecionado
      ? (((this.topicoSelecionado as any).filhos || ((this.topicoSelecionado as any).filhos = [])) as Topico[])
      : this.topicos;

    const jaExiste = this.encontrarPorDescricao(destino, descricao);
    if (jaExiste) {
      alert('Esse tópico já existe nesse nível.');
      this.novoTopicoDescricao = '';
      this.focarNovoTopico();
      return;
    }

    const novoTopico: any = {
      id: undefined,
      descricao,
      ativo: true,
      filhos: []
    };

    if (!this.topicoSelecionado) {
      this.topicos.push(novoTopico);
      this.salvarTopicoAutomatico(novoTopico);
    } else {
      this.topicoSelecionado.filhos.push(novoTopico);
      this.salvarTopicoAutomatico(novoTopico, this.topicoSelecionado);
    }

    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  excluirTopico(topico: Topico, parentArray: Topico[]): void {
    const ok = confirm(`Excluir o tópico "${(topico as any).descricao}" e todos os subtópicos?`);
    if (!ok) return;

    const idx = parentArray.indexOf(topico);
    if (idx >= 0) parentArray.splice(idx, 1);

    if (this.topicoSelecionado === topico) this.topicoSelecionado = null;

    if (this.materiaSelecionada?.id && (topico as any).id) {
      this.materiaService.excluirTopico(this.materiaSelecionada.id, (topico as any).id)
        .subscribe({
          next: () => {
            if (this.materiaSelecionada) {
              this.carregarTopicos(this.materiaSelecionada);
            }
          },
          error: (err) => {
            this.mensagemErro = this.getMensagemErroExcluirTopico(err);
          }
        });
    }
  }

  private getMensagemErroExcluirTopico(err: any): string {
    const detalhe =
      err?.error?.message ||
      err?.error?.erro ||
      err?.error?.detail ||
      '';

    if (err?.status === 409 || /revisao_topico|chave estrangeira|foreign key/i.test(detalhe)) {
      return 'Não é possível excluir este tópico porque há revisões registradas para ele. Remova as revisões antes de excluir.';
    }

    return 'Erro ao excluir o tópico.';
  }

  private converterDtoParaTopico(dto: any, nivel: number = 0): Topico {
    const filhos: Topico[] = (dto.subtopicos || []).map((sub: any) =>
      this.converterDtoParaTopico(sub, nivel + 1)
    );

    const idConvertido =
      dto.id ??
      dto.topicoId ??
      dto.subtopicoId ??
      dto.idTopico ??
      dto.idSubtopico ??
      null;

    const topico: Topico = {
      id: idConvertido,
      descricao: dto.descricao,
      ativo: dto.ativo ?? true,
      nivel,
      filhos,
      proximaRevisao: dto.proximaRevisao ?? dto.dataProximaRevisao ?? null,
      statusRevisao: dto.statusRevisao
    } as any;

    return topico;
  }

  private estaEditandoOuDigitandoTopico(): boolean {
    return this.modoTopicoGlobal && (
      (this.novoTopicoDescricao || '').trim().length > 0 ||
      this.modoEdicaoTopico
    );
  }

  private podeMudarContextoTopico(): boolean {
    if (!this.estaEditandoOuDigitandoTopico()) return true;

    const sair = confirm('Você está cadastrando um tópico/subtópico. Deseja sair sem salvar?');

    if (sair) {
      this.novoTopicoDescricao = '';
      this.modoEdicaoTopico = false;
      this.topicoEmEdicao = null;
      this.topicoSelecionado = null;
    }

    return sair;
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

  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const dia = Number(diaStr);

    const data = new Date(ano, mes - 1, dia);
    data.setHours(0, 0, 0, 0);
    return data;
  }

  // (mantive o import do firstValueFrom porque você já tinha e pode usar em outras partes)
  private async salvarTopicoAutomaticoAsync(topico: Topico, pai?: Topico): Promise<void> {
    if (!this.materiaSelecionada?.id) throw new Error('Matéria não selecionada.');

    const payload: any = {
      id: (topico as any).id ?? null,
      descricao: (topico as any).descricao,
      ativo: (topico as any).ativo
    };

    if (pai && (pai as any).id) {
      payload.topicoPaiId = (pai as any).id;
    }

    const salvo: any = await firstValueFrom(
      this.materiaService.salvarTopico(this.materiaSelecionada.id, payload)
    );

    if (salvo && (salvo as any).id) {
      (topico as any).id = (salvo as any).id;
    }
  }

  get previewEdital(): MateriaImport[] {
  return this.parseEditalParaMaterias(this.textoEdital);
}

abrirModalImportarEdital(): void {
  this.mostrarModalEdital = true;
  this.textoEdital = '';
}

fecharModalImportarEdital(): void {
  this.mostrarModalEdital = false;
  this.textoEdital = '';
}

// Conta itens na árvore (pra preview)
contarTopicosRecursivo(lista: Topico[]): number {
  let total = 0;
  for (const t of (lista || [])) {
    total++;
    total += this.contarTopicosRecursivo((t as any).filhos || []);
  }
  return total;
}

// Normaliza espaços e quebras
private normalizarTextoEdital(texto: string): string {
  return (texto || '')
    .replace(/\r/g, '')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

// Divide em blocos por "NOME DA MATÉRIA:"
private splitMateriasPorTitulo(texto: string): Array<{ nome: string; conteudo: string }> {
  const s = this.normalizarTextoEdital(texto);

  // regex encontra títulos tipo: "LÍNGUA PORTUGUESA:" "NOÇÕES DE DIREITO ADMINISTRATIVO:"
  const re = /(^|\n|\s)([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\/\-\(\)\s]{3,}):/g;

  const matches: Array<{ nome: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(s)) !== null) {
    const nome = (m[2] || '').trim().replace(/\s{2,}/g, ' ');
    matches.push({ nome, start: m.index + (m[1]?.length ?? 0), end: re.lastIndex });
  }

  if (!matches.length) return [];

  const blocos: Array<{ nome: string; conteudo: string }> = [];

  for (let i = 0; i < matches.length; i++) {
    const atual = matches[i];
    const prox = matches[i + 1];

    const inicioConteudo = atual.end;
    const fimConteudo = prox ? prox.start : s.length;

    const conteudo = s.substring(inicioConteudo, fimConteudo).trim();

    if (atual.nome && conteudo) {
      blocos.push({ nome: atual.nome, conteudo });
    }
  }

  return blocos;
}

// Extrai itens numerados "1", "1.1", "3.2.1" etc
private extrairItensNumerados(conteudo: string): Array<{ num: string; desc: string }> {
  // junta linhas quebradas em espaço (edital costuma quebrar no meio)
  const texto = (conteudo || '').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const itens: Array<{ num: string; desc: string }> = [];

  // pega: "4 Domínio..." "4.1 Emprego..." etc até antes do próximo número
  const re = /(\d+(?:\.\d+)*)\s+(.+?)(?=\s+\d+(?:\.\d+)*\s+|$)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const num = (m[1] || '').trim();
    let desc = (m[2] || '').trim();

    // limpa espaços e pontas
    desc = desc.replace(/\s{2,}/g, ' ').trim();
    if (!num || !desc) continue;

    itens.push({ num, desc });
  }

  // remove duplicadas pelo próprio número (mantém a primeira ocorrência)
  const vistos = new Set<string>();
  const saida: typeof itens = [];
  for (const it of itens) {
    if (vistos.has(it.num)) continue;
    vistos.add(it.num);
    saida.push(it);
  }

  return saida;
}

// Monta árvore usando a numeração
private montarArvorePorNumeracao(itens: Array<{ num: string; desc: string }>): Topico[] {
  const raiz: Topico[] = [];
  const map = new Map<string, Topico>(); // num -> node

  for (const it of itens) {
    const partes = it.num.split('.').filter(Boolean);
    const nivel = partes.length; // 1 = raiz, 2 = filho, ...

    const node: Topico = {
      id: undefined as any,
      descricao: it.desc as any,
      ativo: true as any,
      nivel: (nivel - 1) as any,
      filhos: [] as any
    } as any;

    map.set(it.num, node);

    if (nivel === 1) {
      // evita duplicada por descrição na raiz
      const ja = this.encontrarPorDescricao(raiz, node.descricao);
      if (!ja) raiz.push(node);
      continue;
    }

    const parentNum = partes.slice(0, -1).join('.');
    const pai = map.get(parentNum);

    if (pai) {
      (pai as any).filhos = (pai as any).filhos || [];
      // evita duplicada dentro do mesmo pai
      const ja = this.encontrarPorDescricao((pai as any).filhos, node.descricao);
      if (!ja) (pai as any).filhos.push(node);
    } else {
      // fallback: se não achou pai, joga na raiz
      const ja = this.encontrarPorDescricao(raiz, node.descricao);
      if (!ja) raiz.push(node);
    }
  }

  return raiz;
}

// Converte texto completo do edital em lista de matérias + árvore
private parseEditalParaMaterias(texto: string): MateriaImport[] {
  const blocos = this.splitMateriasPorTitulo(texto);

  const saida: MateriaImport[] = [];

  for (const b of blocos) {
    const itens = this.extrairItensNumerados(b.conteudo);
    const arvore = this.montarArvorePorNumeracao(itens);

    if (b.nome && arvore.length) {
      saida.push({ nome: b.nome, topicos: arvore });
    }
  }

  return saida;
}

// Promisifica salvar matéria
private async salvarMateriaAsync(nome: string): Promise<Materia> {
  const dto: Materia = { id: null as any, nome } as any;
  return await firstValueFrom(this.materiaService.salvarMateria(dto));
}

// ✅ Importa tudo: cria matéria e salva tópicos/subtópicos em ordem
async importarEditalCompleto(): Promise<void> {
  const materiasImport = this.parseEditalParaMaterias(this.textoEdital);

  if (!materiasImport.length) {
    alert('Não consegui identificar matérias no texto. Verifique se os títulos estão como "NOME DA MATÉRIA:".');
    return;
  }

  this.salvandoEdital = true;
  this.mensagemErro = undefined;

  const falhas: Array<{ materia: string; erro: any }> = [];
  let okCount = 0;

  try {
    // garante que lista atual está carregada
    if (!this.materias?.length) {
      const lista = await firstValueFrom(this.materiaService.listarMaterias());
      this.materias = lista || [];
    }

    for (const imp of materiasImport) {
      const nomeMateria = (imp.nome || '').trim();
      if (!nomeMateria) continue;

      try {
        // 1) cria/reusa matéria
        const existenteMateria = this.materias.find(
          m => this.normalizarTexto(m.nome) === this.normalizarTexto(nomeMateria)
        );

        let materiaFinal: Materia;

        if (existenteMateria?.id) {
          materiaFinal = existenteMateria;
        } else {
          materiaFinal = await this.salvarMateriaAsync(nomeMateria);
          this.materias.push(materiaFinal);
        }

        // 2) muda contexto para salvar tópicos nessa matéria
        this.materiaSelecionada = materiaFinal;
        this.materiaExpandida = materiaFinal;

        // 3) salva árvore (pai antes dos filhos)
        await this.salvarArvoreTopicos(imp.topicos);

        okCount++;
      } catch (err) {
        console.error('[IMPORTAR-EDITAL] Falha na matéria:', nomeMateria, err);
        falhas.push({ materia: nomeMateria, erro: err });
        // continua para a próxima matéria
        continue;
      }
    }

    // fecha modal
    this.fecharModalImportarEdital();
    this.carregarMaterias();

    if (falhas.length) {
      this.mensagemErro =
        `Importação finalizada com falhas. OK: ${okCount}. Falharam: ${falhas.length}. ` +
        `Veja o console (F12) para detalhes.`;
    }
  } catch (e) {
    console.error('[IMPORTAR-EDITAL] Erro geral:', e);
    this.mensagemErro = 'Erro ao importar edital.';
  } finally {
    this.salvandoEdital = false;
  }
}
  // ==========================
  // ✅ AÇÕES ÚNICAS (TOPBAR) - TÓPICOS
  // ==========================
  editarTopicoSelecionado(): void {
    if (!this.topicoSelecionado) return;
    this.iniciarEdicaoTopico(this.topicoSelecionado);
  }

  excluirTopicoSelecionado(): void {
    if (!this.topicoSelecionado) return;

    const parentArray = this.encontrarParentArrayDoTopico(this.topicoSelecionado, this.topicos);
    if (!parentArray) {
      // fallback seguro (não faz nada se não encontrar)
      console.warn('[TOPICO] Não encontrei parentArray do tópico selecionado.');
      return;
    }

    this.excluirTopico(this.topicoSelecionado, parentArray);
  }

  private encontrarParentArrayDoTopico(alvo: Topico, lista: Topico[]): Topico[] | null {
    if (!alvo || !lista) return null;

    // se o alvo está neste nível, o parentArray é "lista"
    if (lista.includes(alvo)) return lista;

    // senão, procura nos filhos
    for (const t of lista) {
      const filhos = (t as any).filhos || [];
      const achou = this.encontrarParentArrayDoTopico(alvo, filhos);
      if (achou) return achou;
    }

    return null;
  }


}
