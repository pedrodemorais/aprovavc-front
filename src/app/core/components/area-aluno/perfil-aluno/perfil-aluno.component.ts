import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlunoDTO } from '../models/AlunoParametroDTO';
import { UsuarioConsultaDTO } from '../models/AlunoParametroDTO';
 import { AlunoParametroDTO } from '../models/AlunoParametroDTO';
import { UsuarioUpdateDTO } from '../models/AlunoParametroDTO';

import { PerfilAlunoService } from 'src/app/core/components/area-aluno/services/perfil-aluno.service';
import { AuthService } from 'src/app/site/services/auth.service';
import { UsuarioService } from 'src/app/site/services/usuario.service';
import { AssinaturaService } from '../services/assinatura.service';
@Component({
  selector: 'app-perfil-aluno',
  templateUrl: './perfil-aluno.component.html',
  styleUrls: ['./perfil-aluno.component.css']
})
export class PerfilAlunoComponent implements OnInit {

  carregando = true;
  erro?: string;
  mensagemSucesso?: string;

  usuario?: UsuarioConsultaDTO;
  aluno?: AlunoDTO;

  perfilForm!: FormGroup;

  planoAtual?: string;
  statusAssinatura?: string;
  assinaturaAtiva?: boolean;
  dataExpiracaoLicenca?: string;
  diasRestantes?: number | null;

  constructor(
    private perfilAlunoService: PerfilAlunoService,
    private usuarioService: UsuarioService,
    private fb: FormBuilder,
    private authService: AuthService,
    private assinaturaService: AssinaturaService
  ) {}

  ngOnInit(): void {
    this.inicializarForm();
    this.carregarDados();
  }

  private inicializarForm(): void {
    this.perfilForm = this.fb.group({
      nomeAluno: [{ value: '', disabled: true }],
      email: [{ value: '', disabled: true }],
      telefone: [''],
      endereco: this.fb.group({
        logradouro: [''],
        numero: [''],
        complemento: [''],
        bairro: [''],
        cep: [''],
        municipio: this.fb.group({
          municipioIbge: [''],
          uf: ['']
        })
      })
    });
  }

private carregarDados(): void {
  this.carregando = true;
  this.erro = undefined;

  this.usuarioService.getUsuarioLogado().subscribe({
    next: (usuario) => {
      console.log('📥 [PerfilAluno] Usuario recebido do backend:', usuario);
      this.usuario = usuario;
      this.aluno = usuario.aluno;

      this.authService.atualizarStatusAssinaturaFromUser(usuario);

      const parametros: AlunoParametroDTO[] = this.aluno?.parametros || [];
      const mapa = new Map<string, string>();
      parametros.forEach(p => {
        if (p.chave) {
          mapa.set(p.chave, p.valor ?? '');
        }
      });

      const planoParam = mapa.get('PLANO_ATUAL');
      const statusParam = mapa.get('STATUS_ASSINATURA');

      const backendStatus = usuario.statusAssinatura ?? null;
      const backendPlano = usuario.planoAtual ?? null;
      const backendAssinaturaValida = usuario.assinaturaValida ?? null;
      const backendDataExp = usuario.dataExpiracaoLicenca ?? null;

      this.planoAtual = backendPlano || planoParam || undefined;
      this.statusAssinatura = backendStatus || statusParam || undefined;
      this.assinaturaAtiva = backendAssinaturaValida ?? false;
      this.dataExpiracaoLicenca = backendDataExp ?? undefined;
      this.diasRestantes = this.calcularDiasRestantes(this.dataExpiracaoLicenca);

      if (this.aluno) {
        this.perfilForm.patchValue({
          nomeAluno: this.aluno.nomeAluno,
          email: this.aluno.email,
          telefone: this.aluno.telefone,
          endereco: {
            logradouro: this.aluno.endereco?.logradouro,
            numero: this.aluno.endereco?.numero,
            complemento: this.aluno.endereco?.complemento,
            bairro: this.aluno.endereco?.bairro,
            cep: this.aluno.endereco?.cep,
            municipio: {
              municipioIbge: this.aluno.endereco?.municipio?.municipioIbge,
              uf: this.aluno.endereco?.municipio?.uf
            }
          }
        });
      }

      this.carregando = false;
    },
    error: (err) => {
      console.error('❌ [PerfilAluno] Erro ao carregar usuário:', err);
      this.erro = 'Erro ao carregar seus dados. Tente novamente.';
      this.carregando = false;
    }
  });
}


private calcularDiasRestantes(dataExpiracao?: string): number | null {
  if (!dataExpiracao) {
    return null;
  }

  const hoje = new Date();
  const exp = new Date(dataExpiracao);

  // 🔹 Zera horas, minutos, segundos e ms (compara só a DATA)
  hoje.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);

