import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  HostListener,
  ViewChild,
  ElementRef,
  ViewEncapsulation,
  NgZone
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'src/app/site/services/auth.service';
import { filter, takeUntil } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { Subject } from 'rxjs';
import { ModoLeituraService } from 'src/app/core/components/area-aluno/services/modo-leitura.service';
import { MateriaService } from 'src/app/core/components/area-aluno/services/materia.service';

@Component({
  selector: 'app-area-usuario',
  templateUrl: './area-usuario.component.html',
  styleUrls: ['./area-usuario.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class AreaUsuarioComponent implements OnInit, AfterViewInit, OnDestroy {

  user: any;
  menuAberto = false;
  userInitials = '';
  isHome = true;

  sonsFocoAberto = false;
  userMenuAberto = false;

  items: MenuItem[] = [];
  hasMaterias = true;
  isAdmin = false;

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
    public modoLeituraService: ModoLeituraService,
    private materiaService: MateriaService,
    private ngZone: NgZone
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
    this.modoLeituraService.init();
    this.user = this.authService.getUser();
    this.atualizarAdminDoToken();

    const userName = this.authService.getUserNameFromToken();
    if (userName) {
      this.getUserInitials(userName);
    }

    if (!this.user) {
      this.router.navigate(['/login']);
      return;
    }

    this.carregarMateriasMenu();
    this.materiaService.materiasChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.carregarMateriasMenu());

    this.authService.tokenAtualizado
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.user = this.authService.getUser();
        this.atualizarAdminDoToken();
        this.montarMenu();
      });


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

  // ✅ CLICK FORA (CAPTURE) — funciona mesmo com stopPropagation do PrimeNG
  private onDocPointerDown = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const clicouSons = !!target.closest('.sons-foco-wrap');
    const clicouUserMenu = !!target.closest('.user-menu-wrap');

    this.ngZone.run(() => {
      if (this.sonsFocoAberto && !clicouSons) {
        this.sonsFocoAberto = false;
      }
      if (this.userMenuAberto && !clicouUserMenu) {
        this.userMenuAberto = false;
      }
    });
  };

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.onDocPointerDown, true); // capture = true
      document.addEventListener('touchstart', this.onDocPointerDown, true); // fallback mobile
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    document.body.classList.remove('modo-leitura');

    document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    document.removeEventListener('touchstart', this.onDocPointerDown, true);

    if (this.audioFoco) {
      this.audioFoco.pause();
      this.audioFoco.src = '';
      this.audioFoco = null;
    }
  }

  // ✅ ESC fecha o painel do som (mantém o que você já tinha funcionando)
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.sonsFocoAberto) {
      this.sonsFocoAberto = false;
    }
  }

  // ============ MENU ============

  toggleSonsFoco(): void {
    this.sonsFocoAberto = !this.sonsFocoAberto;
  }

  toggleUserMenu(): void {
    this.userMenuAberto = !this.userMenuAberto;
  }

  private carregarMateriasMenu(): void {
    this.materiaService.listarMaterias().subscribe({
      next: (lista) => {
        this.hasMaterias = (lista || []).length > 0;
        this.montarMenu();
      },
      error: (err) => {
        console.error('[MENU] Erro ao carregar materias:', err);
        this.hasMaterias = true;
        this.montarMenu();
      }
    });
  }

  private montarMenu(): void {
  
    const adminItem: MenuItem = {
      label: 'Painel Adm',
      icon: 'pi pi-shield',
      routerLink: ['/admin/painel']
    };

  

    const cadastrosMenu: MenuItem = {
      label: 'Cadastros',
      icon: 'pi pi-cog',
      items: [
        {
          label: 'Matérias',
          icon: 'pi pi-book',
          routerLink: ['/area-restrita/cad-materias']
        },
        {
          label: 'Editais/Provas',
          icon: 'pi pi-file-edit',
          routerLink: ['/area-restrita/editais']
        }
      ]
    };

    if (this.assinaturaValida) {
      // 🔓 assinatura OK
      this.items = [
        { label: 'Página inicial', icon: 'pi pi-home', routerLink: ['/area-restrita/dashboard'] },
        { label: 'Centro de Estudo', icon: 'pi pi-play', routerLink: ['/area-restrita/estudar-materias'], disabled: !this.hasMaterias, title: 'Cadastre materias primeiro' },
        
        cadastrosMenu,
        { label: 'Sair', icon: 'pi pi-sign-out', command: () => this.logout() }
      ];
    } else {
      // 🔐 assinatura expirada
      this.items = [
        { label: 'Página inicial', icon: 'pi pi-home', disabled: true },

       

        // ✅ escolha 1: deixar Cadastros liberado (recomendado)
        cadastrosMenu,

        { label: 'Sair', icon: 'pi pi-sign-out', command: () => this.logout() }
      ];
    }
    if (this.isAdmin) {
      const sairIndex = this.items.findIndex(i => i.label === 'Sair');
      const insertIndex = sairIndex >= 0 ? sairIndex : this.items.length;
      this.items.splice(insertIndex, 0, adminItem);
    }
  }

  private atualizarAdminDoToken(): void {
    const token = this.authService.getAccessToken();
    this.isAdmin = this.isAdminFromToken(token);
  }

  private isAdminFromToken(token: string | null): boolean {
    if (!token) return false;

    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return false;

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
      const payload = JSON.parse(atob(padded));

      const role = payload?.role || payload?.roles || payload?.authorities;

      if (typeof role === 'string') {
        return role === 'ROLE_ADMIN';
      }

      if (Array.isArray(role)) {
        return role.includes('ROLE_ADMIN') || role.some((r: any) => r?.authority === 'ROLE_ADMIN');
      }

      return false;
    } catch {
      return false;
    }
  }

  sonsFoco = [
    {
      id: 'white',
      nome: '',
      arquivo: 'assets/sons/mixkit-water-flowing-in-the-river.wav',
      icone: 'assets/img/icon/aceno.png'
    },
    {
      id: 'brown',
      nome: '',
      arquivo: 'assets/sons/10-minute-rain-and-thunder.mp3',
      icone: 'assets/img/icon/chuva.png'
    },
    {
      id: 'pink',
      nome: '',
      arquivo: 'assets/sons/mixkit-sea-waves-ambience.wav',
      icone: 'assets/img/icon/onda.png'
    },
    {
      id: 'fan',
      nome: '',
      arquivo: 'assets/sons/mixkit-river-in-the-forest-with-birds.wav',
      icone: 'assets/img/icon/floresta.png'
    },
    {
      id: 'rain',
      nome: '',
      arquivo: 'assets/sons/relaxing-layered-brown-noise-304725.mp3',
      icone: 'assets/img/icon/barulho.png'
    }
  ];

  private audioFoco: HTMLAudioElement | null = null;
  somAtivoId: string | null = null;   // qual ícone/som está ativo
  volumeSomFoco: number = 0.5;        // se quiser depois pode expor um slider

  private inicializarAudioFoco(): void {
    if (!this.audioFoco) {
      this.audioFoco = new Audio();
      this.audioFoco.loop = true;
      this.audioFoco.volume = this.volumeSomFoco;
    }
  }

  private tocarSom(somId: string): void {
    this.inicializarAudioFoco();
    if (!this.audioFoco) {
      return;
    }

    const som = this.sonsFoco.find(s => s.id === somId);
    if (!som) {
      return;
    }

    // se já está tocando esse mesmo som, parar
    if (this.somAtivoId === somId) {
      this.audioFoco.pause();
      this.somAtivoId = null;
      return;
    }

    // troca a fonte, garante loop e reseta o tempo
    this.audioFoco.src = som.arquivo;
    this.audioFoco.currentTime = 0;
    this.audioFoco.loop = true; // reforça o loop sempre que troca o som

    // fallback manual pro caso de algum navegador ignorar o loop
    this.audioFoco.onended = () => {
      if (this.somAtivoId === somId && this.audioFoco) {
        this.audioFoco.currentTime = 0;
        this.audioFoco.play().catch(err => {
          console.error('Erro ao reiniciar áudio de foco:', err);
        });
      }
    };

    this.audioFoco
      .play()
      .then(() => {
        this.somAtivoId = somId;
      })
      .catch(err => {
        console.error('Erro ao tocar áudio de foco:', err);
        this.somAtivoId = null;
      });
  }

  // chamado ao clicar no ícone
  onClickSomIcone(somId: string): void {
    this.tocarSom(somId);
  }

  // se quiser controlar volume depois:
  mudarVolumeSomFoco(novoVolume: number): void {
    this.volumeSomFoco = novoVolume;
    if (this.audioFoco) {
      this.audioFoco.volume = this.volumeSomFoco;
    }
  }

  onVolumeSomFocoChange(event: any): void {
    const novoVolume = Number(event.target.value);
    this.volumeSomFoco = novoVolume;

    if (this.audioFoco) {
      this.audioFoco.volume = this.volumeSomFoco;
    }
  }

  /**
   * Navegação protegida por assinatura:
   * - Se assinatura válida → navega normalmente
   * - Se expirada → manda pra tela de planos
   */
  private navegarProtegido(url: string): void {
    if (!this.assinaturaValida) {
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
