import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { FlashcardDTO } from '../models/FlashcardDTO';
import { SalaEstudoService, MateriaTopicosDTO } from '../services/sala-estudo.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type BibliotecaModo = 'resumos' | 'flashcards';

@Component({
  selector: 'app-biblioteca',
  templateUrl: './biblioteca.component.html',
  styleUrls: ['./biblioteca.component.css']
})
export class BibliotecaComponent implements OnInit {
  materias: Materia[] = [];
  topicosPorMateria = new Map<number, Topico[]>();

  materiaSelecionadaId: number | null = null;
  topicoSelecionadoId: number | null = null;
  modo: BibliotecaModo = 'resumos';
  termoBusca = '';

  carregando = false;
  carregandoFlashcards = false;
  carregandoResumos = false;
  erro?: string;

  flashcards: FlashcardDTO[] = [];
  resumosDisponiveis: Array<Topico & { resumoTexto?: string }> = [];

  constructor(
    private salaEstudoService: SalaEstudoService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.carregarMaterias();
  }

  private carregarMaterias(): void {
    this.carregando = true;
    this.erro = undefined;

    this.salaEstudoService.listarMateriasParaEstudo('todas').subscribe({
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
        this.carregando = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar materias:', err);
        this.erro = 'Erro ao carregar materias.';
        this.carregando = false;
      }
    });
  }

  onMateriaChange(): void {
    this.topicoSelecionadoId = null;
    this.flashcards = [];
    this.resumosDisponiveis = [];
    this.carregandoResumos = false;
    this.termoBusca = '';
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    } else {
      this.carregarResumosDisponiveis();
    }
  }

  onTopicoChange(): void {
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    }
  }

  trocarModo(novoModo: BibliotecaModo): void {
    if (this.modo === novoModo) {
      return;
    }
    this.modo = novoModo;
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    } else {
      this.carregarResumosDisponiveis();
    }
  }

  abrirResumo(topicoId?: number | null): void {
    if (!topicoId) return;
    const materiaId = this.materiaSelecionadaId;
    this.router.navigate(
      ['/area-restrita/biblioteca/resumo', topicoId],
      { queryParams: materiaId ? { materiaId } : undefined }
    );
  }

  get topicosDisponiveis(): Topico[] {
    if (!this.materiaSelecionadaId) {
      const todas: Topico[] = [];
      this.topicosPorMateria.forEach((lista) => todas.push(...lista));
      return todas;
    }
    return this.topicosPorMateria.get(this.materiaSelecionadaId) || [];
  }

  get folhasDisponiveis(): Topico[] {
    return this.folhasTopicos(this.topicosDisponiveis);
  }

  get resumoFiltrado(): Array<Topico & { resumoTexto?: string }> {
    const termo = (this.termoBusca || '').trim().toLowerCase();
    let base = this.resumosDisponiveis;
    if (this.topicoSelecionadoId) {
      base = base.filter(t => t.id === this.topicoSelecionadoId);
    }
    if (!termo) return base;
    return base.filter((t) => {
      const desc = (t.descricao || '').toLowerCase();
      const texto = (t.resumoTexto || '').toLowerCase();
      return desc.includes(termo) || texto.includes(termo);
    });
  }

  get flashcardsFiltrados(): FlashcardDTO[] {
    const termo = (this.termoBusca || '').trim().toLowerCase();
    if (!termo) return this.flashcards;
    return (this.flashcards || []).filter((f) => {
      const frente = (f.frente || '').toLowerCase();
      const verso = (f.verso || '').toLowerCase();
      const tags = (f.tags || '').toLowerCase();
      return frente.includes(termo) || verso.includes(termo) || tags.includes(termo);
    });
  }

  private carregarFlashcards(): void {
    this.flashcards = [];

    this.carregandoFlashcards = true;
    const topicos = this.folhasTopicos(this.topicosDisponiveis);

    const topicoId = this.topicoSelecionadoId;
    if (topicoId) {
      this.salaEstudoService.listarFlashcardsPorTopico(topicoId).subscribe({
        next: (lista) => {
          this.flashcards = lista || [];
          this.carregandoFlashcards = false;
        },
        error: (err) => {
          console.error('[BIBLIOTECA] Erro ao carregar flashcards:', err);
          this.carregandoFlashcards = false;
        }
      });
      return;
    }

    const requisicoes = topicos
      .map((t) => t.id)
      .filter((id): id is number => Number.isFinite(id))
      .map((id) =>
        this.salaEstudoService.listarFlashcardsPorTopico(id).pipe(catchError(() => of([])))
      );

    if (!requisicoes.length) {
      this.carregandoFlashcards = false;
      return;
    }

    forkJoin(requisicoes).subscribe({
      next: (listas) => {
        this.flashcards = (listas || []).flat();
        this.carregandoFlashcards = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar flashcards:', err);
        this.carregandoFlashcards = false;
      }
    });
  }

  private carregarResumosDisponiveis(): void {
    this.resumosDisponiveis = [];

    const folhas = this.folhasTopicos(this.topicosDisponiveis)
      .filter((t) => Number.isFinite(t.id)) as Topico[];

    if (!folhas.length) {
      return;
    }

    this.carregandoResumos = true;

    const requisicoes = folhas.map((t) =>
      this.salaEstudoService.buscarAnotacoes(t.id as number).pipe(
        map((resp) => this.extrairResumo(resp?.anotacoes)),
        catchError(() => of({ hasResumo: false, texto: '' }))
      )
    );

    forkJoin(requisicoes).subscribe({
      next: (infos) => {
        this.resumosDisponiveis = folhas
          .map((t, idx) => ({ ...t, resumoTexto: infos[idx]?.texto || '' }))
          .filter((_, idx) => !!infos[idx]?.hasResumo);
        this.carregandoResumos = false;
      },
      error: () => {
        this.carregandoResumos = false;
      }
    });
  }

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

  private extrairResumo(anotacoes?: string | null): { hasResumo: boolean; texto: string } {
    const raw = String(anotacoes || '');
    const semTags = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const texto = semTags.replace(/\s+/g, ' ').trim();
    return { hasResumo: texto.length > 0, texto };
  }

  private converterDtoParaTopico(dto: any, nivel: number = 0): Topico {
    const idRaw =
      dto?.id ??
      dto?.topicoId ??
      dto?.subtopicoId ??
      dto?.idTopico ??
      dto?.idSubtopico ??
      null;

    const id = Number(idRaw);
    const idConvertido = Number.isFinite(id) && id > 0 ? id : undefined;

    const filhos: Topico[] = (dto?.subtopicos || []).map((sub: any) =>
      this.converterDtoParaTopico(sub, nivel + 1)
    );

    return {
      id: idConvertido,
      descricao: dto?.descricao,
      ativo: dto?.ativo ?? true,
      nivel,
      filhos,
      proximaRevisao: dto?.proximaRevisao ?? dto?.dataProximaRevisao ?? null,
      statusRevisao: dto?.statusRevisao
    };
  }
}
