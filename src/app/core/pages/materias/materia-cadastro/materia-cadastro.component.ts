import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Materia } from 'src/app/core/models/materia.model';
import { Topico } from 'src/app/core/models/topico.model';
import { MateriaService } from 'src/app/core/services/materia.service';

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

  topicoSelecionado?: Topico | null;

  carregandoMaterias = false;
  carregandoTopicos = false;
  salvando = false;
  mensagemErro?: string;

  @ViewChild('nomeMateriaInput') nomeMateriaInput!: ElementRef<HTMLInputElement>;
  @ViewChild('novoTopicoInput') novoTopicoInput!: ElementRef<HTMLInputElement>;

  constructor(
    private fb: FormBuilder,
    private materiaService: MateriaService
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
    this.materiaForm.reset();
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

  private carregarTopicos(m: Materia): void {
    if (!m.id) { return; }

    this.carregandoTopicos = true;
    this.topicos = [];
    this.topicoSelecionado = null;

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        this.topicos = lista || [];
        this.carregandoTopicos = false;
      },
      error: () => {
        this.carregandoTopicos = false;
        this.mensagemErro = 'Erro ao carregar tópicos da matéria.';
      }
    });
  }

  private existeTopicoComMesmaDescricao(lista: Topico[], descricao: string): boolean {
    const normalizada = this.normalizarTexto(descricao);
    return lista.some(t => this.normalizarTexto(t.descricao) === normalizada);
  }

  selecionarTopico(topico: Topico): void {
    this.topicoSelecionado = topico;
    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  limparTopicoSelecionado(): void {
    this.topicoSelecionado = null;
    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  // 🔹 salva APENAS o tópico recém-criado no backend
  private salvarTopicoAutomatico(topico: Topico): void {
    if (!this.materiaSelecionada?.id) {
      alert('Salve a matéria antes de adicionar tópicos.');
      this.focarNomeMateria();
      return;
    }

    // ⚠️ MUITO IMPORTANTE:
    // Monta um payload SEM o campo "nivel" (que o DTO não conhece)
    const payload: any = {
      // se o back usar id pra update futuro, já vai junto:
      id: (topico as any).id ?? null,
      descricao: topico.descricao,
      ativo: topico.ativo
      // NÃO manda "nivel" aqui!
      // NÃO manda "filhos" aqui (novo tópico sempre começa sem filhos)
    };

    this.salvando = true;
    this.materiaService.salvarTopico(this.materiaSelecionada.id, payload).subscribe({
      next: (salvo) => {
        this.salvando = false;
        this.mensagemErro = undefined;

        // sincroniza id retornado
        if (salvo && (salvo as any).id) {
          (topico as any).id = (salvo as any).id;
        }
      },
      error: () => {
        this.salvando = false;
        this.mensagemErro = 'Erro ao salvar o tópico.';
      }
    });
  }

  adicionarTopico(): void {
    const descricao = this.novoTopicoDescricao?.trim();
    if (!descricao) {
      this.focarNovoTopico();
      return;
    }

    let novo: Topico;

    // subtópico se tiver pai selecionado
    if (this.topicoSelecionado) {
      if (!this.topicoSelecionado.filhos) {
        this.topicoSelecionado.filhos = [];
      }

      if (this.existeTopicoComMesmaDescricao(this.topicoSelecionado.filhos, descricao)) {
        alert('Já existe um subtópico com esse nome nesse nível.');
        this.focarNovoTopico();
        return;
      }

      // nível só existe pro layout, não pro back
      novo = this.criarTopico(descricao, (this.topicoSelecionado as any).nivel + 1 || 1);
      this.topicoSelecionado.filhos.push(novo);
    } else {
      // tópico raiz
      if (this.existeTopicoComMesmaDescricao(this.topicos, descricao)) {
        alert('Já existe um tópico raiz com esse nome.');
        this.focarNovoTopico();
        return;
      }

      novo = this.criarTopico(descricao, 0);
      this.topicos.push(novo);
    }

    this.novoTopicoDescricao = '';
    this.focarNovoTopico();

    // ✅ salva no backend (POST /api/materias/{id}/topicos com UM TopicoDTO)
    this.salvarTopicoAutomatico(novo);
  }

  private criarTopico(descricao: string, nivel: number): Topico {
    return {
      // id será preenchido após o POST
      descricao,
      // nível só para o front (indentação)
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

    // se o back tiver endpoint de exclusão, usa aqui
    if (this.materiaSelecionada?.id && (topico as any).id) {
      this.materiaService.excluirTopico(this.materiaSelecionada.id, (topico as any).id)
        .subscribe({
          error: () => {
            this.mensagemErro = 'Erro ao excluir o tópico.';
          }
        });
    }
  }
}
