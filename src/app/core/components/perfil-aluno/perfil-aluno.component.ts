import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import {
  AlunoDTO,
  UsuarioConsultaDTO,
  AlunoParametroDTO
} from 'src/app/core/models/AlunoParametroDTO';

import { PerfilAlunoService } from 'src/app/services/perfil-aluno.service';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';

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
    private fb: FormBuilder,
     private router: Router,
      private authService: AuthService 
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

  this.perfilAlunoService.getUsuarioLogado().subscribe({
    next: (usuario) => {
      console.log('📥 [PerfilAluno] Usuario recebido do backend:', usuario);
      this.usuario = usuario;
      this.aluno = usuario.aluno;

      // 🔁 Mantém sincronizado com a mesma lógica da assinatura-planos
      this.authService.atualizarStatusAssinaturaFromUser(usuario);

      // 🔍 Parâmetros do aluno (ainda podem ser usados como apoio, mas NUNCA acima do backend)
      const parametros: AlunoParametroDTO[] = this.aluno?.parametros || [];
      console.log('🔍 [PerfilAluno] Parâmetros do aluno:', parametros);

      const mapa = new Map<string, string>();
      parametros.forEach(p => {
        if (p.chave) {
          mapa.set(p.chave, p.valor ?? '');
        }
      });

      const planoParam = mapa.get('PLANO_ATUAL');          // ex: 'PREMIUM'
      const statusParam = mapa.get('STATUS_ASSINATURA');   // ex: 'ATIVA', 'EXPIRADA' etc.

      console.log('🧩 [PerfilAluno] PLANO_ATUAL (parametro):', planoParam);
      console.log('🧩 [PerfilAluno] STATUS_ASSINATURA (parametro):', statusParam);

      // 🚨 AQUI ESTAVA O PROBLEMA:
      // ANTES: parâmetro tinha prioridade sobre o que veio do backend
      // AGORA: backend é a verdade principal, igual na tela de assinatura

      const backendStatus = usuario.statusAssinatura ?? null;
      const backendPlano = usuario.planoAtual ?? null;
      const backendAssinaturaValida = usuario.assinaturaValida ?? null;
      const backendDataExp = usuario.dataExpiracaoLicenca ?? null;

      this.planoAtual = backendPlano || planoParam || undefined;
      this.statusAssinatura = backendStatus || statusParam || undefined;
      this.assinaturaAtiva = backendAssinaturaValida ?? false;
      this.dataExpiracaoLicenca = backendDataExp ?? undefined;

      console.log('✅ [PerfilAluno] planoAtual final:', this.planoAtual);
      console.log('✅ [PerfilAluno] statusAssinatura final:', this.statusAssinatura);
      console.log('✅ [PerfilAluno] assinaturaAtiva:', this.assinaturaAtiva);
      console.log('✅ [PerfilAluno] dataExpiracaoLicenca:', this.dataExpiracaoLicenca);

      this.diasRestantes = this.calcularDiasRestantes(this.dataExpiracaoLicenca);
      console.log('⏳ [PerfilAluno] Dias restantes:', this.diasRestantes);

      // Preenche formulário (igual já estava)
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

  // 🔹 Rótulo do plano atual (usa status TRIAL para mostrar "Período de teste")
  get planoAtualLabel(): string {
    console.log('🎯 [Getter] planoAtualLabel -> status:', this.statusAssinatura, 'plano:', this.planoAtual);

    if (this.statusAssinatura === 'TRIAL') {
      return 'Período de teste (Premium liberado)';
    }

    if (this.planoAtual === 'BASIC') {
      return 'Essencial';
    }

    if (this.planoAtual === 'PREMIUM') {
      return 'Premium';
    }

    return 'Nenhum plano';
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
    if (this.perfilForm.invalid) {
      this.erro = 'Verifique os dados antes de salvar.';
      return;
    }

    // Por enquanto ainda é só simulação
    this.mensagemSucesso = 'Dados salvos (simulação). Depois conectamos com o backend.';
    setTimeout(() => this.mensagemSucesso = undefined, 4000);
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

  irParaGerenciarAssinatura(): void {
    this.router.navigate(['/area-restrita/assinatura']);
  }
}
