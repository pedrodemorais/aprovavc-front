import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Materia } from '../models/materia.model';
import { Topico } from '../models/topico.model';
import { SalaEstudoService, MateriaTopicosDTO, BibliotecaFlashcardDTO, BibliotecaResumoDTO } from '../services/sala-estudo.service';

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

  flashcards: BibliotecaFlashcardDTO[] = [];
  resumosDisponiveis: BibliotecaResumoDTO[] = [];
  private buscaTimer?: any;

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
        if (this.modo === 'resumos') {
          this.carregarResumosDisponiveis();
        } else {
          this.carregarFlashcards();
        }
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
    this.recarregarLista();
  }

  trocarModo(novoModo: BibliotecaModo): void {
    if (this.modo === novoModo) {
      return;
    }
    this.modo = novoModo;
    this.recarregarLista();
  }

  onBuscaChange(): void {
    if (this.buscaTimer) {
      clearTimeout(this.buscaTimer);
    }
    this.buscaTimer = setTimeout(() => this.recarregarLista(), 350);
  }

  abrirResumo(item: BibliotecaResumoDTO): void {
    if (!item?.topicoId) return;
    const materiaId = item.materiaId;
    this.router.navigate(
      ['/area-restrita/biblioteca/resumo', item.topicoId],
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

  private carregarFlashcards(): void {
    this.flashcards = [];
    this.carregandoFlashcards = true;

    this.salaEstudoService.listarBibliotecaFlashcards({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca
    }).subscribe({
      next: (lista) => {
        this.flashcards = lista || [];
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
    this.carregandoResumos = true;

    this.salaEstudoService.listarBibliotecaResumos({
      materiaId: this.materiaSelecionadaId,
      topicoId: this.topicoSelecionadoId,
      termo: this.termoBusca
    }).subscribe({
      next: (lista) => {
        this.resumosDisponiveis = lista || [];
        this.carregandoResumos = false;
      },
      error: (err) => {
        console.error('[BIBLIOTECA] Erro ao carregar resumos:', err);
        this.carregandoResumos = false;
      }
    });
  }

  private recarregarLista(): void {
    if (this.modo === 'flashcards') {
      this.carregarFlashcards();
    } else {
      this.carregarResumosDisponiveis();
    }
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
