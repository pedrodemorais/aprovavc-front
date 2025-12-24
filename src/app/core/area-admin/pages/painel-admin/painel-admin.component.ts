import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { EditalAdminService } from '../../services/edital-admin.service';
import {
  EditalTemplateDTO,
  ClonarEditalResponseDTO,
  MateriaTemplateDTO,
  TopicoTemplateDTO,
  EstruturaTemplateDTO
} from '../../dto/edital-admin.dto';

type TopicoNode = Omit<TopicoTemplateDTO, 'id'> & {
  id?: number;
  filhos?: TopicoNode[];
  ativo?: boolean;
  nivel?: number;
};

interface MateriaImport {
  nome: string;
  topicos: TopicoNode[];
}

@Component({
  selector: 'app-painel-admin',
  templateUrl: './painel-admin.component.html',
  styleUrls: ['./painel-admin.component.css']
})
export class PainelAdminComponent implements OnInit {

  templates: EditalTemplateDTO[] = [];
  templateSelecionado: EditalTemplateDTO | null = null;

  mensagemOk = '';
  mensagemErro = '';
  ultimoStatus: number | null = null;

  // Template
  novoNome = '';
  selecionadoId: number | null = null;
  editarNome = '';

  // Clone
  cloneTemplateId: number | null = null;
  cloneNomeEdital = '';
  resultadoClone: ClonarEditalResponseDTO | null = null;

  // Materias
  materias: MateriaTemplateDTO[] = [];
  materiaSelecionadaId: number | null = null;
  materiaExpandida: MateriaTemplateDTO | null = null;
  novaMateriaNome = '';
  submeteuMateria = false;

  // Topicos
  topicos: TopicoTemplateDTO[] = [];
  topicosArvore: TopicoNode[] = [];
  topicoSelecionado: TopicoNode | null = null;
  novoTopicoDescricao = '';

  carregandoMaterias = false;
  carregandoTopicos = false;

  // Modal lote
  mostrarModalLote = false;
  textoLoteTopicos = '';
  salvandoLote = false;
  loteComoSubtopico = true;

  // Modal edital
  mostrarModalEdital = false;
  textoEdital = '';
  salvandoEdital = false;

  // Estrutura (debug)
  estruturaTemplate: EstruturaTemplateDTO | null = null;

  // Token / role (display)
  tokenPresente = false;
  roleDetectada: string | null = null;

  @ViewChild('nomeMateriaInput') nomeMateriaInput!: ElementRef<HTMLInputElement>;
  @ViewChild('novoTopicoInput') novoTopicoInput!: ElementRef<HTMLInputElement>;

  constructor(private editalAdminService: EditalAdminService) {}

