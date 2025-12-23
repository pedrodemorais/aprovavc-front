// assinatura-cancelada.component.ts
import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-assinatura-cancelada',
  templateUrl: './assinatura-cancelada.component.html'
})
export class AssinaturaCanceladaComponent {
  constructor(private router: Router) {}

  voltar() {
    this.router.navigate(['/']); // ou para a tela de planos
  }
}
