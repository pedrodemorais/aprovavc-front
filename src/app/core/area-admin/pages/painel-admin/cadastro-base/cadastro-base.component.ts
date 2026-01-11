import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Table, TableFilterEvent, TableLazyLoadEvent } from 'primeng/table';
import { TreeNode } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { EditalAdminService } from '../../../services/edital-admin.service';
import { AreaDTO, CargoDTO, OrgaoDTO, PageDTO } from '../../../dto/edital-admin.dto';

@Component({
  selector: 'app-cadastro-base',
  templateUrl: './cadastro-base.component.html',
  styleUrls: ['./cadastro-base.component.css']
})
export class CadastroBaseComponent implements OnInit {

  orgaos: OrgaoDTO[] = [];
  areas: AreaDTO[] = [];
  cargos: CargoDTO[] = [];
  orgaosTotal = 0;
  areasTotal = 0;
  cargosTotal = 0;
  orgaosPage = 0;
  areasPage = 0;
  cargosPage = 0;
  orgaosSize = 20;
  areasSize = 20;
  cargosSize = 20;
  orgaosSearch = '';
  areasSearch = '';
  cargosSearch = '';
  orgaosModoConsulta = false;
  areasModoConsulta = false;
  cargosModoConsulta = false;
  orgaosLoading = false;
  areasLoading = false;
  cargosLoading = false;
  abaAtivaIndex = 0;
  orgaoArvore: TreeNode[] = [];
  orgaoArvoreSelecionada: TreeNode | TreeNode[] | null = null;
  carregandoArvoreOrgao = false;
  mostrarImportOrgaos = false;
  mostrarImportAreas = false;
  mostrarImportCargos = false;
  mostrarModalVinculoArea = false;
  mostrarModalVinculoCargo = false;
  textoImportOrgaos = '';
  textoImportAreas = '';
  textoImportCargos = '';
  termoBuscaAreaVinculo = '';
  termoBuscaCargoVinculo = '';
  importandoOrgaos = false;
  importandoAreas = false;
  importandoCargos = false;
  carregandoAreasVinculo = false;
  carregandoCargosVinculo = false;
  orgaoVinculoId: number | null = null;
  areaVinculoId: number | null = null;
  areaParaVincularId: number | null = null;
  cargoParaVincularId: number | null = null;
  areasVinculoOpcoes: AreaDTO[] = [];
  cargosVinculoOpcoes: CargoDTO[] = [];

  orgaoEditandoId: number | null = null;
  areaEditandoId: number | null = null;
  cargoEditandoId: number | null = null;
  orgaoEditandoNome = '';
  areaEditandoNome = '';
  cargoEditandoNome = '';
  orgaoSelecionadoId: number | null = null;
  areaSelecionadoId: number | null = null;
  cargoSelecionadoId: number | null = null;
  orgaoSelecionados: OrgaoDTO[] = [];
  areaSelecionados: AreaDTO[] = [];
  cargoSelecionados: CargoDTO[] = [];
  orgaoLogoCarregandoId: number | null = null;
  orgaoLogoUrl = '';
  private orgaoLogoObjectUrl = '';

  mensagemOk = '';
  mensagemErro = '';

  constructor(private editalAdminService: EditalAdminService) {}

  ngOnInit(): void {
    this.carregarOrgaos();
  }

  limparMensagens(): void {
    this.mensagemOk = '';
    this.mensagemErro = '';
  }

  private limparLogoOrgao(): void {
    if (this.orgaoLogoObjectUrl) {
      URL.revokeObjectURL(this.orgaoLogoObjectUrl);
      this.orgaoLogoObjectUrl = '';
    }
    this.orgaoLogoUrl = '';
  }

  private lerBlobComoTexto(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }

