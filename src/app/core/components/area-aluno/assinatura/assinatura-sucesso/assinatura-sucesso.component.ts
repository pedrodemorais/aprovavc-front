// assinatura-sucesso.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-assinatura-sucesso',
  templateUrl: './assinatura-sucesso.component.html'
})
export class AssinaturaSucessoComponent {
  constructor(private router: Router) {}

  voltar() {
    this.router.navigate(['/']); // ajusta pra rota do seu dashboard
  }
}
