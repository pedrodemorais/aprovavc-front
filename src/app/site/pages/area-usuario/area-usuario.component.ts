import { Component, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { filter, takeUntil } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { ViewEncapsulation } from '@angular/core';
import { ProvaEstudoDTO } from 'src/app/area-restrita/services/prova.service';
import { ProvaEstudoService } from 'src/app/core/services/prova-estudo.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-area-usuario',
  templateUrl: './area-usuario.component.html',
  styleUrls: ['./area-usuario.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AreaUsuarioComponent implements OnInit {
  user: any;
  menuAberto = false;
  userInitials = '';
  isHome = true;

  items: MenuItem[] = [];
  provas: ProvaEstudoDTO[] = [];
private destroy$ = new Subject<void>();

  private cadastroRotas = [
    '/area-restrita/cad-prova',
    '/area-restrita/cad-materias',
    '/area-restrita/meu-cadastro',
    '/area-restrita/edital-verticalizado'
  ];

  @ViewChild('sidebar', { static: false }) sidebarRef!: ElementRef;
  @ViewChild('menuToggle', { static: false }) toggleRef!: ElementRef;

  constructor(
    private authService: AuthService,
    private router: Router,
     private provaEstudoService: ProvaEstudoService         // <<< injeta service
  ) {
    this.user = this.authService.getUser();
    if (!this.user) this.router.navigate(['/login']);

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects || e.url;
        this.isHome = url === '/area-restrita';
        this.menuAberto = false;
        this.rebuildItems(url);  // sempre reconstrói com as provas já carregadas
      });
  }

  ngOnInit() {
    this.user = this.authService.getUser();
    const userName = this.authService.getUserNameFromToken();
    if (userName) this.getUserInitials(userName);
    if (!this.user) this.router.navigate(['/login']);

    // carrega provas e depois monta o menu
    this.carregarProvas();

      this.provaEstudoService.refresh$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.carregarProvas();
      });
    
  }

private carregarProvas() {
  this.provaEstudoService.listar().subscribe({
    next: (provas) => {
      console.log('Provas vindas da API:', provas);
      this.provas = provas;                     // ✅ agora o tipo bate
      this.rebuildItems(this.router.url);
    },
    error: (err) => {
      console.error('Erro ao carregar provas para o menu', err);
      this.provas = [];
      this.rebuildItems(this.router.url);
    }
  });
}

 ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  // === MENU MODEL ===
private rebuildItems(url: string) {
  const abertoPorRotaCadastro = this.cadastroRotas.some(r => url.startsWith(r));

  const provasItems: MenuItem[] = this.provas.map(p => ({
    label: p.nome,  // <<< aqui usa o campo do DTO (confere no JSON)
    icon: 'pi pi-book',
    routerLink: ['/area-restrita/provas', p.id, 'edital']
  }));

  if (provasItems.length === 0) {
    provasItems.push({
      label: 'Nenhuma prova cadastrada',
      disabled: true
    });
  }

  this.items = [
    { label: 'Início', icon: 'pi pi-home', routerLink: ['/area-restrita'] },

    {
      label: 'Cadastrar',
      icon: 'pi pi-folder-open',
      expanded: abertoPorRotaCadastro,
      items: [
        { label: 'Matérias',  icon: 'pi pi-list',      routerLink: ['/area-restrita/cad-materias'] },
        { label: 'Prova',             icon: 'pi pi-briefcase', routerLink: ['/area-restrita/cad-prova'] },
        { label: 'Edital Verticalizado', icon: 'pi pi-sitemap', routerLink: ['/area-restrita/edital-verticalizado'] },
        { label: 'Meu Cadastro',       icon: 'pi pi-user',      routerLink: ['/area-restrita/meu-cadastro'] },
      ]
    },

    {
      label: 'Estudar',
      icon: 'pi pi-check-square',
      items: provasItems
    },

    { label: 'Revisar', icon: 'pi pi-history', routerLink: ['/area-restrita/materias'] }
  ];
}


  // resto da classe igual
  toggleMenu() { this.menuAberto = !this.menuAberto; }

  @HostListener('document:click', ['$event'])
  fecharMenu(event: Event) {
    if (!this.menuAberto) return;
    const target = event.target as Node;
    const sideEl = this.sidebarRef?.nativeElement as HTMLElement | undefined;
    const toggleEl = this.toggleRef?.nativeElement as HTMLElement | undefined;
    if (sideEl?.contains(target) || toggleEl?.contains(target)) return;
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