  ngOnInit(): void {
    const token = this.getStoredToken();
    this.tokenPresente = !!token;
    this.roleDetectada = this.detectRoleFromToken(token);

    this.recarregar();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.mostrarModalLote) this.fecharModalLote();
    if (this.mostrarModalEdital) this.fecharModalImportarEdital();
  }

  // =========================
  // ACOES UI
  // =========================

  limparMensagens(): void {
    this.mensagemOk = '';
    this.mensagemErro = '';
    this.ultimoStatus = null;
    this.resultadoClone = null;
  }

  recarregar(): void {
    this.limparMensagens();
    this.editalAdminService.listarTemplates().subscribe({
      next: (res) => {
        this.templates = res || [];
        this.mensagemOk = `Templates carregados: ${this.templates.length}`;

        if (this.selecionadoId) {
          const found = this.templates.find(t => t.id === this.selecionadoId) || null;
          this.templateSelecionado = found;
        }
      },
      error: (err) => this.tratarErro(err, 'Falha ao listar templates (precisa ROLE_ADMIN).')
    });
  }

  selecionar(id: number): void {
    this.selecionadoId = id;
    this.templateSelecionado = this.templates.find(t => t.id === id) || null;
    this.editarNome = this.templateSelecionado?.nome || '';

    this.limparSelecaoMateria();
    this.estruturaTemplate = null;

    this.mensagemOk = `Selecionado template ID ${id}`;
    this.carregarMaterias();
  }

  preencherClone(id: number): void {
    this.cloneTemplateId = id;
    this.mensagemOk = `Template ${id} preenchido no clone`;
  }

  buscarSelecionado(): void {
    if (!this.selecionadoId) return;

    this.limparMensagens();
    this.editalAdminService.buscarTemplatePorId(this.selecionadoId).subscribe({
      next: (res) => {
        this.templateSelecionado = res;
        this.editarNome = res.nome;
        this.mensagemOk = `Template ${res.id} carregado`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao buscar template por ID.')
    });
  }

  criarTemplate(): void {
    if (!this.novoNome || !this.novoNome.trim()) {
      this.mensagemErro = 'Informe um nome para criar.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.criarTemplate({ nome: this.novoNome.trim() }).subscribe({
      next: (res) => {
        this.mensagemOk = `Criado: ID ${res.id}`;
        this.novoNome = '';
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao criar template.')
    });
  }

  atualizar(): void {
    if (!this.selecionadoId) {
      this.mensagemErro = 'Selecione um template primeiro.';
      return;
    }
    if (!this.editarNome || !this.editarNome.trim()) {
      this.mensagemErro = 'Informe um nome novo.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.atualizarTemplate(this.selecionadoId, { nome: this.editarNome.trim() }).subscribe({
      next: (res) => {
        this.templateSelecionado = res;
        this.mensagemOk = `Atualizado: ID ${res.id}`;
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao atualizar template (se estiver publicado, deve bloquear).')
    });
  }

  publicar(id: number): void {
    this.limparMensagens();
    this.editalAdminService.publicarTemplate(id).subscribe({
      next: (res) => {
        this.mensagemOk = `Publicado: ID ${res.id}`;
        if (this.selecionadoId === res.id) this.templateSelecionado = res;
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao publicar template.')
    });
  }

  excluir(id: number): void {
    const ok = confirm(`Confirma excluir o template ${id}? (se publicado, deve bloquear)`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirTemplate(id).subscribe({
      next: () => {
        this.mensagemOk = `Excluido: ID ${id}`;
        if (this.selecionadoId === id) {
          this.selecionadoId = null;
          this.templateSelecionado = null;
          this.limparSelecaoMateria();
          this.estruturaTemplate = null;
        }
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir template.')
    });
  }

  // =========================
  // MATERIAS
  // =========================

  campoMateriaInvalida(): boolean {
    return this.submeteuMateria && !this.novaMateriaNome?.trim();
  }

  limparMateriaForm(): void {
    this.novaMateriaNome = '';
    this.submeteuMateria = false;
    this.focarNomeMateria();
  }

  carregarMaterias(): void {
    if (!this.selecionadoId) return;

    this.carregandoMaterias = true;
    this.editalAdminService.listarMaterias(this.selecionadoId).subscribe({
      next: (res) => {
        this.materias = res || [];
        this.carregandoMaterias = false;
        this.mensagemOk = `Materias carregadas: ${this.materias.length}`;

        if (this.materiaSelecionadaId && !this.materias.some(m => m.id === this.materiaSelecionadaId)) {
          this.limparSelecaoMateria();
        }
      },
      error: (err) => {
        this.carregandoMaterias = false;
        this.tratarErro(err, 'Falha ao listar materias.');
      }
    });
  }

  toggleMateria(m: MateriaTemplateDTO): void {
    if (this.materiaExpandida?.id === m.id) {
      this.limparSelecaoMateria();
      return;
    }

    this.selecionarMateria(m);
  }

  private limparSelecaoMateria(): void {
    this.materiaSelecionadaId = null;
    this.materiaExpandida = null;
    this.topicos = [];
    this.topicosArvore = [];
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
  }

  selecionarMateria(m: MateriaTemplateDTO): void {
    this.materiaSelecionadaId = m.id ?? null;
    this.materiaExpandida = m;
    this.topicos = [];
    this.topicosArvore = [];
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';

    this.mensagemOk = `Materia selecionada: ${m.id}`;
    this.carregarTopicos();
  }

  criarMateria(): void {
    if (!this.selecionadoId) {
      this.mensagemErro = 'Selecione um template primeiro.';
      return;
    }

    this.submeteuMateria = true;
    if (!this.novaMateriaNome || !this.novaMateriaNome.trim()) {
      this.mensagemErro = 'Informe o nome da materia.';
      return;
    }

    const payload: any = {
      nome: this.novaMateriaNome.trim(),
      descricao: this.novaMateriaNome.trim()
    };

    this.limparMensagens();
    this.editalAdminService.criarMateria(this.selecionadoId, payload).subscribe({
      next: (res) => {
        this.mensagemOk = `Materia criada: ID ${res.id}`;
        this.novaMateriaNome = '';
        this.submeteuMateria = false;
        this.carregarMaterias();
      },
      error: (err) => this.tratarErro(err, 'Falha ao criar materia.')
    });
  }

  excluirMateria(materiaId: number): void {
    if (!this.selecionadoId) return;

    const ok = confirm(`Confirma excluir a materia ${materiaId}? (isso remove os topicos dela tambem, se o backend fizer cascade)`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirMateria(this.selecionadoId, materiaId).subscribe({
      next: () => {
        this.mensagemOk = `Materia excluida: ID ${materiaId}`;
        if (this.materiaSelecionadaId === materiaId) {
          this.limparSelecaoMateria();
        }
        this.carregarMaterias();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir materia.')
    });
  }

  // =========================
  // TOPICOS
  // =========================

  carregarTopicos(): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId) return;

    this.carregandoTopicos = true;
    this.editalAdminService.listarTopicos(this.selecionadoId, this.materiaSelecionadaId).subscribe({
      next: (res) => {
        this.topicos = res || [];
        this.topicosArvore = this.buildTopicosArvore(this.topicos);
        this.topicoSelecionado = null;
        this.carregandoTopicos = false;
        this.mensagemOk = `Topicos carregados: ${this.topicos.length}`;
      },
      error: (err) => {
        this.carregandoTopicos = false;
        this.tratarErro(err, 'Falha ao listar topicos.');
      }
    });
  }

  private buildTopicosArvore(lista: TopicoTemplateDTO[]): TopicoNode[] {
    const map = new Map<number, TopicoNode>();
    const roots: TopicoNode[] = [];

    for (const t of lista || []) {
      const id = Number(t.id);
      const node: TopicoNode = { ...t, filhos: [] };
      if (Number.isFinite(id)) {
        map.set(id, node);
      } else {
        roots.push(node);
      }
    }

    for (const node of map.values()) {
      const parentId = Number(node.topicoPaiId);
      if (Number.isFinite(parentId) && map.has(parentId)) {
        map.get(parentId)!.filhos!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  selecionarTopico(topico: TopicoNode): void {
    if (this.topicoSelecionado === topico) {
      this.limparTopicoSelecionado();
      return;
    }

    this.topicoSelecionado = topico;
    this.focarNovoTopico();
  }

  limparTopicoSelecionado(): void {
    this.topicoSelecionado = null;
  }

  criarTopico(): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId) {
      this.mensagemErro = 'Selecione um template e uma materia primeiro.';
      return;
    }

    const descricao = (this.novoTopicoDescricao || '').trim();
    if (!descricao) {
      this.mensagemErro = 'Informe o nome/descricao do topico.';
      return;
    }

    const payload: any = {
      descricao,
      ordem: 1,
      topicoPaiId: this.topicoSelecionado?.id ?? null
    };

    this.limparMensagens();
    this.editalAdminService.criarTopico(this.selecionadoId, this.materiaSelecionadaId, payload).subscribe({
      next: (res) => {
        this.mensagemOk = `Topico criado: ID ${res.id}`;
        this.novoTopicoDescricao = '';
        this.carregarTopicos();
      },
      error: (err) => this.tratarErro(err, 'Falha ao criar topico.')
    });
  }

  excluirTopicoSelecionado(): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId || !this.topicoSelecionado?.id) return;

    const texto = this.topicoSelecionado?.descricao || this.topicoSelecionado?.nome || this.topicoSelecionado?.id;
    const ok = confirm(`Confirma excluir o topico ${texto}?`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirTopico(this.selecionadoId, this.materiaSelecionadaId, this.topicoSelecionado.id).subscribe({
      next: () => {
        this.mensagemOk = `Topico excluido: ID ${this.topicoSelecionado?.id}`;
        this.topicoSelecionado = null;
        this.carregarTopicos();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir topico.')
    });
  }

  // =========================
  // MODAL LOTE
  // =========================

  abrirModalLote(): void {
    if (!this.materiaSelecionadaId) {
      alert('Selecione uma materia antes de importar topicos.');
      return;
    }

    this.mostrarModalLote = true;
    this.textoLoteTopicos = '';
    this.atualizarPreviewLote();
  }

  atualizarPreviewLote(): void {
    const texto = (this.textoLoteTopicos || '').trim();
    if (!texto) return;

    const arvore = this.parseTopicosHierarquicos(texto);
    const destino = this.topicoSelecionado ? (this.topicoSelecionado.filhos || []) : this.topicosArvore;
    this.removerDuplicadosArvore(arvore, destino);
  }

  fecharModalLote(): void {
    this.mostrarModalLote = false;
    this.textoLoteTopicos = '';
  }

  async importarTopicosEmLote(): Promise<void> {
    const texto = (this.textoLoteTopicos || '').trim();
    if (!texto) return;

    if (!this.selecionadoId || !this.materiaSelecionadaId) {
      alert('Selecione um template e uma materia antes de importar.');
      return;
    }

    this.salvandoLote = true;
    this.mensagemErro = '';

    try {
      const arvore = this.parseTopicosHierarquicos(texto);
      const paiDestino = (this.topicoSelecionado && this.loteComoSubtopico) ? this.topicoSelecionado : undefined;
      const destinoArray: TopicoNode[] = paiDestino
        ? (paiDestino.filhos || (paiDestino.filhos = []))
        : this.topicosArvore;

      await this.mesclarESalvar(destinoArray, arvore, paiDestino);

      this.fecharModalLote();
      this.novoTopicoDescricao = '';
      this.carregarTopicos();
    } catch (err) {
      this.mensagemErro = 'Erro ao importar topicos por lote.';
    } finally {
      this.salvandoLote = false;
    }
  }

  private removerDuplicadosArvore(entrada: TopicoNode[], destinoNivel: TopicoNode[]): TopicoNode[] {
    const vistos = new Set<string>();

    const filtrarNivel = (nodos: TopicoNode[], destinoAqui: TopicoNode[]): TopicoNode[] => {
      const saida: TopicoNode[] = [];

      for (const n of (nodos || [])) {
        const key = this.chaveTopico(n.descricao || n.nome || '');

        if (vistos.has(key) || (destinoAqui || []).some(d => this.chaveTopico(d.descricao || d.nome || '') === key)) {
          continue;
        }

        vistos.add(key);

        const copia: TopicoNode = {
          ...n,
          filhos: []
        };

        const filhosEntrada = (n.filhos || []) as TopicoNode[];
        const existenteNoDestino = (destinoAqui || []).find(d => this.chaveTopico(d.descricao || d.nome || '') === key);
        const destinoFilhos = existenteNoDestino?.filhos || [];

        if (filhosEntrada.length) {
          copia.filhos = filtrarNivel(filhosEntrada, destinoFilhos);
        }

        saida.push(copia);
      }

      return saida;
    };

    return filtrarNivel(entrada || [], destinoNivel || []);
  }

  private chaveTopico(descricao: string): string {
    return (descricao || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private encontrarPorDescricao(array: TopicoNode[], descricao: string): TopicoNode | undefined {
    const chave = this.chaveTopico(descricao);
    return (array || []).find(t => this.chaveTopico(t.descricao || t.nome || '') === chave);
  }

  private limparLinhaTopico(linha: string): string {
    let s = (linha || '').replace(/\r/g, '');

    s = s.replace(/^\s*([\-*•]+)\s+/, '');
    s = s.replace(/^\s*(\d+(\.\d+)*[\)\.-]?)\s+/, '');
    s = s.replace(/^\s*([IVXLCDM]+[\)\.-]?)\s+/i, '');
    s = s.replace(/^\s*([a-zA-Z][\)\.-]?)\s+/, '');

    return s.trim();
  }

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

  private parseTopicosHierarquicos(texto: string): TopicoNode[] {
    const linhasBrutas = (texto || '')
      .split('\n')
      .map(l => l.replace(/\r/g, ''))
      .filter(l => l.trim().length > 0);

    const unidade = this.detectarUnidadeIndentacao(linhasBrutas);

    const raiz: TopicoNode[] = [];
    const stack: { nivel: number; node: TopicoNode }[] = [];

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

      if (nivel <= 0) {
        const achado = this.encontrarPorDescricao(raiz, desc);
        let node: TopicoNode;

        if (achado) {
          node = achado;
          node.filhos = node.filhos || [];
        } else {
          node = {
            id: undefined as any,
            descricao: desc as any,
            ativo: true as any,
            nivel: 0 as any,
            filhos: []
          } as TopicoNode;

          raiz.push(node);
        }

        stack.length = 0;
        stack.push({ nivel: 0, node });
        continue;
      }

      while (stack.length && stack[stack.length - 1].nivel >= nivel) {
        stack.pop();
      }

      const pai = stack[stack.length - 1]?.node;
      const destino = pai ? (pai.filhos || (pai.filhos = [])) : raiz;

      const achado = this.encontrarPorDescricao(destino, desc);
      let node: TopicoNode;

      if (achado) {
        node = achado;
        node.filhos = node.filhos || [];
      } else {
        node = {
          id: undefined as any,
          descricao: desc as any,
          ativo: true as any,
          nivel: nivel as any,
          filhos: []
        } as TopicoNode;

        destino.push(node);
      }

      stack.push({ nivel, node });
    }

    return raiz;
  }

  private async salvarArvoreTopicos(nodos: TopicoNode[], pai?: TopicoNode): Promise<void> {
    for (const n of nodos) {
      await this.salvarTopicoAutomaticoPromise(n, pai);
      if ((n.filhos || []).length) {
        await this.salvarArvoreTopicos(n.filhos || [], n);
      }
    }
  }

  private salvarTopicoAutomaticoPromise(topico: TopicoNode, pai?: TopicoNode): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.selecionadoId || !this.materiaSelecionadaId) {
        reject('Materia nao selecionada.');
        return;
      }

      const payload: any = {
        descricao: topico.descricao || topico.nome,
        ordem: topico.ordem ?? 1
      };

      if (pai && pai.id) {
        payload.topicoPaiId = pai.id;
      }

      this.editalAdminService.criarTopico(this.selecionadoId, this.materiaSelecionadaId, payload).subscribe({
        next: (salvo) => {
          if (salvo && salvo.id) {
            topico.id = salvo.id;
          }
          resolve();
        },
        error: (err) => reject(err)
      });
    });
  }

  private async mesclarESalvar(destArray: TopicoNode[], incoming: TopicoNode[], pai?: TopicoNode): Promise<void> {
    for (const inc of incoming) {
      const desc = inc.descricao || inc.nome || '';

      const existente = this.encontrarPorDescricao(destArray, desc);

      if (existente) {
        existente.filhos = existente.filhos || [];
        const filhosInc: TopicoNode[] = inc.filhos || [];
        if (filhosInc.length) {
          await this.mesclarESalvar(existente.filhos || [], filhosInc, existente);
        }
        continue;
      }

      const novo: TopicoNode = {
        id: undefined as any,
        descricao: desc as any,
        ativo: (inc.ativo ?? true) as any,
        nivel: (inc.nivel ?? 0) as any,
        filhos: []
      } as TopicoNode;

      novo.filhos = (inc.filhos || []).map((f: any) => ({
        id: undefined,
        descricao: f.descricao || f.nome,
        ativo: f.ativo ?? true,
        nivel: f.nivel,
        filhos: f.filhos || []
      } as TopicoNode));

      destArray.push(novo);

      await this.salvarTopicoAutomaticoPromise(novo, pai);

      const filhosNovo: TopicoNode[] = novo.filhos || [];
      if (filhosNovo.length) {
        await this.mesclarESalvar(novo.filhos || [], filhosNovo, novo);
      }
    }
  }

  // =========================
  // MODAL EDITAL
  // =========================

  get previewEdital(): MateriaImport[] {
    return this.parseEditalParaMaterias(this.textoEdital);
  }

  abrirModalImportarEdital(): void {
    if (!this.selecionadoId) {
      alert('Selecione um template antes de importar.');
      return;
    }

    this.mostrarModalEdital = true;
    this.textoEdital = '';
  }

  fecharModalImportarEdital(): void {
    this.mostrarModalEdital = false;
    this.textoEdital = '';
  }

  contarTopicosRecursivo(lista: TopicoNode[]): number {
    let total = 0;
    for (const t of (lista || [])) {
      total++;
      total += this.contarTopicosRecursivo((t as any).filhos || []);
    }
    return total;
  }

  private normalizarTextoEdital(texto: string): string {
    return (texto || '')
      .replace(/\r/g, '')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  private splitMateriasPorTitulo(texto: string): Array<{ nome: string; conteudo: string }> {
    const s = this.normalizarTextoEdital(texto);
    const re = /(^|\n|\s)([A-Z\u00c1\u00c0\u00c2\u00c3\u00c9\u00ca\u00cd\u00d3\u00d4\u00d5\u00da\u00c70-9\/\-\(\)\s]{3,}):/g;

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

  private extrairItensNumerados(conteudo: string): Array<{ num: string; desc: string }> {
    const texto = (conteudo || '').replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const itens: Array<{ num: string; desc: string }> = [];

    const re = /(\d+(?:\.\d+)*)\s+(.+?)(?=\s+\d+(?:\.\d+)*\s+|$)/g;

    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      const num = (m[1] || '').trim();
      let desc = (m[2] || '').trim();

      desc = desc.replace(/\s{2,}/g, ' ').trim();
      if (!num || !desc) continue;

      itens.push({ num, desc });
    }

    const vistos = new Set<string>();
    const saida: typeof itens = [];
    for (const it of itens) {
      if (vistos.has(it.num)) continue;
      vistos.add(it.num);
      saida.push(it);
    }

    return saida;
  }

  private montarArvorePorNumeracao(itens: Array<{ num: string; desc: string }>): TopicoNode[] {
    const raiz: TopicoNode[] = [];
    const map = new Map<string, TopicoNode>();

    for (const it of itens) {
      const partes = it.num.split('.').filter(Boolean);
      const nivel = partes.length;

      const node: TopicoNode = {
        id: undefined as any,
        descricao: it.desc as any,
        ativo: true as any,
        nivel: (nivel - 1) as any,
        filhos: []
      } as TopicoNode;

      map.set(it.num, node);

      if (nivel === 1) {
        const ja = this.encontrarPorDescricao(raiz, node.descricao || '');
        if (!ja) raiz.push(node);
        continue;
      }

      const parentNum = partes.slice(0, -1).join('.');
      const pai = map.get(parentNum);

      if (pai) {
        pai.filhos = pai.filhos || [];
        const ja = this.encontrarPorDescricao(pai.filhos || [], node.descricao || '');
        if (!ja) (pai.filhos || []).push(node);
      } else {
        const ja = this.encontrarPorDescricao(raiz, node.descricao || '');
        if (!ja) raiz.push(node);
      }
    }

    return raiz;
  }

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

  private async criarMateriaAsync(nome: string): Promise<MateriaTemplateDTO> {
    if (!this.selecionadoId) throw new Error('Template nao selecionado.');
    return await firstValueFrom(this.editalAdminService.criarMateria(this.selecionadoId, {
      nome
    }));
  }

  async importarEditalCompleto(): Promise<void> {
    if (!this.selecionadoId) {
      alert('Selecione um template antes de importar.');
      return;
    }

    const materiasImport = this.parseEditalParaMaterias(this.textoEdital);
    if (!materiasImport.length) {
      alert('Nao consegui identificar materias no texto. Verifique se os titulos estao como "NOME DA MATERIA:".');
      return;
    }

    this.salvandoEdital = true;
    this.mensagemErro = '';

    const falhas: Array<{ materia: string; erro: any }> = [];
    let okCount = 0;

    try {
      if (!this.materias?.length) {
        this.materias = await firstValueFrom(this.editalAdminService.listarMaterias(this.selecionadoId));
      }

      for (const imp of materiasImport) {
        const nomeMateria = (imp.nome || '').trim();
        if (!nomeMateria) continue;

        try {
          const existenteMateria = this.materias.find(
            m => this.normalizarTexto(m.nome || m.descricao || '') === this.normalizarTexto(nomeMateria)
          );

          let materiaFinal: MateriaTemplateDTO;

          if (existenteMateria?.id) {
            materiaFinal = existenteMateria;
          } else {
            materiaFinal = await this.criarMateriaAsync(nomeMateria);
            this.materias.push(materiaFinal);
          }

          this.materiaSelecionadaId = materiaFinal.id ?? null;
          this.materiaExpandida = materiaFinal;

          await this.salvarArvoreTopicos(imp.topicos);

          okCount++;
        } catch (err) {
          falhas.push({ materia: nomeMateria, erro: err });
          continue;
        }
      }

      this.fecharModalImportarEdital();
      this.carregarMaterias();

      if (falhas.length) {
        this.mensagemErro =
          `Importacao finalizada com falhas. OK: ${okCount}. Falharam: ${falhas.length}. ` +
          'Veja o console (F12) para detalhes.';
      }
    } catch (e) {
      this.mensagemErro = 'Erro ao importar edital.';
    } finally {
      this.salvandoEdital = false;
    }
  }

  // =========================
  // ESTRUTURA (DEBUG)
  // =========================

  buscarEstrutura(): void {
    if (!this.selecionadoId) return;

    this.limparMensagens();
    this.editalAdminService.buscarEstrutura(this.selecionadoId).subscribe({
      next: (res) => {
        this.estruturaTemplate = res;
        this.mensagemOk = 'Estrutura carregada';
      },
      error: (err) => this.tratarErro(err, 'Falha ao buscar estrutura.')
    });
  }

  limparEstrutura(): void {
    this.estruturaTemplate = null;
    this.mensagemOk = 'Estrutura limpa';
  }

  // =========================
  // ERROS
  // =========================

  private tratarErro(err: any, fallbackMsg: string): void {
    this.mensagemOk = '';
    this.resultadoClone = null;

    if (err instanceof HttpErrorResponse) {
      this.ultimoStatus = err.status;

      const backendMsg =
        (typeof err.error === 'string' && err.error) ||
        (err.error && err.error.message) ||
        err.message;

      this.mensagemErro = `${fallbackMsg} (${err.status}) ${backendMsg ? '- ' + backendMsg : ''}`;
      return;
    }

    this.mensagemErro = `${fallbackMsg}`;
  }

  // =========================
  // TOKEN / ROLE (display)
  // =========================

  private getStoredToken(): string | null {
    const keys = ['access_token', 'token', 'accessToken', 'authToken', 'jwt', 'Authorization'];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.trim()) {
        if (v.startsWith('Bearer ')) return v.substring(7);
        return v;
      }
    }
    return null;
  }

  private detectRoleFromToken(token: string | null): string | null {
    if (!token) return null;

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payloadJson = atob(this.base64UrlToBase64(parts[1]));
      const payload = JSON.parse(payloadJson);

      const directRole = payload.role;
      if (typeof directRole === 'string') return directRole;

      const roles = payload.roles || payload.authorities;
      if (Array.isArray(roles) && roles.length) {
        if (roles.some((r: any) => typeof r === 'object' && r && 'authority' in r)) {
          return roles.map((r: any) => r.authority).filter(Boolean).join(',');
        }
        return roles.join(',');
      }

      return null;
    } catch {
      return null;
    }
  }

  private base64UrlToBase64(input: string): string {
    let str = input.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4 !== 0) str += '=';
    return str;
  }

  // =========================
  // CLONE
  // =========================

  clonar(): void {
    if (!this.cloneTemplateId) {
      this.mensagemErro = 'Informe o Template ID para clonar.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.clonarTemplateParaAluno(this.cloneTemplateId, {
      nomeEdital: this.cloneNomeEdital?.trim() ? this.cloneNomeEdital.trim() : undefined
    }).subscribe({
      next: (res) => {
        this.resultadoClone = res;
        this.mensagemOk = `Clone realizado. Edital criado: ID ${res}`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao clonar (possivel rota diferente ou permissao).')
    });
  }

  // =========================
  // HELPERS
  // =========================

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
}
