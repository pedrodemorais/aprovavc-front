import { Component } from '@angular/core';

@Component({
  selector: 'app-assine',
  templateUrl: './assine.component.html',
  styleUrls: ['./assine.component.css']
})
export class AssineComponent {

  assinarPlano() {
    // Redireciona para o link de pagamento do Mercado Pago (Substitua pelo seu link)
    window.open("https://www.mercadopago.com.br/checkout/v1/payment-link", "_blank");
  }
}
