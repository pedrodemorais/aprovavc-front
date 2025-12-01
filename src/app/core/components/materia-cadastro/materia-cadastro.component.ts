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

  materias: Materia[] = [];
  materiaSelecionada?: Materia;

  topicos: Topico[] = [];
  novoTopicoDescricao: string = '';

  // tópico onde o subtópico será criado (se tiver seleção)
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
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // 🔹 Abrir sala de estudo POR MATÉRIA
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
    this.topicos = [];
    this.topicoSelecionado = null;
    this.focarNomeMateria();
  }

  editarMateria(m: Materia): void {
    this.materiaForm.patchValue(m);
    this.materiaSelecionada = m;
    this.topicoSelecionado = null;
    this.carregarTopicos(m);
    this.focarNomeMateria();
  }

  salvarMateria(): void {
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

    const ehNovo = !dto.id;

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
        this.carregarTopicos(salva);

        if (ehNovo) {
          this.materiaForm.reset({
            id: null,
            nome: ''
          });
        } else {
          this.materiaForm.patchValue(salva);
        }

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

  private montarArvoreTopicos(lista: Topico[]): Topico[] {
    console.log('[ARVORE] Montando árvore a partir da lista plana...');
    const mapa = new Map<number, Topico>();

    lista.forEach((t) => {
      (t as any).filhos = (t as any).filhos || [];
      if ((t as any).id != null) {
        mapa.set((t as any).id, t);
        console.log('[ARVORE] Registrando no mapa -> id=', (t as any).id, 'desc=', t.descricao);
      } else {
        console.warn('[ARVORE] Topico sem id vindo do backend:', t);
      }
    });

    const raiz: Topico[] = [];

    lista.forEach((t) => {
      const paiId = (t as any).topicoPaiId as number | null | undefined;

      if (paiId) {
        const pai = mapa.get(paiId);
        if (pai) {
          (pai as any).filhos = (pai as any).filhos || [];
          (pai as any).filhos.push(t);
          console.log(
            `[ARVORE] Vinculando filho "${t.descricao}" (id=${(t as any).id}) ao pai id=${paiId} ("${(pai as any).descricao}")`
          );
        } else {
          console.warn(
            `[ARVORE] paiId=${paiId} não encontrado no mapa. Enviando "${t.descricao}" como raiz.`
          );
          raiz.push(t);
        }
      } else {
        console.log(
          `[ARVORE] "${t.descricao}" (id=${(t as any).id}) não tem pai. Vai como raiz.`
        );
        raiz.push(t);
      }
    });

    console.log('[ARVORE] Resultado final (raiz):', raiz);
    return raiz;
  }

  private carregarTopicos(m: Materia): void {
    if (!m.id) {
      console.warn('[TOPICOS] Matéria sem ID ao tentar carregar tópicos:', m);
      return;
    }

    this.carregandoTopicos = true;
    this.topicos = [];
    this.topicoSelecionado = null;

    console.log('========================================');
    console.log('[TOPICOS] Chamando backend (árvore) para materiaId =', m.id);

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        const listaSegura = lista || [];
        console.log('[TOPICOS] DTO bruto vindo do backend:', listaSegura);

        this.topicos = listaSegura.map((dto: any) =>
          this.converterDtoParaTopico(dto, 0)
        );

        console.log('[TOPICOS] Árvore adaptada para o template (this.topicos):', this.topicos);
        this.carregandoTopicos = false;
        console.log('========================================');
      },
      error: (err) => {
        this.carregandoTopicos = false;
        this.mensagemErro = 'Erro ao carregar tópicos da matéria.';
        console.error('[TOPICOS] Erro ao carregar tópicos:', err);
        console.log('========================================');
      }
    });
  }

  private existeTopicoComMesmaDescricao(lista: Topico[], descricao: string): boolean {
    const normalizada = this.normalizarTexto(descricao);
    return lista.some(t => this.normalizarTexto(t.descricao) === normalizada);
  }

// ajuste o tipo Topico conforme o seu model
selecionarTopico(topico: any): void {
  // se já está selecionado e clicou de novo, limpa a seleção
  if (this.topicoSelecionado === topico) {
    this.limparTopicoSelecionado();
    return;
  }

  // caso contrário, seleciona o tópico normalmente
  this.topicoSelecionado = topico;

  // opcional: limpa o texto do input de novo tópico
  if (this.novoTopicoDescricao) {
    this.novoTopicoDescricao = '';
  }
}


  limparTopicoSelecionado(): void {
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
    
  }

  private salvarTopicoAutomatico(topico: Topico, pai?: Topico): void {
    if (!this.materiaSelecionada?.id) {
      alert('Salve a matéria antes de adicionar tópicos.');
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

    console.log('[SALVAR-TOPICO] Enviando payload para backend:', payload);

    this.salvando = true;
    this.materiaService.salvarTopico(this.materiaSelecionada.id, payload).subscribe({
      next: (salvo) => {
        this.salvando = false;
        console.log('[SALVAR-TOPICO] Resposta do backend:', salvo);

        if (salvo && (salvo as any).id) {
          (topico as any).id = (salvo as any).id;
        }

        if (this.materiaSelecionada) {
          console.log('[SALVAR-TOPICO] Recarregando tópicos da matéria', this.materiaSelecionada.id);
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

  // Monta o objeto do novo tópico
  const novoTopico: any = {
    id: undefined,           // o backend vai gerar
    descricao: descricao,
    ativo: true,
    filhos: []
  };

  if (!this.topicoSelecionado) {
    // ✅ Sem tópico selecionado: adiciona como TÓPICO RAIZ da matéria
    this.topicos.push(novoTopico);
  } else {
    // ✅ Com tópico selecionado: adiciona como FILHO do tópico selecionado
    if (!this.topicoSelecionado.filhos) {
      this.topicoSelecionado.filhos = [];
    }
    this.topicoSelecionado.filhos.push(novoTopico);
  }

  // ✅ Limpa apenas o texto do campo
  this.novoTopicoDescricao = '';

  // ❌ NÃO LIMPE A SELEÇÃO AQUI
  // this.topicoSelecionado = undefined;
  // this.limparTopicoSelecionado();
}


  private criarTopico(descricao: string, nivel: number): Topico {
    return {
      descricao,
      nivel,
      ativo: true,
      filhos: []
    } as Topico;
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
