import { AfterViewInit, Component, OnInit } from '@angular/core';
import { PaymentService } from 'src/app/services/payment.service';
import { AuthService } from 'src/app/site/services/auth.service';
declare var MercadoPago: any;

@Component({
  selector: 'app-plano-basico',
  templateUrl: './plano-basico.component.html',
  styleUrls: ['./plano-basico.component.css']
})
export class PlanoBasicoComponent implements AfterViewInit, OnInit  {

  private mp: any;
  preferenceId: string = "";
  user: any;

  constructor(private paymentService: PaymentService,private authService: AuthService,) {}
  ngOnInit(): void {
    this.user = this.authService.getUser();
    throw new Error('Method not implemented.');
  }

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

