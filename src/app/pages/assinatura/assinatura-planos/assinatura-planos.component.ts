// src/app/pages/assinatura/assinatura-planos/assinatura-planos.component.ts
import { Component } from '@angular/core';
import { AssinaturaService, TipoPlano } from 'src/app/core/services/assinatura.service';

@Component({
  selector: 'app-assinatura-planos',
  templateUrl: './assinatura-planos.component.html',
  styleUrls: ['./assinatura-planos.component.scss']
})
export class AssinaturaPlanosComponent {

  carregando = false;
  erro: string | null = null;

  constructor(private assinaturaService: AssinaturaService) {}

  assinar(plano: TipoPlano) {
    this.erro = null;
    this.carregando = true;

    this.assinaturaService.criarCheckout(plano).subscribe({
      next: (resp) => {
        this.carregando = false;
        // 🔥 Redireciona o usuário direto para o Stripe Checkout
        window.location.href = resp.url;
      },
      error: (err) => {
        this.carregando = false;
        console.error('Erro ao criar checkout:', err);
        this.erro = err?.error?.error || 'Erro ao criar sessão de pagamento. Tente novamente.';
      }
    });
  }
}
