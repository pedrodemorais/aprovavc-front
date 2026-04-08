import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { MateriaExclusaoPreview, MateriaService } from '../services/materia.service';
import { SalaEstudoService } from '../services/sala-estudo.service';
import { RevisaoDashboardItem } from '../models/RevisaoDashboardItem';
import { TreeNode } from 'primeng/api';

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

type CadastroTreeRow = {
  tipo: 'MATERIA' | 'TOPICO';
  id: number;
  materiaId?: number;
  label: string;
  temp?: boolean;
};

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
  treeNodes: TreeNode[] = [];
  selectedTreeNode: TreeNode | TreeNode[] | null = null;
  get currentTreeNode(): TreeNode | null {
    return Array.isArray(this.selectedTreeNode) ? this.selectedTreeNode[0] : this.selectedTreeNode;
  }
  editingNodeKey: string | null = null;
  editingLabel: string = '';
  treeLoading = false;
  private tempNodeId = -1;
  nomeMateriaFocado = false;
  arvoreExpandida = false;

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
    const desc = this.limparDescricaoTopico(String((topico as any).descricao || ''));
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

  onNomeMateriaFocus(): void {
    this.nomeMateriaFocado = true;
  }

  onNomeMateriaBlur(): void {
    this.nomeMateriaFocado = false;
  }

  deveExibirBotaoNovo(): boolean {
    const nome = (this.materiaForm?.get('nome')?.value || '').trim();
    const id = this.materiaForm?.get('id')?.value;
    return !this.nomeMateriaFocado && !nome && !id;
  }

  acaoBotaoMateria(event?: Event): void {
    if (this.deveExibirBotaoNovo()) {
      event?.preventDefault();
      this.novaMateria();
      return;
    }

    this.salvarMateria();
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
    this.treeLoading = true;

    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
        const requisicoes = (this.materias || []).map((materia) => {
          if (!materia.id) {
            return of([]);
          }
          return this.materiaService.listarTopicos(materia.id).pipe(catchError(() => of([])));
        });

        if (!requisicoes.length) {
          this.treeNodes = [];
          this.carregandoMaterias = false;
          this.treeLoading = false;
          return;
        }

        forkJoin(requisicoes).subscribe({
          next: (listas) => {
            this.treeNodes = this.buildTreeFromMaterias(this.materias, listas);
            this.carregandoMaterias = false;
            this.treeLoading = false;
          },
          error: () => {
            this.mensagemErro = 'Erro ao carregar topicos das materias.';
            this.carregandoMaterias = false;
            this.treeLoading = false;
          }
        });
      },
      error: () => {
        this.mensagemErro = 'Erro ao carregar materias.';
        this.carregandoMaterias = false;
        this.treeLoading = false;
      }
    });
  }

  private buildTreeFromMaterias(materias: Materia[], topicosPorMateria: any[][]): TreeNode[] {
    return (materias || []).map((materia, index) => {
      const materiaId = materia.id as number;
      const topicosDto = (topicosPorMateria[index] || []) as any[];
      const topicosConvertidos = topicosDto.map((dto) => this.converterDtoParaTopico(dto, 0));
      const node: TreeNode = {
        key: this.nodeKey('MATERIA', materiaId),
        data: {
          tipo: 'MATERIA',
          id: materiaId,
          label: materia.nome,
          temp: false
        } as CadastroTreeRow,
        children: [],
        expanded: this.arvoreExpandida
      };
      node.children = this.buildTopicoNodes(topicosConvertidos, materiaId, node);
      node.expanded = this.arvoreExpandida;
      this.setTreeExpanded(node.children || [], this.arvoreExpandida);
      return node;
    });
  }

  private buildTopicoNodes(topicos: Topico[], materiaId: number, parent?: TreeNode): TreeNode[] {
    return (topicos || []).map((topico) => this.toTopicoNode(topico, materiaId, parent));
  }

  private toTopicoNode(topico: Topico, materiaId: number, parent?: TreeNode): TreeNode {
    const id = (topico as any).id ?? this.nextTempId();
    const node: TreeNode = {
      key: this.nodeKey('TOPICO', id),
      data: {
        tipo: 'TOPICO',
        id,
        materiaId,
        label: this.limparDescricaoTopico(topico.descricao),
        temp: !(topico as any).id
      } as CadastroTreeRow,
      children: [],
      expanded: this.arvoreExpandida
    };
    if (parent) {
      node.parent = parent;
    }
    node.children = this.buildTopicoNodes(topico.filhos || [], materiaId, node);
    return node;
  }

  toggleArvoreExpandida(): void {
    this.arvoreExpandida = !this.arvoreExpandida;
    this.setTreeExpanded(this.treeNodes, this.arvoreExpandida);
  }

  private setTreeExpanded(nodes: TreeNode[], expanded: boolean): void {
    (nodes || []).forEach((node) => {
      node.expanded = expanded;
      if (node.children?.length) {
        this.setTreeExpanded(node.children, expanded);
      }
    });
  }

  private nodeKey(tipo: 'MATERIA' | 'TOPICO', id: number): string {
    return `${tipo}-${id}`;
  }

  private nextTempId(): number {
    this.tempNodeId -= 1;
    return this.tempNodeId;
  }

  onTreeSelect(event: any): void {
    const node = event?.node as TreeNode | undefined;
    this.selectedTreeNode = node || null;

    if (this.editingNodeKey && node?.key === this.editingNodeKey) {
      return;
    }

    this.editingNodeKey = null;
    this.editingLabel = '';

    if (node?.data?.tipo === 'MATERIA') {
      const materia = this.materias.find((m) => m.id === node.data.id);
      this.materiaSelecionada = materia;
      this.materiaExpandida = materia || null;
      this.topicoSelecionado = null;
      return;
    }

    if (node?.data?.tipo === 'TOPICO') {
      const materia = this.materias.find((m) => m.id === node.data.materiaId);
      this.materiaSelecionada = materia;
      this.materiaExpandida = materia || null;
      this.topicoSelecionado = null;
    }
  }

  iniciarEdicaoSelecionado(): void {
    if (!this.currentTreeNode?.data) return;
    this.editingNodeKey = this.currentTreeNode.key || null;
    this.editingLabel = String(this.currentTreeNode.data.label || '');
  }

  cancelarEdicao(): void {
    this.editingNodeKey = null;
    this.editingLabel = '';
  }

  confirmarEdicao(node: TreeNode): void {
    const label = (this.editingLabel || '').trim();
    if (!label || !node?.data) {
      this.cancelarEdicao();
      return;
    }

    if (node.data.tipo === 'MATERIA') {
      const payload: Materia = { id: node.data.temp ? null : node.data.id, nome: label } as any;
      this.materiaService.salvarMateria(payload).subscribe({
        next: () => {
          this.cancelarEdicao();
          this.carregarMaterias();
        },
        error: () => {
          this.mensagemErro = 'Erro ao salvar materia.';
          this.cancelarEdicao();
        }
      });
      return;
    }

    if (node.data.tipo === 'TOPICO') {
      const materiaId = node.data.materiaId as number;
      const payload: any = {
        id: node.data.temp ? null : node.data.id,
        descricao: label,
        ativo: true
      };

      const parentTopicoId = node.parent?.data?.tipo === 'TOPICO' ? node.parent.data.id : null;
      if (parentTopicoId) {
        payload.topicoPaiId = parentTopicoId;
      }

      this.materiaService.salvarTopico(materiaId, payload).subscribe({
        next: () => {
          this.cancelarEdicao();
          this.carregarMaterias();
        },
        error: () => {
          this.mensagemErro = 'Erro ao salvar topico.';
          this.cancelarEdicao();
        }
      });
    }
  }

  onTreeEditKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  acaoEditarNode(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    this.selectedTreeNode = node;
    this.iniciarEdicaoSelecionado();
  }

  acaoAdicionarNode(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    this.selectedTreeNode = node;
    if (node?.data?.tipo === 'MATERIA') {
      this.adicionarTopicoNaArvore();
      return;
    }
    if (node?.data?.tipo === 'TOPICO') {
      this.adicionarSubtopicoNaArvore();
    }
  }

  acaoExcluirNode(node: TreeNode, event?: Event): void {
    event?.stopPropagation();
    this.selectedTreeNode = node;
    this.excluirNodeSelecionado();
  }

  adicionarTopicoNaArvore(): void {
    const targetNode = this.currentTreeNode;
    if (!targetNode?.data || targetNode.data.tipo !== 'MATERIA') {
      alert('Selecione uma materia para adicionar um topico.');
      return;
    }
    const novo = this.criarTopicoTemporario(targetNode.data.id, targetNode);
    targetNode.children = targetNode.children || [];
    targetNode.children.push(novo);
    targetNode.expanded = true;
    this.selectedTreeNode = novo;
    this.editingNodeKey = novo.key || null;
    this.editingLabel = '';
  }

  adicionarSubtopicoNaArvore(): void {
    const targetNode = this.currentTreeNode;
    if (!targetNode?.data || targetNode.data.tipo !== 'TOPICO') {
      alert('Selecione um topico para adicionar um subtopico.');
      return;
    }
    const novo = this.criarTopicoTemporario(targetNode.data.materiaId, targetNode);
    targetNode.children = targetNode.children || [];
    targetNode.children.push(novo);
    targetNode.expanded = true;
    this.selectedTreeNode = novo;
    this.editingNodeKey = novo.key || null;
    this.editingLabel = '';
  }

  private criarTopicoTemporario(materiaId: number, parent?: TreeNode): TreeNode {
    const id = this.nextTempId();
    const node: TreeNode = {
      key: this.nodeKey('TOPICO', id),
      data: {
        tipo: 'TOPICO',
        id,
        materiaId,
        label: '',
        temp: true
      } as CadastroTreeRow,
      children: [],
      expanded: true,
      parent
    };
    return node;
  }

  excluirNodeSelecionado(): void {
    const node = this.currentTreeNode;
    if (!node?.data) return;

    if (node.data.tipo === 'MATERIA') {
      if (!node.data.id) return;
      this.confirmarEExcluirMateria(
        node.data.id,
        node.data.label,
        () => {
          this.selectedTreeNode = null;
          this.carregarMaterias();
        }
      );
      return;
    }

    if (node.data.tipo === 'TOPICO') {
      const ok = confirm(`Excluir o topico "${node.data.label}" e seus filhos?`);
      if (!ok) return;
      const materiaId = node.data.materiaId as number;
      if (!node.data.id) return;
      this.materiaService.excluirTopico(materiaId, node.data.id).subscribe({
        next: () => {
          this.selectedTreeNode = null;
          this.carregarMaterias();
        },
        error: (err) => {
          this.mensagemErro = this.getMensagemErroExcluirTopico(err);
        }
      });
    }
  }

  onNodeDrop(event: any): void {
    const dragNode = event?.dragNode as TreeNode | undefined;
    const dropNode = event?.dropNode as TreeNode | undefined;
    const dropPosition = event?.dropPosition as string | undefined;
    if (!dragNode?.data || dragNode.data.tipo !== 'TOPICO') {
      this.carregarMaterias();
      return;
    }

    const origemMateriaId = dragNode.data.materiaId as number;
    const destinoMateriaId = dropNode?.data?.tipo === 'MATERIA'
      ? dropNode.data.id
      : dropNode?.data?.materiaId;

    if (!destinoMateriaId || destinoMateriaId !== origemMateriaId) {
      alert('Nao e possivel mover topicos entre materias.');
      this.carregarMaterias();
      return;
    }

    let novoPaiId: number | null = null;
    if (dropPosition === 'inside') {
      if (dropNode?.data?.tipo === 'TOPICO') {
        novoPaiId = dropNode.data.id;
      }
    } else {
      const parentNode = dropNode?.parent as TreeNode | undefined;
      if (parentNode?.data?.tipo === 'TOPICO') {
        novoPaiId = parentNode.data.id;
      }
    }

    const payload: any = {
      id: dragNode.data.id,
      descricao: dragNode.data.label,
      ativo: true
    };
    if (novoPaiId) {
      payload.topicoPaiId = novoPaiId;
    }

    this.materiaService.salvarTopico(origemMateriaId, payload).subscribe({
      next: () => this.carregarMaterias(),
      error: () => {
        this.mensagemErro = 'Erro ao mover topico.';
        this.carregarMaterias();
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
        this.carregarMaterias();

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
    this.confirmarEExcluirMateria(
      m.id,
      m.nome,
      () => {
        this.materias = this.materias.filter(x => x.id !== m.id);
        this.carregarMaterias();

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
      }
    );
  }

  private confirmarEExcluirMateria(
    materiaId: number,
    nomeFallback?: string,
    onSucesso?: () => void
  ): void {
    this.materiaService.excluirMateriaPreview(materiaId).subscribe({
      next: (preview) => {
        const mensagem = this.montarMensagemExclusao(preview, nomeFallback);
        const ok = confirm(mensagem);
        if (!ok) return;

        this.materiaService.excluirMateria(materiaId).subscribe({
          next: () => {
            onSucesso?.();
          },
          error: () => {
            this.mensagemErro = 'Não foi possível excluir a matéria.';
            this.focarNomeMateria();
          }
        });
      },
      error: () => {
        this.mensagemErro = 'Não foi possível carregar o resumo da exclusão.';
        this.focarNomeMateria();
      }
    });
  }

  private montarMensagemExclusao(preview: MateriaExclusaoPreview, nomeFallback?: string): string {
    const nome = preview?.materiaNome || nomeFallback || 'matéria';
    const linhas = [
      `Excluir a matéria "${nome}"?`,
      'Essa ação remove:',
      `- ${preview?.totalTopicos ?? 0} tópicos`,
      `- ${preview?.totalTopicosFinalizados ?? 0} tópicos finalizados`,
      `- ${preview?.totalRevisoesTopico ?? 0} revisões de tópicos`,
      `- ${preview?.totalEstudosTopico ?? 0} estudos de tópicos`,
      `- ${preview?.totalAnotacoesTopico ?? 0} anotações de tópicos`,
      `- ${preview?.totalFlashcards ?? 0} flashcards`,
      `- ${preview?.totalRevisoesFlashcard ?? 0} revisões de flashcards`,
      `- ${preview?.totalVinculosEditalMateria ?? 0} vínculos com editais (matéria)`,
      `- ${preview?.totalVinculosEditalTopico ?? 0} vínculos com editais (tópico)`,
      '',
      'Essa ação é irreversível. Deseja continuar?'
    ];
    return linhas.join('\n');
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
      descricao: this.limparDescricaoTopico(dto.descricao),
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
// Limpa bullets/tracos no inicio do topico
limparDescricaoTopico(descricao: string): string {
  return (descricao || '')
    .replace(/^[\s\u00A0]*[\-–—•·\u2010\u2011\u2212\u2022\u00B7]+[\s\u00A0]*/g, '')
    .trim();
}

private limparArvoreTopicos(lista: Topico[]): void {
  for (const t of (lista || [])) {
    (t as any).descricao = this.limparDescricaoTopico(String((t as any).descricao || ''));
    if ((t as any).filhos?.length) {
      this.limparArvoreTopicos((t as any).filhos);
    }
  }
}

private normalizarTextoEdital(texto: string): string {
  const linhas = (texto || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((linha) =>
      linha
        .replace(/\t+\s*\d+\s*$/g, '')
        .replace(/\t+/g, ' ')
        .trimEnd()
    );
  return linhas
    .join('\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

// Divide em blocos por "NOME DA MATÉRIA:"
private splitMateriasPorTitulo(texto: string): Array<{ nome: string; conteudo: string }> {
  const s = this.normalizarTextoEdital(texto);
  const linhas = s.split('\n');
  const indices: Array<{ nome: string; linha: number }> = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const raw = (linhas[i] || '').trim();
    if (!raw) continue;
    const nomeMateriaMatch = raw.match(/^(?:NOME\s+DA\s+MATERIA|NOME\s+DA\s+MATÉRIA|MATERIA|MATÉRIA|DISCIPLINA)\s*[:\-–]\s*(.+)$/i);
    if (nomeMateriaMatch) {
      const nome = nomeMateriaMatch[1].trim();
      if (nome) {
        indices.push({ nome, linha: i });
      }
      continue;
    }
    const chapterMatch = raw.match(/^Chapter\s+(\d+)\s*[:\-–]\s*(.+)$/i);
    if (chapterMatch) {
      const numero = chapterMatch[1];
      const titulo = chapterMatch[2].trim();
      indices.push({ nome: `Chapter ${numero} - ${titulo}`, linha: i });
      continue;
    }
    if (raw.endsWith(':') && raw === raw.toUpperCase()) {
      const nome = raw.slice(0, -1).trim();
      if (nome.length >= 3) {
        indices.push({ nome, linha: i });
      }
    }
  }
  if (!indices.length) return [];
  const blocos: Array<{ nome: string; conteudo: string }> = [];
  for (let i = 0; i < indices.length; i += 1) {
    const atual = indices[i];
    const prox = indices[i + 1];
    const inicio = atual.linha + 1;
    const fim = prox ? prox.linha : linhas.length;
    const conteudo = linhas.slice(inicio, fim).join('\n').trim();
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
    let arvore: Topico[] = [];
    if (itens.length) {
      arvore = this.montarArvorePorNumeracao(itens);
    } else {
      const linhas = b.conteudo
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean);

      const modulos: Topico[] = [];
      const modRe = /^(M[ÓO]DULO|MODULO|UNIDADE|BLOCO|PARTE|CAP[IÍ]TULO|CAPITULO)\s*(\d+)?\s*(?:[-–:]\s*(.+))?$/i;
      let atualModulo: Topico | null = null;

      for (const linha of linhas) {
        const m = linha.match(modRe);
        if (m) {
          let titulo = (m[3] || linha).trim();
          if (!m[3]) {
            titulo = titulo.replace(/^(M[ÓO]DULO|MODULO|UNIDADE|BLOCO|PARTE|CAP[IÍ]TULO|CAPITULO)\s*\d*\s*[-–:]\s*/i, '');
          }
          titulo = titulo.replace(/^[\-–—:]\s*/g, '').trim();
          const modulo: Topico = {
            id: undefined as any,
            descricao: titulo as any,
            ativo: true as any,
            nivel: 0 as any,
            filhos: [] as any
          } as any;
          atualModulo = modulo;
          modulos.push(modulo);
          continue;
        }

        const desc = linha.trim().replace(/^[\-–—•·]\s*/g, '');
        if (!desc) continue;

        if (atualModulo) {
          (atualModulo as any).filhos = (atualModulo as any).filhos || [];
          (atualModulo as any).filhos.push({
            id: undefined as any,
            descricao: desc as any,
            ativo: true as any,
            nivel: 1 as any,
            filhos: [] as any
          } as any);
        } else {
          modulos.push({
            id: undefined as any,
            descricao: desc as any,
            ativo: true as any,
            nivel: 0 as any,
            filhos: [] as any
          } as any);
        }
      }

      arvore = modulos;
    }

    if (b.nome && arvore.length) {
      this.limparArvoreTopicos(arvore);
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

async importarEditalCompleto(): Promise<void> {
  const materiasImport = this.parseEditalParaMaterias(this.textoEdital);

  if (!materiasImport.length) {
    alert("Nao consegui identificar materias no texto. Verifique se os titulos estao como \"NOME DA MATERIA:\" ou \"Chapter X: Titulo\".");
    return;
  }

  this.salvandoEdital = true;
  this.mensagemErro = undefined;

  const falhas: Array<{ materia: string; erro: any }> = [];
  let okCount = 0;

  try {
    const nomeMateriaForm = (this.materiaForm?.get('nome')?.value || "").trim();
    if (!this.materias?.length) {
      const lista = await firstValueFrom(this.materiaService.listarMaterias());
      this.materias = lista || [];
    }
    if (nomeMateriaForm) {
      let materiaBase = this.materiaSelecionada;
      if (!materiaBase && nomeMateriaForm) {
        const existenteMateria = (this.materias || []).find(
          m => this.normalizarTexto(m.nome) === this.normalizarTexto(nomeMateriaForm)
        );
        if (existenteMateria?.id) {
          materiaBase = existenteMateria;
        } else {
          materiaBase = await this.salvarMateriaAsync(nomeMateriaForm);
          this.materias = this.materias || [];
          this.materias.push(materiaBase);
        }
        this.materiaSelecionada = materiaBase;
      }
      if (!materiaBase) {
        this.mensagemErro = "Informe o nome da materia ou selecione uma materia.";
        return;
      }
      this.materiaExpandida = materiaBase;

      const topicosRaiz: Topico[] = materiasImport
        .map((imp) => ({
          id: undefined as any,
          descricao: (imp.nome || "").trim(),
          ativo: true as any,
          nivel: 0 as any,
          filhos: imp.topicos || []
        } as any))
        .filter((t) => !!t.descricao);

      if (!topicosRaiz.length) {
        this.mensagemErro = "Nenhum topico identificado para importar.";
        return;
      }

      try {
        await this.salvarArvoreTopicos(topicosRaiz);
        okCount = topicosRaiz.length;
      } catch (err) {
        console.error("[IMPORTAR-EDITAL] Falha na materia selecionada:", materiaBase.nome, err);
        falhas.push({ materia: materiaBase.nome, erro: err });
      }
    } else {
      // garante que lista atual esta carregada
      if (!this.materias?.length) {
        const lista = await firstValueFrom(this.materiaService.listarMaterias());
        this.materias = lista || [];
      }

      for (const imp of materiasImport) {
        const nomeMateria = (imp.nome || "").trim();
        if (!nomeMateria) continue;

        try {
          // 1) cria/reusa materia
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

          // 2) muda contexto para salvar topicos nessa materia
          this.materiaSelecionada = materiaFinal;
          this.materiaExpandida = materiaFinal;

          // 3) salva arvore (pai antes dos filhos)
          await this.salvarArvoreTopicos(imp.topicos);

          okCount++;
        } catch (err) {
          console.error("[IMPORTAR-EDITAL] Falha na materia:", nomeMateria, err);
          falhas.push({ materia: nomeMateria, erro: err });
          // continua para a proxima materia
          continue;
        }
      }
    }

    // fecha modal
    this.fecharModalImportarEdital();
    this.carregarMaterias();

    if (falhas.length) {
      this.mensagemErro =
        `Importacao finalizada com falhas. OK: ${okCount}. Falharam: ${falhas.length}. ` +
        `Veja o console (F12) para detalhes.`;
    }
  } catch (e) {
    console.error("[IMPORTAR-EDITAL] Erro geral:", e);
    this.mensagemErro = "Erro ao importar edital.";
  } finally {
    this.salvandoEdital = false;
  }
}


// ✅ Importa tudo: cria matéria e salva tópicos/subtópicos em ordem

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














