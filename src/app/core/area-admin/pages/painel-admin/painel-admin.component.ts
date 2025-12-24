import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { EditalAdminService } from '../../services/edital-admin.service';
import {
  EditalTemplateDTO,
  ClonarEditalResponseDTO,
  MateriaTemplateDTO,
  TopicoTemplateDTO,
  EstruturaTemplateDTO
} from '../../dto/edital-admin.dto';

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
  novaMateriaNome = '';
  novaMateriaOrdem: number | null = null;

  // Topicos
  topicos: TopicoTemplateDTO[] = [];
  novoTopicoNome = '';
  novoTopicoOrdem: number | null = null;
  novoTopicoPaiId: number | null = null;

  // Estrutura (debug)
  estruturaTemplate: EstruturaTemplateDTO | null = null;

  // Token / role (display)
  tokenPresente = false;
  roleDetectada: string | null = null;

  constructor(private editalAdminService: EditalAdminService) {}

  ngOnInit(): void {
    const token = this.getStoredToken();
    this.tokenPresente = !!token;
    this.roleDetectada = this.detectRoleFromToken(token);

    this.recarregar();
  }

  // =========================
  // AÇÕES UI
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
        this.mensagemOk = `✅ Templates carregados: ${this.templates.length}`;

        // mantém selecionado (se ainda existe)
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

    // reset workspace de materias/topicos
    this.materias = [];
    this.topicos = [];
    this.materiaSelecionadaId = null;
    this.estruturaTemplate = null;

    this.mensagemOk = `✅ Selecionado template ID ${id}`;
    this.carregarMaterias();
  }

  preencherClone(id: number): void {
    this.cloneTemplateId = id;
    this.mensagemOk = `✅ Template ${id} preenchido no clone`;
  }

  buscarSelecionado(): void {
    if (!this.selecionadoId) return;

    this.limparMensagens();
    this.editalAdminService.buscarTemplatePorId(this.selecionadoId).subscribe({
      next: (res) => {
        this.templateSelecionado = res;
        this.editarNome = res.nome;
        this.mensagemOk = `✅ Template ${res.id} carregado`;
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
        this.mensagemOk = `✅ Criado: ID ${res.id}`;
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
        this.mensagemOk = `✅ Atualizado: ID ${res.id}`;
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao atualizar template (se estiver publicado, deve bloquear).')
    });
  }

  publicar(id: number): void {
    this.limparMensagens();
    this.editalAdminService.publicarTemplate(id).subscribe({
      next: (res) => {
        this.mensagemOk = `✅ Publicado: ID ${res.id}`;
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
        this.mensagemOk = `✅ Excluído: ID ${id}`;
        if (this.selecionadoId === id) {
          this.selecionadoId = null;
          this.templateSelecionado = null;
          this.materias = [];
          this.topicos = [];
          this.materiaSelecionadaId = null;
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

  carregarMaterias(): void {
    if (!this.selecionadoId) return;

    this.editalAdminService.listarMaterias(this.selecionadoId).subscribe({
      next: (res) => {
        this.materias = res || [];
        this.mensagemOk = `✅ Matérias carregadas: ${this.materias.length}`;

        // se matéria selecionada sumiu, reseta
        if (this.materiaSelecionadaId && !this.materias.some(m => m.id === this.materiaSelecionadaId)) {
          this.materiaSelecionadaId = null;
          this.topicos = [];
        }
      },
      error: (err) => this.tratarErro(err, 'Falha ao listar matérias.')
    });
  }

  selecionarMateria(materiaId: number): void {
    this.materiaSelecionadaId = materiaId;
    this.topicos = [];
    this.novoTopicoPaiId = null;
    this.mensagemOk = `✅ Matéria selecionada: ${materiaId}`;
    this.carregarTopicos();
  }

  criarMateria(): void {
    if (!this.selecionadoId) {
      this.mensagemErro = 'Selecione um template primeiro.';
      return;
    }
    if (!this.novaMateriaNome || !this.novaMateriaNome.trim()) {
      this.mensagemErro = 'Informe o nome/descrição da matéria.';
      return;
    }

    // manda nome e descricao pra não quebrar se teu backend usar um ou outro
    const payload: any = {
      nome: this.novaMateriaNome.trim(),
      descricao: this.novaMateriaNome.trim(),
      ordem: (this.novaMateriaOrdem !== null && this.novaMateriaOrdem !== undefined) ? Number(this.novaMateriaOrdem) : undefined
    };

    this.limparMensagens();
    this.editalAdminService.criarMateria(this.selecionadoId, payload).subscribe({
      next: (res) => {
        this.mensagemOk = `✅ Matéria criada: ID ${res.id}`;
        this.novaMateriaNome = '';
        this.novaMateriaOrdem = null;
        this.carregarMaterias();
      },
      error: (err) => this.tratarErro(err, 'Falha ao criar matéria.')
    });
  }

  excluirMateria(materiaId: number): void {
    if (!this.selecionadoId) return;

    const ok = confirm(`Confirma excluir a matéria ${materiaId}? (isso remove os tópicos dela também, se o backend fizer cascade)`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirMateria(this.selecionadoId, materiaId).subscribe({
      next: () => {
        this.mensagemOk = `✅ Matéria excluída: ID ${materiaId}`;
        if (this.materiaSelecionadaId === materiaId) {
          this.materiaSelecionadaId = null;
          this.topicos = [];
          this.novoTopicoPaiId = null;
        }
        this.carregarMaterias();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir matéria.')
    });
  }

  // =========================
  // TOPICOS
  // =========================

  carregarTopicos(): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId) return;

    this.editalAdminService.listarTopicos(this.selecionadoId, this.materiaSelecionadaId).subscribe({
      next: (res) => {
         console.log('TOPICOS (raw):', res);
  this.topicos = res || [];
        this.topicos = res || [];
        this.mensagemOk = `✅ Tópicos carregados: ${this.topicos.length}`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao listar tópicos.')
    });
  }

  criarTopico(): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId) {
      this.mensagemErro = 'Selecione um template e uma matéria primeiro.';
      return;
    }
    if (!this.novoTopicoNome || !this.novoTopicoNome.trim()) {
      this.mensagemErro = 'Informe o nome/descrição do tópico.';
      return;
    }

    // manda nome e descricao pra não quebrar se teu backend usar um ou outro
    const payload: any = {
  descricao: this.novoTopicoNome.trim(),
  ordem: (this.novoTopicoOrdem !== null && this.novoTopicoOrdem !== undefined)
    ? Number(this.novoTopicoOrdem)
    : 1,
  topicoPaiId: (this.novoTopicoPaiId !== null && this.novoTopicoPaiId !== undefined)
    ? Number(this.novoTopicoPaiId)
    : null
};

console.log('Payload enviado:', payload);


    this.limparMensagens();
    this.editalAdminService.criarTopico(this.selecionadoId, this.materiaSelecionadaId, payload).subscribe({
      next: (res) => {
        this.mensagemOk = `✅ Tópico criado: ID ${res.id}`;
        this.novoTopicoNome = '';
        this.novoTopicoOrdem = null;
        this.novoTopicoPaiId = null;
        this.carregarTopicos();
      },
      error: (err) => this.tratarErro(err, 'Falha ao criar tópico.')
    });
  }
trackByTopicoId = (_: number, t: TopicoTemplateDTO) => t.id;

debugPai(v: any) {
  console.log('novoTopicoPaiId mudou:', v, typeof v);
}

  excluirTopico(topicoId: number): void {
    if (!this.selecionadoId || !this.materiaSelecionadaId) return;

    const ok = confirm(`Confirma excluir o tópico ${topicoId}?`);
    if (!ok) return;

    this.limparMensagens();
    this.editalAdminService.excluirTopico(this.selecionadoId, this.materiaSelecionadaId, topicoId).subscribe({
      next: () => {
        this.mensagemOk = `✅ Tópico excluído: ID ${topicoId}`;
        // se apagou um pai que estava selecionado, reseta
        if (this.novoTopicoPaiId === topicoId) this.novoTopicoPaiId = null;
        this.carregarTopicos();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir tópico.')
    });
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
        this.mensagemOk = `✅ Estrutura carregada`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao buscar estrutura.')
    });
  }

  limparEstrutura(): void {
    this.estruturaTemplate = null;
    this.mensagemOk = '✅ Estrutura limpa';
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

      this.mensagemErro = `❌ ${fallbackMsg} (${err.status}) ${backendMsg ? '- ' + backendMsg : ''}`;
      return;
    }

    this.mensagemErro = `❌ ${fallbackMsg}`;
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
        this.mensagemOk = `✅ Clone realizado. Edital criado: ID ${res}`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao clonar (provável rota diferente ou permissão).')
    });
  }
}