  private parseImagemResponse(texto: string): { dados?: string; contentType?: any } | null {
    const raw = (texto || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizarContentType(contentType: any): string {
    if (!contentType) return 'image/png';
    if (typeof contentType === 'string') return contentType;
    const type = contentType.type || contentType.mainType || 'image';
    const subtype = contentType.subtype || contentType.subType || 'png';
    return `${type}/${subtype}`;
  }

  abrirUploadLogoOrgao(id: number): void {
    const input = document.getElementById(`orgao-logo-${id}`) as HTMLInputElement | null;
    input?.click();
  }

  onLogoOrgaoSelecionada(orgao: OrgaoDTO, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.mensagemErro = 'Selecione um arquivo de imagem.';
      if (input) {
        input.value = '';
      }
      return;
    }

    this.limparMensagens();
    this.orgaoLogoCarregandoId = orgao.id;
    this.editalAdminService.salvarImagemOrgao(orgao.id, file).subscribe({
      next: () => {
        this.mensagemOk = 'Logo do órgão atualizada.';
        this.orgaoLogoCarregandoId = null;
        this.carregarLogoOrgao(orgao.id);
      },
      error: () => {
        this.orgaoLogoCarregandoId = null;
        this.mensagemErro = 'Falha ao salvar logo do órgão.';
      }
    });

    if (input) {
      input.value = '';
    }
  }

  private carregarLogoOrgao(orgaoId: number): void {
    this.limparLogoOrgao();
    this.editalAdminService.buscarImagemOrgaoArquivo(orgaoId).subscribe({
      next: (res) => {
        const contentType = res.headers.get('content-type') || '';
        const blob = res.body;
        if (!blob) {
          return;
        }

        if (contentType.startsWith('image/')) {
          this.orgaoLogoObjectUrl = URL.createObjectURL(blob);
          this.orgaoLogoUrl = this.orgaoLogoObjectUrl;
          return;
        }

        this.lerBlobComoTexto(blob)
          .then((texto) => {
            const payload = this.parseImagemResponse(texto);
            if (!payload?.dados) {
              return;
            }
            const tipo = this.normalizarContentType(payload.contentType);
            this.orgaoLogoUrl = `data:${tipo};base64,${payload.dados}`;
          })
          .catch(() => {
            this.limparLogoOrgao();
          });
      },
      error: () => {
        this.limparLogoOrgao();
      }
    });
  }

  onLogoOrgaoErro(): void {
    this.limparLogoOrgao();
  }

  private tratarErroCadastro(err: any, entidade: 'órgão' | 'área' | 'cargo', acao: string): void {
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.mensagemErro = `Já existe um ${entidade} com o mesmo nome.`;
      return;
    }
    this.mensagemErro = `Falha ao ${acao} ${entidade}.`;
  }

