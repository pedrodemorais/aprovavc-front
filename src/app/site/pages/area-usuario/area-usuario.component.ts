import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ViewChild,
  ElementRef,
  ViewEncapsulation
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { filter, takeUntil } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-area-usuario',
  templateUrl: './area-usuario.component.html',
  styleUrls: ['./area-usuario.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AreaUsuarioComponent implements OnInit, OnDestroy {

  user: any;
  menuAberto = false;
  userInitials = '';
  isHome = true;

  items: MenuItem[] = [];

  // 🔥 Controle de assinatura
  assinaturaValida = true;

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
    if (!this.user) {
      this.router.navigate(['/login']);
    }

    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((e: any) => {
        const url = e.urlAfterRedirects || e.url;
        this.isHome = url === '/area-restrita';
        this.menuAberto = false;
      });
  }

ngOnInit() {
  this.user = this.authService.getUser();

  const userName = this.authService.getUserNameFromToken();
  if (userName) {
    this.getUserInitials(userName);
  }

  if (!this.user) {
    this.router.navigate(['/login']);
    return;
  }

  // 1) Já se inscreve pra reagir a MUDANÇAS (login, renovação, expiração, etc.)
  this.authService.assinaturaValida$
    .pipe(takeUntil(this.destroy$))
    .subscribe(valida => {
      console.log('📡 [MENU] assinaturaValida mudou para:', valida);
      this.assinaturaValida = valida;
      this.montarMenu();
    });

  // 2) Checa no backend como está a assinatura AGORA
  this.authService.checarAssinaturaNoBack()
    .pipe(takeUntil(this.destroy$))
    .subscribe((valida) => {
      console.log('📡 [MENU] Resultado checagem no back:', valida);
      this.assinaturaValida = valida;
      this.montarMenu();
    });
}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============ MENU ============

  private montarMenu(): void {
    const assinaturaValida = this.assinaturaValida;

    this.items = [
      {
        label: 'Página inicial',
        icon: 'pi pi-home',
        disabled: !assinaturaValida,
        command: () => this.navegarProtegido('/area-restrita/dashboard')
      },
      {
        label: 'Matérias',
        icon: 'pi pi-book',
        disabled: !assinaturaValida,
        command: () => this.navegarProtegido('/area-restrita/cad-materias')
      },
      {
        label: 'Editais/Provas',
        icon: 'pi pi-file-edit',
        disabled: !assinaturaValida,
        command: () => this.navegarProtegido('/area-restrita/editais')
      },
      {
        label: 'Meu Cadastro',
        icon: 'pi pi-id-card',
        routerLink: ['/area-restrita/meu-cadastro']
      },
      {
        label: 'Assinatura',
        icon: 'pi pi-credit-card',
        routerLink: ['/area-restrita/assinatura']
      },
      {
        label: 'Sair',
        icon: 'pi pi-sign-out',
        command: () => this.logout()
      }
    ];
  }

  /**
   * Navegação protegida por assinatura:
   * - Se assinatura válida → navega normalmente
   * - Se expirada → manda pra tela de planos
   */
  private navegarProtegido(url: string): void {
    if (!this.assinaturaValida) {
      // opcional: mensagem amigável no front
      localStorage.setItem(
        'notificationMessage',
        'Sua assinatura expirou. Renove o plano para continuar usando as funcionalidades de estudo.'
      );
      this.router.navigate(['/assinatura/planos'], { queryParams: { expirado: 'true' } });
      return;
    }

    this.router.navigate([url]);
  }

  // ============ MENU LATERAL / MOBILE ============

  toggleMenu() {
    this.menuAberto = !this.menuAberto;
  }

  @HostListener('document:click', ['$event'])
  fecharMenu(event: Event) {
    if (!this.menuAberto) return;

    const target = event.target as Node;
    const sideEl = this.sidebarRef?.nativeElement as HTMLElement | undefined;
    const toggleEl = this.toggleRef?.nativeElement as HTMLElement | undefined;

    if (sideEl?.contains(target) || toggleEl?.contains(target)) return;

    this.menuAberto = false;
  }

  // ============ UX / PERFIL ============

  getUserInitials(fullName: string) {
    if (!fullName) {
      this.userInitials = '??';
      return;
    }

    const names = fullName.trim().split(/\s+/);
    const initials = names.length === 1
      ? names[0][0]
      : (names[0][0] + names[names.length - 1][0]);
    this.userInitials = initials.toUpperCase();
  }

  openProfile() {
    this.router.navigate(['/area-restrita/meu-cadastro']);
  }

  openSettings() {
    alert('Abrindo configurações...');
  }

  openSupport() {
    alert('Abrindo suporte...');
  }

  // ============ LOGOUT ============

  logout() {
    this.authService.logout();
  }
}
