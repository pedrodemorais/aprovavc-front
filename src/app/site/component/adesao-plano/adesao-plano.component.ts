import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-adesao-plano',
  templateUrl: './adesao-plano.component.html',
  styleUrls: ['./adesao-plano.component.css']
})
export class AdesaoPlanoComponent {
  subscriptionData: {
    name: string;
    email: string;
    document: string;
    address: string;
    paymentMethod: string;
  } = {
    name: '',
    email: '',
    document: '',
    address: '',
    paymentMethod: ''
  };

  constructor(private router: Router) {}
  submitSubscription(): void {
    console.log('Plano adquirido com sucesso!');
    // Adicione aqui a lógica para processar a adesão ao plano
  }
  adquirirPlano(plan: string) {
    this.router.navigate(['/adquirir-plano'], { queryParams: { plano: plan } });
  }
   // Método para resetar o formulário (opcional)
   resetForm(): void {
    this.subscriptionData = {
      name: '',
      email: '',
      document: '',
      address: '',
      paymentMethod: ''
    };
  }
}