  private capitalizarNome(valor: string): string {
    return (valor || '')
      .trim()
      .split(/\s+/)
      .map((parte) => {
        if (!parte) return '';
        return parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private normalizarTexto(valor: string): string {
    return (valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private parseListaImportacao(texto: string): string[] {
    const linhas = (texto || '')
      .split(/[\r\n,]+/)
      .map((linha) => this.capitalizarNome(linha))
      .filter((linha) => !!linha);

    const vistos = new Set<string>();
    const saida: string[] = [];
    for (const linha of linhas) {
      const key = this.normalizarTexto(linha);
      if (!key || vistos.has(key)) continue;
      vistos.add(key);
      saida.push(linha);
    }
    return saida;
  }

  carregarCadastrosBase(): void {
    this.carregarOrgaos();
    this.carregarAreas();
    this.carregarCargos();
  }

  carregarOrgaos(page = this.orgaosPage, size = this.orgaosSize): void {
    this.orgaosLoading = true;
    this.orgaoSelecionados = [];
    this.orgaoArvore = [];
    this.editalAdminService.listarOrgaosPaginado(this.orgaosSearch, page, size).subscribe({
      next: (res: PageDTO<OrgaoDTO>) => {
        this.orgaos = res.content || [];
        this.orgaosTotal = res.totalElements || 0;
        this.orgaosPage = res.number || 0;
        this.orgaosSize = res.size || size;
        if (this.orgaoSelecionadoId && !this.orgaos.some((item) => item.id === this.orgaoSelecionadoId)) {
          this.orgaoSelecionadoId = null;
          this.orgaoArvore = [];
          this.limparLogoOrgao();
        }
        this.orgaosLoading = false;
      },
      error: () => {
        this.orgaosLoading = false;
        this.mensagemErro = 'Falha ao listar órgãos.';
      }
    });
  }

  salvarOrgao(): void {
    if (this.orgaoEditandoId) {
      this.atualizarOrgao();
      return;
    }
    this.criarOrgao();
  }

  private criarOrgao(): void {
    const nome = this.capitalizarNome(this.orgaoEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome do órgão.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.criarOrgao(nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Órgão criado.';
        this.orgaoEditandoId = null;
        this.orgaoEditandoNome = '';
        this.carregarOrgaos(0, this.orgaosSize);
      },
      error: (err) => this.tratarErroCadastro(err, 'órgão', 'criar')
    });
  }

  selecionarOrgaoCadastro(orgao: OrgaoDTO): void {
    this.orgaoSelecionadoId = orgao.id;
    this.orgaoEditandoId = orgao.id;
    this.orgaoEditandoNome = orgao.nome;
    this.focarFimInput('orgao', orgao.id);
  }

  limparEdicaoOrgao(): void {
    this.orgaoEditandoId = null;
    this.orgaoEditandoNome = '';
    this.orgaoSelecionadoId = null;
  }

  selecionarLinhaOrgao(orgao: OrgaoDTO): void {
    this.orgaoSelecionadoId = orgao.id;
    this.carregarArvoreOrgao(orgao.id);
    this.carregarLogoOrgao(orgao.id);
  }

  private formatarLabelArvore(valor: string): string {
    return (valor || '').trim().replace(/\s+0$/, '');
  }

  private atualizarOrgao(): void {
    if (!this.orgaoEditandoId) {
      this.mensagemErro = 'Selecione um órgão para editar.';
      return;
    }
    const nome = this.capitalizarNome(this.orgaoEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome do órgão.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.atualizarOrgao(this.orgaoEditandoId, nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Órgão atualizado.';
        this.orgaoEditandoNome = '';
        this.orgaoEditandoId = null;
        this.orgaoSelecionadoId = null;
        this.carregarOrgaos();
      },
      error: (err) => this.tratarErroCadastro(err, 'órgão', 'atualizar')
    });
  }

  excluirOrgao(orgao: OrgaoDTO): void {
    const ok = confirm(`Confirma excluir o órgão "${orgao.nome}"?`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirOrgao(orgao.id).subscribe({
      next: () => {
        this.mensagemOk = 'Órgão excluído.';
        this.orgaoSelecionados = this.orgaoSelecionados.filter((item) => item.id !== orgao.id);
        if (this.orgaoEditandoId === orgao.id) {
          this.limparEdicaoOrgao();
        }
        if (this.orgaoSelecionadoId === orgao.id) {
          this.orgaoSelecionadoId = null;
        }
        this.carregarOrgaos();
      },
      error: () => {
        this.mensagemErro = 'Falha ao excluir órgão.';
      }
    });
  }

  carregarAreas(page = this.areasPage, size = this.areasSize): void {
    this.areasLoading = true;
    this.areaSelecionados = [];
    this.editalAdminService.listarAreasPaginado(this.areasSearch, page, size).subscribe({
      next: (res: PageDTO<AreaDTO>) => {
        this.areas = res.content || [];
        this.areasTotal = res.totalElements || 0;
        this.areasPage = res.number || 0;
        this.areasSize = res.size || size;
        if (this.areaSelecionadoId && !this.areas.some((item) => item.id === this.areaSelecionadoId)) {
          this.areaSelecionadoId = null;
        }
        this.areasLoading = false;
      },
      error: () => {
        this.areasLoading = false;
        this.mensagemErro = 'Falha ao listar áreas.';
      }
    });
  }

  criarArea(): void {
    const nome = this.capitalizarNome(this.areaEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome da área.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.criarArea(nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Área criada.';
        this.areaEditandoId = null;
        this.areaEditandoNome = '';
        this.carregarAreas(0, this.areasSize);
      },
      error: (err) => this.tratarErroCadastro(err, 'área', 'criar')
    });
  }

  selecionarAreaCadastro(area: AreaDTO): void {
    this.areaSelecionadoId = area.id;
    this.areaEditandoId = area.id;
    this.areaEditandoNome = area.nome;
    this.focarFimInput('area', area.id);
  }

  limparEdicaoArea(): void {
    this.areaEditandoId = null;
    this.areaEditandoNome = '';
    this.areaSelecionadoId = null;
  }

  selecionarLinhaArea(area: AreaDTO): void {
    this.areaSelecionadoId = area.id;
  }

  private atualizarArea(): void {
    if (!this.areaEditandoId) {
      this.mensagemErro = 'Selecione uma área para editar.';
      return;
    }
    const nome = this.capitalizarNome(this.areaEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome da área.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.atualizarArea(this.areaEditandoId, nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Área atualizada.';
        this.areaEditandoNome = '';
        this.areaEditandoId = null;
        this.areaSelecionadoId = null;
        this.carregarAreas();
      },
      error: (err) => this.tratarErroCadastro(err, 'área', 'atualizar')
    });
  }

  excluirArea(area: AreaDTO): void {
    const ok = confirm(`Confirma excluir a área "${area.nome}"?`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirArea(area.id).subscribe({
      next: () => {
        this.mensagemOk = 'Área excluída.';
        this.areaSelecionados = this.areaSelecionados.filter((item) => item.id !== area.id);
        if (this.areaEditandoId === area.id) {
          this.limparEdicaoArea();
        }
        if (this.areaSelecionadoId === area.id) {
          this.areaSelecionadoId = null;
        }
        this.carregarAreas();
      },
      error: () => {
        this.mensagemErro = 'Falha ao excluir área.';
      }
    });
  }

  carregarCargos(page = this.cargosPage, size = this.cargosSize): void {
    this.cargosLoading = true;
    this.cargoSelecionados = [];
    this.editalAdminService.listarCargosPaginado(this.cargosSearch, page, size).subscribe({
      next: (res: PageDTO<CargoDTO>) => {
        this.cargos = res.content || [];
        this.cargosTotal = res.totalElements || 0;
        this.cargosPage = res.number || 0;
        this.cargosSize = res.size || size;
        if (this.cargoSelecionadoId && !this.cargos.some((item) => item.id === this.cargoSelecionadoId)) {
          this.cargoSelecionadoId = null;
        }
        this.cargosLoading = false;
      },
      error: () => {
        this.cargosLoading = false;
        this.mensagemErro = 'Falha ao listar cargos.';
      }
    });
  }

  salvarArea(): void {
    if (this.areaEditandoId) {
      this.atualizarArea();
      return;
    }
    this.criarArea();
  }

  private criarCargo(): void {
    const nome = this.capitalizarNome(this.cargoEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome do cargo.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.criarCargo(nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Cargo criado.';
        this.cargoEditandoId = null;
        this.cargoEditandoNome = '';
        this.carregarCargos(0, this.cargosSize);
      },
      error: (err) => this.tratarErroCadastro(err, 'cargo', 'criar')
    });
  }

  selecionarCargoCadastro(cargo: CargoDTO): void {
    this.cargoSelecionadoId = cargo.id;
    this.cargoEditandoId = cargo.id;
    this.cargoEditandoNome = cargo.nome;
    this.focarFimInput('cargo', cargo.id);
  }

  limparEdicaoCargo(): void {
    this.cargoEditandoId = null;
    this.cargoEditandoNome = '';
    this.cargoSelecionadoId = null;
  }

  selecionarLinhaCargo(cargo: CargoDTO): void {
    this.cargoSelecionadoId = cargo.id;
  }

  private atualizarCargo(): void {
    if (!this.cargoEditandoId) {
      this.mensagemErro = 'Selecione um cargo para editar.';
      return;
    }
    const nome = this.capitalizarNome(this.cargoEditandoNome || '');
    if (!nome) {
      this.mensagemErro = 'Informe o nome do cargo.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.atualizarCargo(this.cargoEditandoId, nome).subscribe({
      next: (res) => {
        this.mensagemOk = 'Cargo atualizado.';
        this.cargoEditandoNome = '';
        this.cargoEditandoId = null;
        this.cargoSelecionadoId = null;
        this.carregarCargos();
      },
      error: (err) => this.tratarErroCadastro(err, 'cargo', 'atualizar')
    });
  }

  excluirCargo(cargo: CargoDTO): void {
    const ok = confirm(`Confirma excluir o cargo "${cargo.nome}"?`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirCargo(cargo.id).subscribe({
      next: () => {
        this.mensagemOk = 'Cargo excluído.';
        this.cargoSelecionados = this.cargoSelecionados.filter((item) => item.id !== cargo.id);
        if (this.cargoEditandoId === cargo.id) {
          this.limparEdicaoCargo();
        }
        if (this.cargoSelecionadoId === cargo.id) {
          this.cargoSelecionadoId = null;
        }
        this.carregarCargos();
      },
      error: () => {
        this.mensagemErro = 'Falha ao excluir cargo.';
      }
    });
  }

  salvarCargo(): void {
    if (this.cargoEditandoId) {
      this.atualizarCargo();
      return;
    }
    this.criarCargo();
  }

  executarAcaoOrgao(tabela: Table): void {
    if (this.orgaosModoConsulta) {
      this.consultarOrgaos(tabela);
      return;
    }
    this.salvarOrgao();
  }

  executarAcaoArea(tabela: Table): void {
    if (this.areasModoConsulta) {
      this.consultarAreas(tabela);
      return;
    }
    this.salvarArea();
  }

  executarAcaoCargo(tabela: Table): void {
    if (this.cargosModoConsulta) {
      this.consultarCargos(tabela);
      return;
    }
    this.salvarCargo();
  }

  abrirModalVincularArea(orgao: OrgaoDTO): void {
    this.orgaoSelecionadoId = orgao.id;
    this.orgaoVinculoId = orgao.id;
    this.areaParaVincularId = null;
    this.termoBuscaAreaVinculo = '';
    this.carregarAreasVinculo();
    this.mostrarModalVinculoArea = true;
  }

  carregarAreasVinculo(): void {
    this.carregandoAreasVinculo = true;
    this.editalAdminService.listarAreasPaginado(this.termoBuscaAreaVinculo, 0, 50).subscribe({
      next: (res) => {
        this.areasVinculoOpcoes = res.content || [];
        this.carregandoAreasVinculo = false;
      },
      error: () => {
        this.mensagemErro = 'Falha ao listar áreas para vínculo.';
        this.carregandoAreasVinculo = false;
      }
    });
  }

  vincularAreaAoOrgao(): void {
    if (!this.orgaoVinculoId || !this.areaParaVincularId) {
      this.mensagemErro = 'Selecione uma área para vincular.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.vincularAreaAoOrgao(this.orgaoVinculoId, this.areaParaVincularId).subscribe({
      next: () => {
        this.mensagemOk = 'Área vinculada ao órgão.';
        this.mostrarModalVinculoArea = false;
        this.areaParaVincularId = null;
        if (this.orgaoVinculoId) {
          this.carregarArvoreOrgao(this.orgaoVinculoId);
        }
      },
      error: (err) => {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.mensagemErro = 'Esta área já está vinculada.';
          return;
        }
        this.mensagemErro = 'Falha ao vincular área.';
      }
    });
  }

