import { Component, AfterViewInit } from '@angular/core';
import { PaymentService } from '../../services/payment.service';

declare var MercadoPago: any;

@Component({
  selector: 'app-payment',
  templateUrl: './payment.component.html',
})
export class PaymentComponent implements AfterViewInit {
  private mp: any;
  preferenceId: string = "";

  constructor(private paymentService: PaymentService) {}

  ngAfterViewInit() {
    this.mp = new MercadoPago('APP_USR-bdc6b40e-be1e-47d2-ae36-0ded60fcc275', { locale: 'pt-BR' });
  }

  initiatePayment() {
    const paymentData = {
      title: "Plano Premium",
      amount: 100.0,
      quantity: 1,
      email: "pedrodemorais1@gmail.com"
    };
  
    this.paymentService.createPreference(paymentData).subscribe(
      (response: any) => {
        console.log("Resposta do backend:", response);
  
        if (response.preferenceId) {
          this.preferenceId = response.preferenceId;
          console.log("Preference ID recebida:", this.preferenceId);
          this.renderPaymentButton();
        } else {
          console.error("Erro: preferenceId não encontrada na resposta!");
        }
      },
      (error) => {
        console.error("Erro ao criar preferência de pagamento:", error);
      }
    );
  }
  
  renderPaymentButton() {
    if (!this.preferenceId) {
      console.error("Erro: preferenceId não definida.");
      return;
    }
  
    if (!this.mp) {
      console.error("Erro: MercadoPago não foi inicializado corretamente.");
      return;
    }
  
    console.log("Renderizando botão com preferenceId:", this.preferenceId);
  
    this.mp.bricks().create("wallet", "wallet_container", {
      initialization: {
        preferenceId: this.preferenceId, // Define a preferência gerada pelo backend
      },
      customization: {
        texts: {
          valueProp: 'smart_option',
        },
      },
    }).then(() => {
      console.log("Botão renderizado com sucesso!");
    }).catch((error: any) => {
      console.error("Erro ao renderizar o botão:", error);
    });
  }
  
}
