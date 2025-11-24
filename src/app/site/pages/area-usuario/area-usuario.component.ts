import { Component, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { filter } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-area-usuario',
  templateUrl: './area-usuario.component.html',
  styleUrls: ['./area-usuario.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AreaUsuarioComponent implements OnInit {
  user: any;
  menuAberto = false;        // sidebar mobile
  userInitials = '';
  isHome = true;


  items: MenuItem[] = [];

  // rotas que pertencem a "Cadastro"
  private cadastroRotas = [
    '/area-restrita/content/revisao-estudos',
    '/area-restrita/content/marcas',
    '/area-restrita/content/equipamentos',
    '/area-restrita/content/categorias'
  ];

  @ViewChild('sidebar', { static: false }) sidebarRef!: ElementRef; // <nav #sidebar>
  @ViewChild('menuToggle', { static: false }) toggleRef!: ElementRef; // botão hamburguer (se tiver)

  constructor(private authService: AuthService, private router: Router) {
    this.user = this.authService.getUser();
    if (!this.user) this.router.navigate(['/login']);

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects || e.url;
        this.isHome = url === '/area-restrita/gestor';
        this.menuAberto = false; // fecha sidebar mobile ao navegar
        this.rebuildItems(url);  // mantém "Cadastro" expandido certo
      });
  }

  ngOnInit() {
    this.user = this.authService.getUser();
    const userName = this.authService.getUserNameFromToken();
    if (userName) this.getUserInitials(userName);
    if (!this.user) this.router.navigate(['/login']);

    // monta itens inicialmente
    this.rebuildItems(this.router.url);
  }

  // === MENU MODEL ===
private rebuildItems(url: string) {
  const abertoPorRota = this.cadastroRotas.some(r => url.startsWith(r));
  this.items = [
    { label: 'Início', icon: 'pi pi-home', routerLink: ['/area-restrita'] },
    {
      label: 'Cadastro',
      icon: 'pi pi-folder-open',
      expanded: abertoPorRota,      // abre se a rota atual for de um filho
      // ⚠️ sem command aqui!
      items: [
        { label: 'Provas',     icon: 'pi pi-user',   routerLink: ['/area-restrita/cad-prova'] },
        
        
        { label: 'Matérias da Prova',     icon: 'pi pi-user',   routerLink: ['/area-restrita/cad-materias'] },
       // { label: 'Revisão',     icon: 'pi pi-user',   routerLink: ['/area-restrita/materias'] },
       // { label: 'Categorias',   icon: 'pi pi-list',   routerLink: ['/area-restrita/content/categorias'] },
       { label: 'Meu Cadastro',  icon: 'pi pi-id-card',   routerLink: ['/area-restrita/meu-cadastro'] },
       { label: 'Edital Verticalizado',  icon: 'pi pi-id-card',   routerLink: ['/area-restrita/edital-verticalizado'] },
          
      ]
    },
   
    { label: 'Meu Cadastro',  icon: 'pi pi-id-card',   routerLink: ['/area-restrita/content/meu-cadastro'] },
    { label: 'Minhas Revisões',     icon: 'pi pi-box',       routerLink: ['/area-restrita/materias'] }
  ];
}


  // Encontra o grupo "Cadastro" e alterna seu expanded persistindo


  // === UI / UX ===
  toggleMenu() { this.menuAberto = !this.menuAberto; }

@HostListener('document:click', ['$event'])
fecharMenu(event: Event) {
  if (!this.menuAberto) return; // só no modo mobile
  const target = event.target as Node;
  const sideEl = this.sidebarRef?.nativeElement as HTMLElement | undefined;
  const toggleEl = this.toggleRef?.nativeElement as HTMLElement | undefined;

  if (sideEl?.contains(target) || toggleEl?.contains(target)) return; // clique dentro -> não fecha
  this.menuAberto = false;
}

  getUserInitials(fullName: string) {
    if (!fullName) { this.userInitials = '??'; return; }
    const names = fullName.trim().split(/\s+/);
    const initials = names.length === 1
      ? names[0][0]
      : (names[0][0] + names[names.length - 1][0]);
    this.userInitials = initials.toUpperCase();
  }

  openProfile() { this.router.navigate(['/gestor']); }
  openSettings() { alert('Abrindo configurações...'); }
  openSupport() { alert('Abrindo suporte...'); }
  logout() { this.authService.logout(); }
}
