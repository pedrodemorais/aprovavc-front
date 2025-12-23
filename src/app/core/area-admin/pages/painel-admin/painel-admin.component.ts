import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import { EditalAdminService } from '../../services/edital-admin.service';
import {
  EditalTemplateDTO,
  ClonarEditalResponseDTO
} from '../../dto/edital-admin.dto';

@Component({
  selector: 'app-painel-admin',
  templateUrl: './painel-admin.component.html',
  styleUrls: ['./painel-admin.component.css']
})
export class PainelAdminComponent implements OnInit {

  templates: EditalTemplateDTO[] = [];

  mensagemOk = '';
  mensagemErro = '';
  ultimoStatus: number | null = null;

  novoNome = '';

  selecionadoId: number | null = null;
  editarNome = '';

  cloneTemplateId: number | null = null;
  cloneNomeEdital = '';
  resultadoClone: ClonarEditalResponseDTO | null = null;

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
      },
      error: (err) => this.tratarErro(err, 'Falha ao listar templates (precisa ROLE_ADMIN).')
    });
  }

  selecionar(id: number): void {
    this.selecionadoId = id;
    const item = this.templates.find(t => t.id === id);
    this.editarNome = item?.nome || '';
    this.mensagemOk = `✅ Selecionado template ID ${id}`;
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
        if (this.selecionadoId === id) this.selecionadoId = null;
        this.recarregar();
      },
      error: (err) => this.tratarErro(err, 'Falha ao excluir template.')
    });
  }

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
        this.mensagemOk = `✅ Clone realizado. Edital criado: ID ${res?.edital?.id}`;
      },
      error: (err) => this.tratarErro(err, 'Falha ao clonar (provável rota diferente ou permissão).')
    });
  }

  // =========================
  // ERROS
  // =========================

  private tratarErro(err: any, fallbackMsg: string): void {
    this.mensagemOk = '';
    this.resultadoClone = null;

    if (err instanceof HttpErrorResponse) {
      this.ultimoStatus = err.status;

      // Mensagem do backend costuma vir em err.error (string) ou err.error.message
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
  // TOKEN / ROLE (só pra exibir no painel)
  // =========================

  private getStoredToken(): string | null {
    // tenta chaves comuns sem te perguntar
    const keys = ['access_token', 'token', 'accessToken', 'authToken', 'jwt', 'Authorization'];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.trim()) {
        // Se veio "Bearer xxx", normaliza
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

      // tenta claims comuns
      const directRole = payload.role;
      if (typeof directRole === 'string') return directRole;

      // roles como array
      const roles = payload.roles || payload.authorities;
      if (Array.isArray(roles) && roles.length) {
        // roles pode vir como array de objetos { authority }
        if (roles.some(r => typeof r === 'object' && r && 'authority' in r)) {
          return roles.map(r => r.authority).filter(Boolean).join(',');
        }
        return roles.join(',');
      }

      return null;
    } catch {
      return null;
    }
  }

  private base64UrlToBase64(input: string): string {
    // base64url -> base64
    let str = input.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4 !== 0) str += '=';
    return str;
  }
}
