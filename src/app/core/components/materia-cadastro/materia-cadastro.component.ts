import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Materia } from 'src/app/core/models/materia.model';
import { Topico } from 'src/app/core/models/topico.model';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-materia-cadastro',
  templateUrl: './materia-cadastro.component.html',
  styleUrls: ['./materia-cadastro.component.css']
})
export class MateriaCadastroComponent implements OnInit {

  materiaForm!: FormGroup;
  submeteuMateria: boolean = false;

  // modo do campo superior
  modoTopicoGlobal: boolean = false;

  // edição de tópico
  modoEdicaoTopico: boolean = false;
  topicoEmEdicao: any | null = null;

  materias: Materia[] = [];
  materiaSelecionada?: Materia;
  materiaExpandida?: Materia | null; // matéria com tópicos visíveis

  topicos: Topico[] = [];
  novoTopicoDescricao: string = '';

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
  ) {}

  ngOnInit(): void {
    this.montarForm();
    this.carregarMaterias();
  }

  private montarForm(): void {
    this.materiaForm = this.fb.group({
      id: [null],
      nome: ['', [Validators.required, Validators.maxLength(100)]]
    });
  }

  campoInvalido(campo: string): boolean {
    const control = this.materiaForm.get(campo);
    if (!control) {
      return false;
    }
    return control.invalid && this.submeteuMateria;
  }

  // ---------- SALA DE ESTUDO ----------

  abrirSalaEstudoMateria(m: Materia): void {
    if (!m.id) {
      alert('Salve a matéria antes de entrar na sala de estudo.');
      return;
    }

    this.router.navigate(
      ['/area-restrita/sala-estudo', m.id]
    );
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
    this.materiaForm.reset({
      id: null,
      nome: ''
    });
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

  // abre/fecha a linha de tópicos da matéria e entra em modo tópico
  toggleMateria(m: Materia): void {
    if (this.materiaExpandida?.id === m.id) {
      // recolher
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

    // expandir nova matéria e entrar em modo tópico
    this.materiaExpandida = m;
    this.selecionarMateria(m);
    this.modoTopicoGlobal = true;
    this.focarNovoTopico();
  }

  // NÃO carrega o nome no input da matéria; só define contexto e carrega tópicos
  selecionarMateria(m: Materia): void {
    this.materiaForm.reset({
      id: null,
      nome: ''
    });

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

    // volta pro modo cadastro de matéria
    this.modoTopicoGlobal = false;

    this.materiaForm.reset({
      id: m.id,
      nome: m.nome
    });

    this.materiaForm.markAsPristine();
    this.materiaForm.markAsUntouched();

    this.carregarTopicos(m);
    this.focarNomeMateria();
  }

  voltarParaCadastroMateria(): void {
    this.modoTopicoGlobal = false;
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
    this.modoEdicaoTopico = false;
    this.topicoEmEdicao = null;
    this.focarNomeMateria();
  }

  iniciarEdicaoTopico(topico: any): void {
    this.modoTopicoGlobal = true; // garante que o campo está em modo tópico
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
        if (idx >= 0) {
          this.materias[idx] = salva;
        } else {
          this.materias.push(salva);
        }

        this.materiaSelecionada = salva;
        this.materiaExpandida = salva;
        this.carregarTopicos(salva);

        // limpa o form de matéria
        this.materiaForm.reset({
          id: null,
          nome: ''
        });

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
    if (!m.id) { return; }
    const ok = confirm(`Excluir a matéria "${m.nome}"?`);
    if (!ok) { return; }

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
    if (!m.id) {
      console.warn('[TOPICOS] Matéria sem ID ao tentar carregar tópicos:', m);
      return;
    }

    this.carregandoTopicos = true;
    this.topicos = [];
    this.topicoSelecionado = null;

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];

        this.topicos = listaSegura.map((dto: any) =>
          this.converterDtoParaTopico(dto, 0)
        );

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
    // se já está selecionado e clicar de novo, limpa
    if (this.topicoSelecionado === topico) {
      this.limparTopicoSelecionado();
      return;
    }

    this.modoTopicoGlobal = true; // garante que o campo está em modo tópico
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
      descricao: topico.descricao,
      ativo: topico.ativo
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

        if (this.materiaSelecionada) {
          this.carregarTopicos(this.materiaSelecionada);
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
    if (!descricao) {
      return;
    }

    if (!this.materiaSelecionada?.id) {
      alert('Selecione e salve a matéria antes de adicionar tópicos.');
      return;
    }

    // MODO EDIÇÃO
    if (this.modoEdicaoTopico && this.topicoEmEdicao) {
      this.topicoEmEdicao.descricao = descricao;
      this.salvarTopicoAutomatico(this.topicoEmEdicao);
      this.novoTopicoDescricao = '';
      this.modoEdicaoTopico = false;
      this.topicoEmEdicao = null;
      this.focarNovoTopico();
      return;
    }

    // MODO CRIAÇÃO
    const novoTopico: any = {
      id: undefined,
      descricao: descricao,
      ativo: true,
      filhos: []
    };

    if (!this.topicoSelecionado) {
      // tópico raiz da matéria
      this.topicos.push(novoTopico);
      this.salvarTopicoAutomatico(novoTopico);
    } else {
      // subtópico do tópico selecionado
      if (!this.topicoSelecionado.filhos) {
        this.topicoSelecionado.filhos = [];
      }
      this.topicoSelecionado.filhos.push(novoTopico);
      this.salvarTopicoAutomatico(novoTopico, this.topicoSelecionado);
    }

    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  excluirTopico(topico: Topico, parentArray: Topico[]): void {
    const ok = confirm(`Excluir o tópico "${topico.descricao}" e todos os subtópicos?`);
    if (!ok) { return; }

    const idx = parentArray.indexOf(topico);
    if (idx >= 0) {
      parentArray.splice(idx, 1);
    }

    if (this.topicoSelecionado === topico) {
      this.topicoSelecionado = null;
    }

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

    const topico: Topico = {
      id: dto.id,
      descricao: dto.descricao,
      ativo: dto.ativo ?? true,
      nivel,
      filhos
    };

    return topico;
  }

}
