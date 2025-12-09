import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlunoDTO, UsuarioConsultaDTO } from 'src/app/core/models/AlunoParametroDTO';

import { PerfilAlunoService } from 'src/app/services/perfil-aluno.service';

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
    private fb: FormBuilder
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
        this.usuario = usuario;
        this.aluno = usuario.aluno;

        this.assinaturaAtiva = usuario.assinaturaAtiva ?? false;
        this.statusAssinatura = usuario.statusAssinatura ?? 'TRIAL';
        this.planoAtual = usuario.planoAtual ?? 'PREMIUM';
        this.dataExpiracaoLicenca = usuario.dataExpiracaoLicenca ?? undefined;

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
      error: () => {
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
    const diffMs = exp.getTime() - hoje.getTime();
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDias;
  }

  get statusAssinaturaLabel(): string {
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
    // por enquanto só exibindo mensagem – depois você cria o PUT no backend
    if (this.perfilForm.invalid) {
      this.erro = 'Verifique os dados antes de salvar.';
      return;
    }

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
      error: () => {
        this.erro = 'Erro ao abrir tela de pagamento.';
      }
    });
  }
}
