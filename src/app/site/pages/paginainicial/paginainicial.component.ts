import { Component,OnInit  } from '@angular/core';

@Component({
  selector: 'app-paginainicial',
  templateUrl: './paginainicial.component.html', // Referência ao arquivo HTML
  styleUrls: ['./paginainicial.component.css'], // Referência ao arquivo CSS, se existir
})
export class PaginainicialComponent implements OnInit{
  menuItems: any[] = [];

  constructor() {
    console.log('PaginainicialComponent inicializado');
  }
  ngOnInit(): void {
    this.menuItems = [
     
      { label: 'Home',  routerLink: '/' },
      { label: 'Sobre',  url: '#sobre-nos' },
      { label: 'Soluções',  url: '#services' },
      { label: 'Planos',  url: '#plans' },
      { label: 'Blog',  url: '#blog' },
      { label: 'Contato', url: '#contact' },
      { label: 'Entrar', routerLink: '/login' },
    ];
  }
}
