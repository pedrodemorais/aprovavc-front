import { Component, Inject, OnInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.component.html',
  styleUrls: ['./inicio.component.css']
})
export class InicioComponent implements OnInit {
    menuItems: any[] = [];
 scrolled = false;
  isBrowser = false;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    console.log('PaginainicialComponent inicializado');
    this.isBrowser = isPlatformBrowser(this.platformId);
  }
  ngOnInit(): void {
    this.menuItems = [
     
      { label: 'Home',  routerLink: '/' },
      { label: 'Sobre',  url: '#sobre-nos' },
      { label: 'Soluções',  url: '#services' },
      { label: 'Planos',  url: '#plans' },
      { label: 'Blog',  url: '#blog' },
      { label: 'Entrar', routerLink: '/login' },
    ];
  }

  

}
