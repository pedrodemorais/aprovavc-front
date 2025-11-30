import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Materia } from 'src/app/core/models/materia.model';

@Component({
  selector: 'app-sala-estudo',
  templateUrl: './sala-estudo.component.html',
  styleUrls: ['./sala-estudo.component.css']
})
export class SalaEstudoComponent implements OnInit, OnDestroy {

  materiaId!: number;
  materia?: Materia;

  // 🔹 lista usada na tela (já com tópicos + subtópicos achatados)
  topicos: any[] = [];
  topicoSelecionado?: any | null;

  // (se quiser no futuro guardar a árvore original)
  arvoreTopicos: any[] = [];

  carregando = false;
  erro?: string;

  // modo da sala: estudar ou revisar
  modo: 'estudar' | 'revisar' = 'estudar';

  // timer
  tempoTotalSegundos = 0;
  timerAtivo = false;
  private intervalId: any;

  // anotações (depois você integra com backend)
  anotacoes: string = '';

  constructor(
    private route: ActivatedRoute,
    private materiaService: MateriaService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const idParam = params.get('materiaId') ?? params.get('id');
      this.materiaId = idParam ? Number(idParam) : 0;

      console.log('[SALA-ESTUDO] materiaId =', this.materiaId);

      if (!this.materiaId) {
        this.erro = 'Matéria não informada na rota.';
        return;
      }

      this.carregarMateria();
      this.carregarTopicos();
    });
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // ------------ Carregamento de dados ------------

  private carregarMateria(): void {
    this.carregando = true;
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.materia = lista.find(m => m.id === this.materiaId);
        this.carregando = false;

        if (!this.materia) {
          this.erro = 'Matéria não encontrada para este aluno.';
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar matéria:', err);
        this.carregando = false;
        this.erro = 'Erro ao carregar dados da matéria.';
      }
    });
  }

  /**
   * Achata a árvore de tópicos vinda do backend (com subtopicos)
   * em uma lista linear, preservando o nível para usar na tela.
   */
  private achatarArvoreTopicos(lista: any[], nivel: number = 0, acumulador: any[] = []): any[] {
    for (const dto of lista) {
      const node = {
        id: dto.id,
        descricao: dto.descricao,
        ativo: dto.ativo ?? true,
        nivel,
        materiaId: dto.materiaId,
        // guarda o dto original se precisar no futuro
        _raw: dto
      };

      acumulador.push(node);

      if (dto.subtopicos && Array.isArray(dto.subtopicos) && dto.subtopicos.length) {
        this.achatarArvoreTopicos(dto.subtopicos, nivel + 1, acumulador);
      }
    }
    return acumulador;
  }

  private carregarTopicos(): void {
    console.log('[SALA-ESTUDO] Carregando tópicos da matériaId =', this.materiaId);

    this.materiaService.listarTopicos(this.materiaId).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        console.log('[SALA-ESTUDO] DTO bruto de tópicos (árvore):', listaSegura);

        // guarda árvore original (caso use depois na UI)
        this.arvoreTopicos = listaSegura;

        // 🔹 aqui achatamos TUDO: tópicos + subtópicos numa lista só
        this.topicos = this.achatarArvoreTopicos(listaSegura, 0, []);

        console.log('[SALA-ESTUDO] Lista achatada (topicos):', this.topicos);

        if (this.topicos.length && !this.topicoSelecionado) {
          this.topicoSelecionado = this.topicos[0];
        }
      },
      error: (err) => {
        console.error('[SALA-ESTUDO] Erro ao carregar tópicos:', err);
        this.erro = 'Erro ao carregar tópicos da matéria.';
      }
    });
  }

  // ------------ Interação com tópicos ------------

  selecionarTopico(t: any): void {
    this.topicoSelecionado = t;
    console.log('[SALA-ESTUDO] Tópico selecionado:', t);
  }

  // ------------ Timer ------------

  get tempoFormatado(): string {
    const h = Math.floor(this.tempoTotalSegundos / 3600);
    const m = Math.floor((this.tempoTotalSegundos % 3600) / 60);
    const s = this.tempoTotalSegundos % 60;

    return `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private pad(v: number): string {
    return v.toString().padStart(2, '0');
  }

  toggleTimer(): void {
    if (this.timerAtivo) {
      this.timerAtivo = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    } else {
      this.timerAtivo = true;
      this.intervalId = setInterval(() => {
        this.tempoTotalSegundos++;
      }, 1000);
    }
  }

  zerarTimer(): void {
    this.tempoTotalSegundos = 0;
  }

  // ------------ Modo Estudar / Revisar ------------

  mudarModo(novoModo: 'estudar' | 'revisar'): void {
    this.modo = novoModo;
  }
}
