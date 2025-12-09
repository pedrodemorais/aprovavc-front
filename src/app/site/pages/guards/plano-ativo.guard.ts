import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from 'src/app/site/services/auth.service';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PlanoAtivoGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.authService.checarAssinaturaNoBack().pipe(
      map((valida) => {
        if (valida) {
          return true;
        }

        // 🔥 Assinatura não válida → manda pra tela de planos
        return this.router.createUrlTree(
          ['/area-restrita/assinatura'],
          { queryParams: { expirado: true } }
        );
      }),
      catchError((err) => {
        console.error('❌ Erro no PlanoAtivoGuard:', err);
        // se deu ruim, melhor mandar pro login
        return of(this.router.createUrlTree(['/login']));
      })
    );
  }
}
