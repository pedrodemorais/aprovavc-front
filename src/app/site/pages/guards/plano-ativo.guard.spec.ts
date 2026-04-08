import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { PlanoAtivoGuard } from './plano-ativo.guard';
import { AuthService } from 'src/app/site/services/auth.service';

describe('PlanoAtivoGuard', () => {
  let guard: PlanoAtivoGuard;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['checarAssinaturaNoBack']);
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        PlanoAtivoGuard,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    guard = TestBed.inject(PlanoAtivoGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('deve permitir acesso quando assinatura for válida', (done) => {
    authServiceSpy.checarAssinaturaNoBack.and.returnValue(of(true));

    guard.canActivate().subscribe(result => {
      expect(result).toBeTrue();
      done();
    });
  });

  it('deve redirecionar para /area-restrita/assinatura quando assinatura inválida', (done) => {
    const fakeUrlTree = {} as any;
    authServiceSpy.checarAssinaturaNoBack.and.returnValue(of(false));
    routerSpy.createUrlTree.and.returnValue(fakeUrlTree);

    guard.canActivate().subscribe(result => {
      expect(routerSpy.createUrlTree).toHaveBeenCalledWith(
        ['/area-restrita/assinatura'],
        { queryParams: { expirado: true } }
      );
      expect(result).toBe(fakeUrlTree);
      done();
    });
  });
});
