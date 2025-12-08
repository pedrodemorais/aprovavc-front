import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Materia } from 'src/app/core/models/materia.model';
import { Topico } from 'src/app/core/models/topico.model';
import { MateriaService } from 'src/app/core/services/materia.service';
import { Router } from '@angular/router';
import { SalaEstudoService } from 'src/app/core/services/sala-estudo.service';
import { RevisaoDashboardItem } from 'src/app/core/models/RevisaoDashboardItem';

type StatusRevisao = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';

// Tópico "turbinado" com info de revisão (pra usar no semáforo)
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

  // 👇 AGORA TIPADO COM InfoRevisaoTopico (inclui materiaId)
  private revisoesPorTopico = new Map<number, InfoRevisaoTopico>();

  materiaForm!: FormGroup;
  submeteuMateria: boolean = false;

  // modo do campo superior (continua sendo usado para proteger mudanças de contexto)
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
    private salaEstudoService: SalaEstudoService
  ) {}

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

  private carregarRevisoesDashboard(): void {
    this.salaEstudoService.listarRevisoesDashboard().subscribe({
      next: (itens: RevisaoDashboardItem[]) => {
        this.revisoesPorTopico.clear();

        console.log('[DASHBOARD-REVISAO] Itens recebidos do back:', itens);
        console.log('========================================');

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        (itens || []).forEach((item, idx) => {
          if (!item.topicoId || !item.materiaId) {
            return;
          }

          const proxima: string | null =
            (item as any).proximaRevisao ||
            (item as any).dataProximaRevisao ||
            null;

          let status: StatusRevisao = 'SEM';

          if (proxima) {
            // monta a data como LOCAL, não UTC
            const dataRev = this.construirDataLocal(proxima);

            const hojeTime = hoje.getTime();
            const revTime  = dataRev.getTime();

            const hojeFlag     = revTime === hojeTime;
            const atrasadoFlag = revTime < hojeTime;

            if (atrasadoFlag)       status = 'ATRASADA';
            else if (hojeFlag)      status = 'HOJE';
            else                    status = 'FUTURA';

            console.log(`-- Item dashboard #${idx} ----------------------`);
            console.log(item);
            console.log('   topicoId:', item.topicoId);
            console.log('   proximaRevisao:', proxima);
            console.log('   hojeFlag:', hojeFlag, 'atrasadoFlag:', atrasadoFlag);
            console.log('   => status calculado:', status);
          }

          this.revisoesPorTopico.set(item.topicoId, {
            status,
            proximaRevisao: proxima,
            materiaId: item.materiaId
          });
        });

        console.log('[DASHBOARD-REVISAO] Mapa revisoesPorTopico:', this.revisoesPorTopico);
        console.log('========================================');
      },
      error: (err) => {
        console.error('[DASHBOARD-REVISAO] Erro ao carregar revisões:', err);
      }
    });
  }

  /** Status consolidado da MATÉRIA (usa o pior status entre todos os tópicos dela) */
  private getStatusRevisaoMateria(m: Materia): StatusRevisao {
    if (!m.id) {
      return 'SEM';
    }

    // 1) Se a matéria estiver EXPANDIDA, usa a árvore de tópicos da tela
    if (this.materiaExpandida && this.materiaExpandida.id === m.id && this.topicos && this.topicos.length > 0) {
      let pior: StatusRevisao = 'SEM';

      const acumulaStatus = (t: Topico) => {
        const st = this.getStatusRevisaoTopicoComFilhos(t);
        if (this.prioridadeStatus(st) > this.prioridadeStatus(pior)) {
          pior = st;
        }
        (t.filhos || []).forEach(acumulaStatus);
      };

      this.topicos.forEach(acumulaStatus);

      return pior;
    }

    // 2) Matéria FECHADA: consolida olhando o mapa de revisões por TÓPICO
    let pior: StatusRevisao = 'SEM';

    this.revisoesPorTopico.forEach((info) => {
      if (info.materiaId === m.id) {
        const st = info.status;
        if (this.prioridadeStatus(st) > this.prioridadeStatus(pior)) {
          pior = st;
        }
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

  // abre/fecha a "seleção" da matéria e entra em modo tópico
  toggleMateria(m: Materia): void {
    // Se clicar na mesma matéria (recolher)
    if (this.materiaExpandida?.id === m.id) {
      // Se está editando/digitando um tópico, confirma antes de recolher
      if (!this.podeMudarContextoTopico()) {
        return;
      }

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

    // Se vai mudar para outra matéria expandida, também pergunta
    if (!this.podeMudarContextoTopico()) {
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
    if (!this.podeMudarContextoTopico()) {
      return;
    }

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
    this.mensagemErro = undefined;

    this.materiaService.listarTopicos(m.id).subscribe({
      next: (lista) => {
        console.log('==============================');
        console.log('[TOPICOS] Resposta BRUTA do back (lista):', lista);
        console.log('==============================');

        const listaSegura = lista || [];

        this.topicos = listaSegura.map((dto: any, idx: number) => {
          console.log(`--- DTO #${idx} recebido do back ---`);
          console.log('DTO completo:', dto);
          console.log('dto.proximaRevisao:', dto.proximaRevisao);
          console.log('dto.dataProximaRevisao:', (dto as any).dataProximaRevisao);
          console.log('-----------------------------------');

          const topicoConvertido = this.converterDtoParaTopico(dto, 0);

          console.log(`>>> Tópico convertido #${idx}:`, topicoConvertido);

          return topicoConvertido;
        });

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
    // Se clicar no mesmo tópico: isso é o "desclique" permitido
    if (this.topicoSelecionado === topico) {
      // aqui o usuário conscientemente sai do contexto
      this.limparTopicoSelecionado();
      return;
    }

    // Se já tem um tópico selecionado e clicar em outro, protege o contexto
    if (this.topicoSelecionado && this.topicoSelecionado !== topico) {
      if (!this.podeMudarContextoTopico()) {
        return;
      }
    }

    this.modoTopicoGlobal = true; // garante modo tópico
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

  console.log('[SALVAR-TOPICO] Payload enviado para API:', payload);

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
  };

  return topico;
}

  iniciarCadastroTopico(materia: Materia): void {
    // se estiver digitando/alterando tópico de outra matéria, pergunta antes
    if (this.materiaSelecionada && this.materiaSelecionada.id !== materia.id) {
      if (!this.podeMudarContextoTopico()) {
        return;
      }
    }

    this.modoTopicoGlobal = true;

    // garante que a matéria esteja selecionada/expandida
    if (!this.materiaExpandida || this.materiaExpandida.id !== materia.id) {
      this.materiaExpandida = materia;
      this.selecionarMateria(materia);
    } else {
      this.materiaSelecionada = materia;
    }

    this.topicoSelecionado = null;
    this.modoEdicaoTopico = false;
    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  iniciarCadastroSubtopico(topico: Topico): void {
    // se for outro tópico e já estiver editando/digitando, protege
    if (this.topicoSelecionado && this.topicoSelecionado !== topico) {
      if (!this.podeMudarContextoTopico()) {
        return;
      }
    }

    this.modoTopicoGlobal = true;
    this.topicoSelecionado = topico;
    this.modoEdicaoTopico = false;
    this.novoTopicoDescricao = '';
    this.focarNovoTopico();
  }

  private estaEditandoOuDigitandoTopico(): boolean {
    return this.modoTopicoGlobal && (
      (this.novoTopicoDescricao || '').trim().length > 0 ||
      this.modoEdicaoTopico
    );
  }

  private podeMudarContextoTopico(): boolean {
    if (!this.estaEditandoOuDigitandoTopico()) {
      return true;
    }

    const sair = confirm(
      'Você está cadastrando um tópico/subtópico. Deseja sair sem salvar?'
    );

    if (sair) {
      // limpa o estado de edição de tópico
      this.novoTopicoDescricao = '';
      this.modoEdicaoTopico = false;
      this.topicoEmEdicao = null;
      this.topicoSelecionado = null;
    }

    return sair;
  }

  /**
   * Calcula o status da revisão do tópico (sem considerar filhos):
   * - SEM      -> nenhuma revisão cadastrada
   * - FUTURA   -> próxima revisão > hoje
   * - HOJE     -> próxima revisão == hoje
   * - ATRASADA -> próxima revisão < hoje
   */
  private getStatusRevisaoTopico(topico: Topico): StatusRevisao {
    // 1) Se vier do mapa do dashboard, prioriza
    if (topico.id && this.revisoesPorTopico.has(topico.id)) {
      return this.revisoesPorTopico.get(topico.id)!.status;
    }

    // 2) Se o próprio tópico tiver data de revisão, calcula
    if ((topico as any).proximaRevisao) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const proxima = String((topico as any).proximaRevisao);
      const dataRev = this.construirDataLocal(proxima);

      if (dataRev.getTime() < hoje.getTime())   return 'ATRASADA';
      if (dataRev.getTime() === hoje.getTime()) return 'HOJE';
      return 'FUTURA';
    }

    // 3) Sem nada
    return 'SEM';
  }

  /** Define a "força" de cada status para comparar pai x filhos */
  private prioridadeStatus(status: StatusRevisao): number {
    switch (status) {
      case 'ATRASADA': return 3; // mais "grave"
      case 'HOJE':     return 2;
      case 'FUTURA':   return 1;
      case 'SEM':
      default:         return 0;
    }
  }

  /**
   * Constrói uma data local (sem timezone) a partir de 'YYYY-MM-DD',
   * evitando o bug de o JS interpretar como UTC e mudar o dia.
   */
  private construirDataLocal(isoDate: string): Date {
    const [anoStr, mesStr, diaStr] = isoDate.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);   // 1..12
    const dia = Number(diaStr);   // 1..31

    const data = new Date(ano, mes - 1, dia); // <-- data local
    data.setHours(0, 0, 0, 0);
    return data;
  }

  /**
   * Calcula o status consolidado do tópico:
   * considera o próprio status + o de todos os filhos.
   *
   * Regra:
   * - Se QUALQUER filho estiver ATRASADA -> pai ATRASADA
   * - Senão, se tiver HOJE -> pai HOJE
   * - Senão, se tiver FUTURA -> pai FUTURA
   * - Senão -> SEM
   */
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
}
