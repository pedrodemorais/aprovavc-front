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

  modoTopicoGlobal: boolean = false;

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


  /** Promisifica salvarTopico (pra salvar em sequência pai->filhos) */
  private salvarTopicoAutomaticoPromise(topico: Topico, pai?: Topico): Promise<void> {
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
          error: () => {
            this.mensagemErro = 'Erro ao excluir o tópico.';
          }
        });
    }
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
}
