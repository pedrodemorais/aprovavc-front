import { Component, OnInit,ViewEncapsulation  } from '@angular/core';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  encapsulation: ViewEncapsulation.None // Desativa o encapsulamento
})
export class TimelineComponent implements OnInit {
  statuses: any[] = [];



  ngOnInit() {
    this.statuses = [
      {
        status: 'Aguardando Pagamento',
        pedidos: [
          { pedido: 1, cliente: 'João Silva',  date: '14/01/2025', icon: 'pi pi-clock' },
          { pedido: 2, cliente: 'Maria Oliveira', date: '15/01/2025', icon: 'pi pi-clock' }
        ]
      },
      {
        status: 'Em Produção',
        pedidos: [
          { pedido: 3, cliente: 'Carlos Lima', date: '16/01/2025', icon: 'pi pi-cog' },
          { pedido: 4, cliente: 'Ana Souza', date: '17/01/2025', icon: 'pi pi-cog' }
        ]
      },
      {
        status: 'Pronto para Entrega',
        pedidos: [
          { pedido: 5, cliente: 'Lucas Rocha', date: '18/01/2025', icon: 'pi pi-check' }
        ]
      }
    ];
  }
}
