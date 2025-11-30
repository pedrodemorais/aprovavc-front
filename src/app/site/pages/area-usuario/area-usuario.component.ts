import { Component, OnInit, HostListener, ViewChild, ElementRef } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { filter, takeUntil } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { ViewEncapsulation } from '@angular/core';
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
  ) {
    this.user = this.authService.getUser();
    if (!this.user) this.router.navigate(['/login']);

    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects || e.url;
        this.isHome = url === '/area-restrita';
        this.menuAberto = false;
      });
  }

  ngOnInit() {
    this.user = this.authService.getUser();
    const userName = this.authService.getUserNameFromToken();
    if (userName) this.getUserInitials(userName);
    if (!this.user) this.router.navigate(['/login']);

    // carrega provas e depois monta o menu

    
  }


 ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
