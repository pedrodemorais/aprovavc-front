// src/app/pages/assinatura/assinatura-planos/assinatura-planos.component.ts
import { Component, OnInit } from '@angular/core';
import { AssinaturaService, TipoPlano } from '../services/assinatura.service';
import { AuthService } from 'src/app/site/services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-assinatura-planos',
  templateUrl: './assinatura-planos.component.html',
  styleUrls: ['./assinatura-planos.component.css']
})
export class AssinaturaPlanosComponent implements OnInit {

  assinaturaValida: boolean = false;
  statusAssinatura: string = '';      // 'TRIAL' | 'ATIVA' | 'EXPIRADA' | 'CANCELADA'
  planoAtual: string = '';            // 'BASIC' | 'PREMIUM' | 'TRIAL' | ''
  dataExpiracaoLicenca?: Date | string;

  podeGerenciar = true;               // se tiver portal de cliente do Stripe
  podeCancelar = true;

  carregando = false;
  erro: string | null = null;

  constructor(
    private assinaturaService: AssinaturaService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // se vier de retorno do Stripe com ?pagamento=ok, só forçamos o refresh,
    // mas de qualquer forma SEMPRE vamos ler do back
    this.route.queryParamMap.subscribe(params => {
      const pagamentoOk = params.get('pagamento');
      if (pagamentoOk === 'ok') {
        console.log('✅ Retornou do Stripe com pagamento=ok, recarregando status de assinatura...');
      }
      this.carregarStatusAssinaturaDoBack();
    });
  }

  /**
   * 🔥 Sempre consulta o backend (/usuarios/me) para saber
   * planoAtual, statusAssinatura, assinaturaValida e dataExpiracaoLicenca.
   * Nada de localStorage aqui.
   */
  private carregarStatusAssinaturaDoBack(): void {
    this.carregando = true;
    this.erro = null;

    this.authService.getUserData().subscribe({
      next: (user) => {
        console.log('📥 [AssinaturaPlanos] Dados do usuário vindos do back:', user);

        // mantém estado global/menu em sincronia (mesmo que internamente ele ainda use localStorage)
        this.authService.atualizarStatusAssinaturaFromUser(user);

        // usa EXCLUSIVAMENTE o que o backend mandou
        this.statusAssinatura = user.statusAssinatura ?? '';
        this.planoAtual = user.planoAtual ?? '';
       // this.assinaturaValida = !!user.assinaturaValida;
        this.assinaturaValida = !!user.assinaturaAtiva;

        this.dataExpiracaoLicenca = user.dataExpiracaoLicenca ?? undefined;

        console.log('✅ [AssinaturaPlanos] Estado local:', {
          statusAssinatura: this.statusAssinatura,
          planoAtual: this.planoAtual,
          assinaturaValida: this.assinaturaValida,
          dataExpiracaoLicenca: this.dataExpiracaoLicenca
        });

        this.carregando = false;
      },
      error: (err) => {
        console.error('❌ [AssinaturaPlanos] Erro ao carregar status de assinatura:', err);
        this.erro = 'Erro ao carregar informações da sua assinatura.';
        this.carregando = false;
      }
    });
  }

  // 🔹 Label amigável do plano atual
get planoAtualLabel(): string {
  if (!this.assinaturaValida) {
    return 'Nenhum plano';
  }

  if (this.statusAssinatura === 'TRIAL') {
    return 'Período de teste (Premium liberado)';
  }

  if (this.planoAtual === 'BASIC') return 'Essencial';
  if (this.planoAtual === 'PREMIUM') return 'Premium';

  return 'Nenhum plano';
}


  // 🔹 Só consideramos "plano atual" se NÃO estiver em TRIAL
get isPlanoBasicoAtual(): boolean {
  return this.assinaturaValida
    && this.statusAssinatura !== 'TRIAL'
    && this.planoAtual === 'BASIC';
}

get isPlanoPremiumAtual(): boolean {
  return this.assinaturaValida
    && this.statusAssinatura !== 'TRIAL'
    && this.planoAtual === 'PREMIUM';
}

  // 🔹 Texto dos botões
  get textoBotaoBasico(): string {
    if (this.isPlanoBasicoAtual) return 'Plano atual';
    if (this.statusAssinatura === 'TRIAL') return 'Escolher Essencial';
    return 'Mudar para Essencial';
  }

  get textoBotaoPremium(): string {
    if (this.isPlanoPremiumAtual) return 'Plano atual';
    if (this.statusAssinatura === 'TRIAL') return 'Escolher Premium';
    return 'Mudar para Premium';
  }

  // 🔹 Ações Stripe (checkout)
  gerenciarPagamento() {
    console.log('🔧 Em breve: abrir portal de cobrança / gerenciamento de assinatura');
  }

cancelarAssinatura() {
  if (!confirm('Tem certeza que deseja cancelar sua assinatura?')) {
    return;
  }

  this.carregando = true;
  this.erro = null;

  this.assinaturaService.cancelarAssinatura().subscribe({
    next: (resp) => {
      console.log('✅ [AssinaturaPlanos] Assinatura cancelada:', resp);
      // Depois de cancelar, recarrega direto do backend
      this.carregarStatusAssinaturaDoBack();
    },
    error: (err) => {
      console.error('❌ [AssinaturaPlanos] Erro ao cancelar assinatura:', err);
      this.erro = 'Erro ao cancelar assinatura. Tente novamente.';
      this.carregando = false;
    }
  });
}


  assinar(plano: TipoPlano) {
    this.erro = null;
    this.carregando = true;

    this.assinaturaService.criarCheckout(plano).subscribe({
      next: (resp) => {
        this.carregando = false;
        window.location.href = resp.url; // redireciona pro Stripe Checkout
      },
      error: (err) => {
        this.carregando = false;
        console.error('Erro ao criar checkout:', err);
        this.erro =
          err?.error?.error || 'Erro ao criar sessão de pagamento. Tente novamente.';
      }
    });
  }
}