  abrirModalVincularCargo(area: AreaDTO): void {
    this.areaSelecionadoId = area.id;
    this.areaVinculoId = area.id;
    this.cargoParaVincularId = null;
    this.termoBuscaCargoVinculo = '';
    this.carregarCargosVinculo();
    this.mostrarModalVinculoCargo = true;
  }

  carregarCargosVinculo(): void {
    this.carregandoCargosVinculo = true;
    this.editalAdminService.listarCargosPaginado(this.termoBuscaCargoVinculo, 0, 50).subscribe({
      next: (res) => {
        this.cargosVinculoOpcoes = res.content || [];
        this.carregandoCargosVinculo = false;
      },
      error: () => {
        this.mensagemErro = 'Falha ao listar cargos para vínculo.';
        this.carregandoCargosVinculo = false;
      }
    });
  }

  vincularCargoNaArea(): void {
    if (!this.areaVinculoId || !this.cargoParaVincularId) {
      this.mensagemErro = 'Selecione um cargo para vincular.';
      return;
    }

    this.limparMensagens();
    this.editalAdminService.vincularCargoNaArea(this.areaVinculoId, this.cargoParaVincularId).subscribe({
      next: () => {
        this.mensagemOk = 'Cargo vinculado à área.';
        this.mostrarModalVinculoCargo = false;
        this.cargoParaVincularId = null;
        if (this.orgaoSelecionadoId) {
          this.carregarArvoreOrgao(this.orgaoSelecionadoId);
        }
      },
      error: (err) => {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.mensagemErro = 'Este cargo já está vinculado.';
          return;
        }
        this.mensagemErro = 'Falha ao vincular cargo.';
      }
    });
  }

  toggleSelecionarTodosOrgaos(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.orgaoSelecionados = checked ? [...this.orgaos] : [];
  }

  toggleSelecionarTodosAreas(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.areaSelecionados = checked ? [...this.areas] : [];
  }

  toggleSelecionarTodosCargos(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.cargoSelecionados = checked ? [...this.cargos] : [];
  }

  onSelecionarOrgaoItem(orgao: OrgaoDTO, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.orgaoSelecionados.some((item) => item.id === orgao.id)) {
        this.orgaoSelecionados = [...this.orgaoSelecionados, orgao];
      }
      return;
    }
    this.orgaoSelecionados = this.orgaoSelecionados.filter((item) => item.id !== orgao.id);
  }

  isOrgaoSelecionado(id: number): boolean {
    return this.orgaoSelecionados.some((item) => item.id === id);
  }

  onSelecionarAreaItem(area: AreaDTO, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.areaSelecionados.some((item) => item.id === area.id)) {
        this.areaSelecionados = [...this.areaSelecionados, area];
      }
      return;
    }
    this.areaSelecionados = this.areaSelecionados.filter((item) => item.id !== area.id);
  }

  isAreaSelecionada(id: number): boolean {
    return this.areaSelecionados.some((item) => item.id === id);
  }

  onSelecionarCargoItem(cargo: CargoDTO, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.cargoSelecionados.some((item) => item.id === cargo.id)) {
        this.cargoSelecionados = [...this.cargoSelecionados, cargo];
      }
      return;
    }
    this.cargoSelecionados = this.cargoSelecionados.filter((item) => item.id !== cargo.id);
  }

  isCargoSelecionado(id: number): boolean {
    return this.cargoSelecionados.some((item) => item.id === id);
  }

  isAreaSelecionadaNaArvore(node: TreeNode): boolean {
    const selecionada = this.orgaoArvoreSelecionada as TreeNode | null;
    if (!selecionada || !node?.data) {
      return false;
    }
    return selecionada.data?.tipo === 'area' && selecionada.data?.id === node.data?.id;
  }

  removerVinculoArea(node: TreeNode): void {
    const areaId = node?.data?.id;
    if (!this.orgaoSelecionadoId || !areaId) {
      return;
    }
    const ok = confirm('Confirma remover a área deste órgão?');
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.desvincularAreaDoOrgao(this.orgaoSelecionadoId, areaId).subscribe({
      next: () => {
        this.mensagemOk = 'Área desvinculada.';
        this.carregarArvoreOrgao(this.orgaoSelecionadoId!);
      },
      error: () => {
        this.mensagemErro = 'Falha ao remover área.';
      }
    });
  }

  abrirModalVincularCargoPorId(areaId: number): void {
    if (!areaId) {
      return;
    }
    this.areaVinculoId = areaId;
    this.cargoParaVincularId = null;
    this.termoBuscaCargoVinculo = '';
    this.carregarCargosVinculo();
    this.mostrarModalVinculoCargo = true;
  }

  todosSelecionadosOrgaos(): boolean {
    return this.orgaos.length > 0 && this.orgaoSelecionados.length === this.orgaos.length;
  }

  todosSelecionadosAreas(): boolean {
    return this.areas.length > 0 && this.areaSelecionados.length === this.areas.length;
  }

  todosSelecionadosCargos(): boolean {
    return this.cargos.length > 0 && this.cargoSelecionados.length === this.cargos.length;
  }

  async excluirOrgaosSelecionados(): Promise<void> {
    if (!this.orgaoSelecionados.length) return;
    const todos = this.orgaos.length > 0 &&
      this.orgaoSelecionados.length === this.orgaos.length &&
      this.orgaosTotal === this.orgaos.length;
    const mensagem = todos
      ? 'Confirma excluir TODOS os órgãos?'
      : `Confirma excluir ${this.orgaoSelecionados.length} órgão(s) selecionado(s)?`;
    if (!confirm(mensagem)) return;

    this.limparMensagens();
    let falhas = 0;
    for (const orgao of this.orgaoSelecionados) {
      try {
        await firstValueFrom(this.editalAdminService.excluirOrgao(orgao.id));
      } catch {
        falhas++;
      }
    }
    this.orgaoSelecionados = [];
    this.orgaoSelecionadoId = null;
    this.orgaoEditandoId = null;
    this.orgaoEditandoNome = '';
    this.carregarOrgaos();
    if (falhas) {
      this.mensagemErro = `Falha ao excluir ${falhas} órgão(s).`;
    } else {
      this.mensagemOk = 'Órgãos excluídos.';
    }
  }

  async excluirAreasSelecionadas(): Promise<void> {
    if (!this.areaSelecionados.length) return;
    const todos = this.areas.length > 0 &&
      this.areaSelecionados.length === this.areas.length &&
      this.areasTotal === this.areas.length;
    const mensagem = todos
      ? 'Confirma excluir TODAS as áreas?'
      : `Confirma excluir ${this.areaSelecionados.length} área(s) selecionada(s)?`;
    if (!confirm(mensagem)) return;

    this.limparMensagens();
    let falhas = 0;
    for (const area of this.areaSelecionados) {
      try {
        await firstValueFrom(this.editalAdminService.excluirArea(area.id));
      } catch {
        falhas++;
      }
    }
    this.areaSelecionados = [];
    this.areaSelecionadoId = null;
    this.areaEditandoId = null;
    this.areaEditandoNome = '';
    this.carregarAreas();
    if (falhas) {
      this.mensagemErro = `Falha ao excluir ${falhas} área(s).`;
    } else {
      this.mensagemOk = 'Áreas excluídas.';
    }
  }

  async excluirCargosSelecionados(): Promise<void> {
    if (!this.cargoSelecionados.length) return;
    const todos = this.cargos.length > 0 &&
      this.cargoSelecionados.length === this.cargos.length &&
      this.cargosTotal === this.cargos.length;
    const mensagem = todos
      ? 'Confirma excluir TODOS os cargos?'
      : `Confirma excluir ${this.cargoSelecionados.length} cargo(s) selecionado(s)?`;
    if (!confirm(mensagem)) return;

    this.limparMensagens();
    let falhas = 0;
    for (const cargo of this.cargoSelecionados) {
      try {
        await firstValueFrom(this.editalAdminService.excluirCargo(cargo.id));
      } catch {
        falhas++;
      }
    }
    this.cargoSelecionados = [];
    this.cargoSelecionadoId = null;
    this.cargoEditandoId = null;
    this.cargoEditandoNome = '';
    this.carregarCargos();
    if (falhas) {
      this.mensagemErro = `Falha ao excluir ${falhas} cargo(s).`;
    } else {
      this.mensagemOk = 'Cargos excluídos.';
    }
  }

  async carregarArvoreOrgao(orgaoId: number): Promise<void> {
    this.carregandoArvoreOrgao = true;
    this.orgaoArvore = [];
    this.orgaoArvoreSelecionada = null;
    try {
      const areas = await firstValueFrom(this.editalAdminService.listarAreasPorOrgao(orgaoId));
      const nodes: TreeNode[] = [];
      for (const area of areas) {
        let cargos: CargoDTO[] = [];
        try {
          cargos = await firstValueFrom(this.editalAdminService.listarCargosPorArea(area.id));
        } catch {
          cargos = [];
        }
        nodes.push({
          label: this.formatarLabelArvore(area.nome),
          data: { tipo: 'area', id: area.id },
          expanded: true,
          leaf: cargos.length === 0,
          children: cargos.map((cargo) => ({
            label: this.formatarLabelArvore(cargo.nome),
            data: { tipo: 'cargo', id: cargo.id },
            leaf: true
          }))
        });
      }
      this.orgaoArvore = nodes;
    } catch {
      this.mensagemErro = 'Falha ao carregar áreas vinculadas.';
    } finally {
      this.carregandoArvoreOrgao = false;
    }
  }

  private consultarOrgaos(tabela: Table): void {
    this.orgaosSearch = (this.orgaoEditandoNome || '').trim();
    tabela.filterGlobal(this.orgaosSearch, 'contains');
  }

  private consultarAreas(tabela: Table): void {
    this.areasSearch = (this.areaEditandoNome || '').trim();
    tabela.filterGlobal(this.areasSearch, 'contains');
  }

  private consultarCargos(tabela: Table): void {
    this.cargosSearch = (this.cargoEditandoNome || '').trim();
    tabela.filterGlobal(this.cargosSearch, 'contains');
  }

  onTabChange(event: { index: number }): void {
    this.abaAtivaIndex = event.index;
    if (event.index === 0) {
      this.carregarOrgaos();
      return;
    }
    if (event.index === 1) {
      this.carregarAreas();
      return;
    }
    this.carregarCargos();
  }

  async importarListaOrgaos(): Promise<void> {
    if (this.importandoOrgaos) return;
    const lista = this.parseListaImportacao(this.textoImportOrgaos);
    if (!lista.length) {
      this.mensagemErro = 'Informe pelo menos um órgão para importar.';
      return;
    }

    this.importandoOrgaos = true;
    this.limparMensagens();
    let ok = 0;
    let duplicados = 0;
    let falhas = 0;

    for (const nome of lista) {
      try {
        await firstValueFrom(this.editalAdminService.criarOrgao(nome));
        ok++;
      } catch (err: any) {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          duplicados++;
        } else {
          falhas++;
        }
      }
    }

    this.importandoOrgaos = false;
    this.textoImportOrgaos = '';
    this.mostrarImportOrgaos = false;
    this.carregarOrgaos(0, this.orgaosSize);

    this.mensagemOk = `Importação concluída. Novos: ${ok}. Duplicados: ${duplicados}.`;
    if (falhas) {
      this.mensagemErro = `Falha ao importar ${falhas} órgãos.`;
    }
  }

  async importarListaAreas(): Promise<void> {
    if (this.importandoAreas) return;
    const lista = this.parseListaImportacao(this.textoImportAreas);
    if (!lista.length) {
      this.mensagemErro = 'Informe pelo menos uma área para importar.';
      return;
    }

    this.importandoAreas = true;
    this.limparMensagens();
    let ok = 0;
    let duplicados = 0;
    let falhas = 0;

    for (const nome of lista) {
      try {
        await firstValueFrom(this.editalAdminService.criarArea(nome));
        ok++;
      } catch (err: any) {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          duplicados++;
        } else {
          falhas++;
        }
      }
    }

    this.importandoAreas = false;
    this.textoImportAreas = '';
    this.mostrarImportAreas = false;
    this.carregarAreas(0, this.areasSize);

    this.mensagemOk = `Importação concluída. Novas: ${ok}. Duplicadas: ${duplicados}.`;
    if (falhas) {
      this.mensagemErro = `Falha ao importar ${falhas} áreas.`;
    }
  }

  async importarListaCargos(): Promise<void> {
    if (this.importandoCargos) return;
    const lista = this.parseListaImportacao(this.textoImportCargos);
    if (!lista.length) {
      this.mensagemErro = 'Informe pelo menos um cargo para importar.';
      return;
    }

    this.importandoCargos = true;
    this.limparMensagens();
    let ok = 0;
    let duplicados = 0;
    let falhas = 0;

    for (const nome of lista) {
      try {
        await firstValueFrom(this.editalAdminService.criarCargo(nome));
        ok++;
      } catch (err: any) {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          duplicados++;
        } else {
          falhas++;
        }
      }
    }

    this.importandoCargos = false;
    this.textoImportCargos = '';
    this.mostrarImportCargos = false;
    this.carregarCargos(0, this.cargosSize);

    this.mensagemOk = `Importação concluída. Novos: ${ok}. Duplicados: ${duplicados}.`;
    if (falhas) {
      this.mensagemErro = `Falha ao importar ${falhas} cargos.`;
    }
  }

  private focarFimInput(tipo: 'orgao' | 'area' | 'cargo', id: number): void {
    const inputId = `${tipo}-edit-${id}`;
    setTimeout(() => {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // no-op for unsupported inputs
      }
    }, 0);
  }

  onLazyLoad(event: TableLazyLoadEvent, tipo: 'orgaos' | 'areas' | 'cargos'): void {
    const rows = event.rows ?? 20;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows);
    const size = rows;

    if (tipo === 'orgaos') {
      this.carregarOrgaos(page, size);
      return;
    }
    if (tipo === 'areas') {
      this.carregarAreas(page, size);
      return;
    }
    this.carregarCargos(page, size);
  }

  onFiltroTabela(event: TableFilterEvent, tipo: 'orgaos' | 'areas' | 'cargos'): void {
    const raw = (event.filters || {})['global'] as any;
    const value = Array.isArray(raw) ? raw[0]?.value : raw?.value;
    const termo = String(value || '').trim();

    if (tipo === 'orgaos') {
      this.orgaosSearch = termo;
      this.carregarOrgaos(0, this.orgaosSize);
      return;
    }
    if (tipo === 'areas') {
      this.areasSearch = termo;
      this.carregarAreas(0, this.areasSize);
      return;
    }
    this.cargosSearch = termo;
    this.carregarCargos(0, this.cargosSize);
  }

  limparFiltroTabela(tipo: 'orgaos' | 'areas' | 'cargos', tabela: Table): void {
    if (tipo === 'orgaos') {
      this.orgaosSearch = '';
    } else if (tipo === 'areas') {
      this.areasSearch = '';
    } else {
      this.cargosSearch = '';
    }
    tabela.clear();
  }

  buscarOrgaos(): void {
    this.carregarOrgaos(0, this.orgaosSize);
  }

  buscarAreas(): void {
    this.carregarAreas(0, this.areasSize);
  }

  buscarCargos(): void {
    this.carregarCargos(0, this.cargosSize);
  }
}
