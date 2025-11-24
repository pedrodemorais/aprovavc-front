import { Component , OnInit} from '@angular/core';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.component.html',
  styleUrls: ['./inicio.component.css']
})
export class InicioComponent implements OnInit {
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