  const diffMs = exp.getTime() - hoje.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDias;
}

  // Rotulo do plano atual (plano unico)
  get planoAtualLabel(): string {
    console.log('[Getter] planoAtualLabel -> status:', this.statusAssinatura, 'plano:', this.planoAtual);

    if (this.statusAssinatura === 'TRIAL') {
      return 'Periodo de teste';
    }

    if (this.assinaturaAtiva) {
      return 'Plano padrao';
    }

    return 'Sem plano ativo';
  }

  get statusAssinaturaLabel(): string {
    console.log('🎯 [Getter] statusAssinaturaLabel ->', this.statusAssinatura);

    if (this.statusAssinatura === 'EXPIRADA') {
      return 'Licença expirada';
    }
    if (this.statusAssinatura === 'ATIVA') {
      return 'Assinatura ativa';
    }
    if (this.statusAssinatura === 'TRIAL') {
      return 'Período de teste';
    }
    return this.statusAssinatura || 'Indefinido';
  }

  get statusAssinaturaClass(): string {
    switch (this.statusAssinatura) {
      case 'ATIVA':
        return 'badge-status badge-ativa';
      case 'TRIAL':
        return 'badge-status badge-trial';
      case 'EXPIRADA':
        return 'badge-status badge-expirada';
      default:
        return 'badge-status';
    }
  }

salvar(): void {
  this.erro = undefined;
  this.mensagemSucesso = undefined;

  if (this.perfilForm.invalid) {
    this.erro = 'Verifique os dados antes de salvar.';
    return;
  }

  if (!this.usuario || !this.aluno) {
    this.erro = 'Não foi possível identificar o aluno logado.';
    return;
  }

  const formValue = this.perfilForm.getRawValue();

  const alunoAtualizado: AlunoDTO = {
    id: this.aluno.id,
    nomeAluno: this.aluno.nomeAluno, // se no futuro você quiser editar, pega do form
    email: formValue.email || this.aluno.email,
    telefone: formValue.telefone || this.aluno.telefone,
    exigeDocNoCadastro: this.aluno.exigeDocNoCadastro,
    dataCriacao: this.aluno.dataCriacao,
    dataAtualizacao: this.aluno.dataAtualizacao,
    endereco: {
      id: this.aluno.endereco?.id,
      logradouro: formValue.endereco.logradouro,
      numero: formValue.endereco.numero,
      complemento: formValue.endereco.complemento,
      bairro: formValue.endereco.bairro,
      cep: formValue.endereco.cep,
      municipio: {
        id: this.aluno.endereco?.municipio?.id,
        municipioIbge: formValue.endereco.municipio.municipioIbge,
        uf: formValue.endereco.municipio.uf
      }
    },
    parametros: this.aluno.parametros // não vai ser usado no update, mas não atrapalha
  };

  const dto: UsuarioUpdateDTO = {
    nome: this.usuario.nome,
    email: this.usuario.email,
    aluno: alunoAtualizado
  };

  this.carregando = true;

  this.usuarioService.atualizarUsuario(dto).subscribe({
    next: (resp) => {
      console.log('✅ [PerfilAluno] Dados atualizados com sucesso:', resp);
      this.mensagemSucesso = 'Dados salvos com sucesso.';
      this.carregando = false;

      // Recarrega para atualizar `this.usuario`/`this.aluno` e o form
      this.carregarDados();
    },
    error: (err) => {
      console.error('❌ [PerfilAluno] Erro ao atualizar perfil:', err);
      this.erro = err?.error?.error || err?.error?.message || 'Erro ao salvar seus dados.';
      this.carregando = false;
    }
  });
}



  abrirCheckout(plano: 'BASIC' | 'PREMIUM'): void {
    this.perfilAlunoService.criarCheckout(plano).subscribe({
      next: (resp) => {
        if (resp.url) {
          window.location.href = resp.url; // redireciona pro Stripe
        }
      },
      error: (err) => {
        console.error('❌ [PerfilAluno] Erro ao abrir checkout:', err);
        this.erro = 'Erro ao abrir tela de pagamento.';
      }
    });
  }

  cancelarAssinatura(): void {
    if (!confirm('Tem certeza que deseja cancelar sua assinatura?')) {
      return;
    }

    this.carregando = true;
    this.erro = undefined;

    this.assinaturaService.cancelarAssinatura().subscribe({
      next: () => {
        this.carregarDados();
      },
      error: (err) => {
        console.error('[PerfilAluno] Erro ao cancelar assinatura:', err);
        this.erro = 'Erro ao cancelar assinatura. Tente novamente.';
        this.carregando = false;
      }
    });
  }

  assinarPlanoPadrao(): void {
    const plano = this.planoAtual === 'BASIC' ? 'BASIC' : 'PREMIUM';
    this.abrirCheckout(plano);
  }
}
