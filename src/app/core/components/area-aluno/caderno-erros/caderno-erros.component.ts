import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from '../services/materia.service';
import {
  CadernoErro,
  CadernoErroFonte,
  CadernoErroPayload,
  CadernoErroStatus,
  CadernoErrosService,
  TopicoArvoreNode
} from '../services/caderno-erros.service';

type TopicoFlatNode = {
  id: number;
  descricao: string;
  parentId: number | null;
  nivel: number;
  hasFilhos: boolean;
  ativo: boolean;
};

@Component({
  selector: 'app-caderno-erros',
  templateUrl: './caderno-erros.component.html',
  styleUrls: ['./caderno-erros.component.css']
})
export class CadernoErrosComponent implements OnInit {
  carregando = false;
  salvando = false;
  erro?: string;
  modoTela: 'cadastro' | 'revisao' = 'cadastro';
  indiceRevisao = 0;
  mostrarRespostaRevisao = false;

  materias: any[] = [];
  topicosFlat: TopicoFlatNode[] = [];
  topicosPrincipais: TopicoFlatNode[] = [];
  subtopicosOpcoes: TopicoFlatNode[] = [];

  itens: CadernoErro[] = [];
  totalItens = 0;
  pagina = 0;
  tamanhoPagina = 20;

  filtros: {
    materiaId: number | null;
    topicoId: number | null;
    subtopicoId: number | null;
    status: CadernoErroStatus | '';
    busca: string;
  } = {
    materiaId: null,
    topicoId: null,
    subtopicoId: null,
    status: '',
    busca: ''
  };

  form: {
    id: number | null;
    materiaId: number | null;
    topicoId: number | null;
    subtopicoId: number | null;
    titulo: string;
    descricaoErro: string;
    causaRaiz: string;
    correcao: string;
    fonte: CadernoErroFonte;
    dataErro: string;
    tagsTexto: string;
    questaoId: number | null;
    simuladoId: number | null;
    tentativaId: number | null;
  } = this.novoForm();

  get emEdicao(): boolean {
    return !!this.form.id;
  }

  get emModoRevisao(): boolean {
    return this.modoTela === 'revisao';
  }

  get itensParaRevisao(): CadernoErro[] {
    const naoDominados = (this.itens || []).filter((item) => item.status !== 'DOMINADO');
    return naoDominados.length ? naoDominados : (this.itens || []);
  }

  get itemRevisaoAtual(): CadernoErro | null {
    const fila = this.itensParaRevisao;
    if (!fila.length) return null;
    const idx = Math.min(Math.max(this.indiceRevisao, 0), fila.length - 1);
    return fila[idx] || null;
  }

  constructor(
    private readonly cadernoErrosService: CadernoErrosService,
    private readonly materiaService: MateriaService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.carregarMaterias();

    this.route.queryParamMap.subscribe((params) => {
      const modoParam = (params.get('modo') || params.get('modoCaderno') || '').toLowerCase();
      this.modoTela = modoParam === 'revisar' ? 'revisao' : 'cadastro';

      const materiaId = Number(params.get('materiaId'));
      const topicoId = Number(params.get('topicoId'));
      const subtopicoId = Number(params.get('subtopicoId'));
      if (Number.isFinite(materiaId) && materiaId > 0) {
        this.form.materiaId = materiaId;
        this.filtros.materiaId = materiaId;
        this.filtros.topicoId = Number.isFinite(topicoId) && topicoId > 0 ? topicoId : null;
        this.filtros.subtopicoId = Number.isFinite(subtopicoId) && subtopicoId > 0 ? subtopicoId : null;
        this.onMateriaChange(
          true,
          Number.isFinite(topicoId) && topicoId > 0 ? topicoId : undefined,
          Number.isFinite(subtopicoId) && subtopicoId > 0 ? subtopicoId : undefined
        );
      } else {
        this.carregarLista();
      }
    });
  }

  carregarMaterias(): void {
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materias = lista || [];
      },
      error: () => {
        this.erro = 'NÃ£o foi possÃ­vel carregar matÃ©rias.';
      }
    });
  }

  carregarLista(): void {
    this.carregando = true;
    this.erro = undefined;

    this.cadernoErrosService.listar({
      page: this.pagina,
      size: this.tamanhoPagina,
      sort: 'dataErro,desc',
      materiaId: this.filtros.materiaId,
      topicoId: this.filtros.topicoId,
      subtopicoId: this.filtros.subtopicoId,
      status: this.filtros.status,
      busca: this.filtros.busca?.trim() || undefined
    }).subscribe({
      next: (resp) => {
        this.itens = resp?.content || [];
        this.totalItens = resp?.totalElements || 0;
        this.pagina = resp?.number ?? this.pagina;
        this.ajustarIndiceRevisao();
      },
      error: () => {
        this.erro = 'NÃ£o foi possÃ­vel carregar o caderno de erros.';
      }
    }).add(() => {
      this.carregando = false;
    });
  }

  limparFiltros(): void {
    this.filtros = {
      materiaId: null,
      topicoId: null,
      subtopicoId: null,
      status: '',
      busca: ''
    };
    this.pagina = 0;
    this.carregarLista();
  }

  onFiltroMateriaChange(): void {
    this.filtros.topicoId = null;
    this.filtros.subtopicoId = null;
    this.pagina = 0;
    this.carregarLista();
  }

  onFiltroTopicoChange(): void {
    this.filtros.subtopicoId = null;
    this.pagina = 0;
    this.carregarLista();
  }

  onPage(delta: number): void {
    const nova = this.pagina + delta;
    if (nova < 0) return;
    const max = Math.max(0, Math.ceil(this.totalItens / this.tamanhoPagina) - 1);
    if (nova > max) return;
    this.pagina = nova;
    this.carregarLista();
  }

  novo(): void {
    this.form = this.novoForm(this.form.materiaId || undefined);
    if (this.form.materiaId) {
      this.onMateriaChange(false);
    }
  }

  editar(item: CadernoErro): void {
    const tagsTexto = (item.tags || []).join(', ');
    this.form = {
      id: item.id,
      materiaId: item.materiaId,
      topicoId: item.topicoId,
      subtopicoId: item.subtopicoId ?? null,
      titulo: item.titulo || '',
      descricaoErro: item.descricaoErro || '',
      causaRaiz: item.causaRaiz || '',
      correcao: item.correcao || '',
      fonte: item.fonte || 'MANUAL',
      dataErro: item.dataErro || this.hojeISO(),
      tagsTexto,
      questaoId: item.questaoId ?? null,
      simuladoId: item.simuladoId ?? null,
      tentativaId: item.tentativaId ?? null
    };
    this.onMateriaChange(false);
  }

  salvar(): void {
    if (!this.form.materiaId || !this.form.topicoId || !this.form.titulo.trim() || !this.form.descricaoErro.trim()) {
      this.erro = 'Preencha matÃ©ria, tÃ³pico, tÃ­tulo e descriÃ§Ã£o do erro.';
      return;
    }

    const payload: CadernoErroPayload = {
      materiaId: this.form.materiaId,
      topicoId: this.form.topicoId,
      subtopicoId: this.form.subtopicoId || null,
      titulo: this.form.titulo.trim(),
      descricaoErro: this.form.descricaoErro.trim(),
      causaRaiz: this.form.causaRaiz?.trim() || null,
      correcao: this.form.correcao?.trim() || null,
      fonte: this.form.fonte,
      dataErro: this.form.dataErro || this.hojeISO(),
      tags: this.parseTags(this.form.tagsTexto),
      questaoId: this.form.questaoId || null,
      simuladoId: this.form.simuladoId || null,
      tentativaId: this.form.tentativaId || null
    };

    this.salvando = true;
    this.erro = undefined;

    const req$ = this.form.id
      ? this.cadernoErrosService.atualizar(this.form.id, payload)
      : this.cadernoErrosService.criar(payload);

    req$.subscribe({
      next: () => {
        this.novo();
        this.carregarLista();
      },
      error: (err) => {
        this.erro = err?.error?.message || 'NÃ£o foi possÃ­vel salvar o registro.';
      }
    }).add(() => {
      this.salvando = false;
    });
  }

  excluir(item: CadernoErro): void {
    const ok = window.confirm('Deseja excluir este item do caderno de erros?');
    if (!ok) return;

    this.cadernoErrosService.excluir(item.id).subscribe({
      next: () => this.carregarLista(),
      error: () => {
        this.erro = 'NÃ£o foi possÃ­vel excluir.';
      }
    });
  }

  revisar(item: CadernoErro, status: 'REVISADO' | 'DOMINADO'): void {
    this.cadernoErrosService.revisar(item.id, { status }).subscribe({
      next: () => {
        this.mostrarRespostaRevisao = false;
        this.carregarLista();
      },
      error: (err) => {
        this.erro = err?.error?.message || 'NÃ£o foi possÃ­vel atualizar revisÃ£o.';
      }
    });
  }

  proximoErroRevisao(): void {
    const fila = this.itensParaRevisao;
    if (!fila.length) return;
    this.indiceRevisao = Math.min(this.indiceRevisao + 1, fila.length - 1);
    this.mostrarRespostaRevisao = false;
  }

  anteriorErroRevisao(): void {
    const fila = this.itensParaRevisao;
    if (!fila.length) return;
    this.indiceRevisao = Math.max(this.indiceRevisao - 1, 0);
    this.mostrarRespostaRevisao = false;
  }

  marcarAtualComo(status: 'REVISADO' | 'DOMINADO'): void {
    const atual = this.itemRevisaoAtual;
    if (!atual) return;
    this.revisar(atual, status);
  }

  toggleRespostaRevisao(): void {
    this.mostrarRespostaRevisao = !this.mostrarRespostaRevisao;
  }

  onMateriaChange(recarregarLista: boolean, topicoIdPreferido?: number, subtopicoIdPreferido?: number): void {
    const materiaId = this.form.materiaId;
    this.form.topicoId = null;
    this.form.subtopicoId = null;
    this.topicosFlat = [];
    this.topicosPrincipais = [];
    this.subtopicosOpcoes = [];

    if (!materiaId) {
      if (recarregarLista) this.carregarLista();
      return;
    }

    this.cadernoErrosService.listarTopicosArvore(materiaId).subscribe({
      next: (arvore) => {
        const flat = this.normalizarArvore(arvore || [], null, 0, []);
        this.topicosFlat = flat;
        this.topicosPrincipais = flat.filter((n) => !n.parentId && n.ativo !== false);

        if (topicoIdPreferido || subtopicoIdPreferido) {
          this.preselecionarTopicosPreferidos(topicoIdPreferido, subtopicoIdPreferido);
        }

        if (recarregarLista) this.carregarLista();
      },
      error: () => {
        this.erro = 'NÃ£o foi possÃ­vel carregar tÃ³picos da matÃ©ria.';
      }
    });
  }

  onTopicoChange(): void {
    const topicoId = this.form.topicoId;
    this.form.subtopicoId = null;
    this.subtopicosOpcoes = this.topicosFlat
      .filter((n) => n.parentId === topicoId && n.ativo !== false);
  }

  topicoDescricao(id?: number | null): string {
    if (!id) return '-';
    return this.topicosFlat.find((t) => t.id === id)?.descricao || String(id);
  }

  private preselecionarTopicoOuSubtopico(topicoIdRecebido: number): void {
    const achado = this.topicosFlat.find((n) => n.id === topicoIdRecebido);
    if (!achado) return;

    if (achado.parentId) {
      this.form.topicoId = achado.parentId;
      this.onTopicoChange();
      this.form.subtopicoId = achado.id;
      return;
    }

    this.form.topicoId = achado.id;
    this.onTopicoChange();
  }

  private preselecionarTopicosPreferidos(topicoIdPreferido?: number, subtopicoIdPreferido?: number): void {
    if (subtopicoIdPreferido) {
      const sub = this.topicosFlat.find((n) => n.id === subtopicoIdPreferido);
      if (sub && sub.parentId) {
        this.form.topicoId = sub.parentId;
        this.onTopicoChange();
        this.form.subtopicoId = sub.id;
        return;
      }
    }

    if (topicoIdPreferido) {
      this.preselecionarTopicoOuSubtopico(topicoIdPreferido);
    }
  }

  private normalizarArvore(
    lista: TopicoArvoreNode[],
    parentId: number | null,
    nivel: number,
    acc: TopicoFlatNode[]
  ): TopicoFlatNode[] {
    for (const item of lista || []) {
      const filhos = (item.subtopicos || item.filhos || []) as TopicoArvoreNode[];
      acc.push({
        id: item.id,
        descricao: item.descricao,
        parentId,
        nivel,
        hasFilhos: filhos.length > 0,
        ativo: item.ativo !== false
      });
      if (filhos.length) {
        this.normalizarArvore(filhos, item.id, nivel + 1, acc);
      }
    }
    return acc;
  }

  private ajustarIndiceRevisao(): void {
    const fila = this.itensParaRevisao;
    if (!fila.length) {
      this.indiceRevisao = 0;
      return;
    }
    if (this.indiceRevisao >= fila.length) {
      this.indiceRevisao = fila.length - 1;
    }
    if (this.indiceRevisao < 0) {
      this.indiceRevisao = 0;
    }
  }

  private parseTags(texto: string): string[] {
    return (texto || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => !!t)
      .slice(0, 15);
  }

  private novoForm(materiaId?: number): any {
    return {
      id: null,
      materiaId: materiaId || null,
      topicoId: null,
      subtopicoId: null,
      titulo: '',
      descricaoErro: '',
      causaRaiz: '',
      correcao: '',
      fonte: 'MANUAL' as CadernoErroFonte,
      dataErro: this.hojeISO(),
      tagsTexto: '',
      questaoId: null,
      simuladoId: null,
      tentativaId: null
    };
  }

  private hojeISO(): string {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}

