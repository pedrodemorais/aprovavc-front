import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { catchError, map, Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    const accessToken = this.authService.getAccessToken();
  
    if (!accessToken) {
      console.warn("🚨 Nenhum access token encontrado. Redirecionando para login...");
      this.authService.logout();
      return of(false);
    }
  
    if (this.authService.isTokenExpired(accessToken)) {
      console.warn("⚠️ Access token expirado! Tentando renovar...");
  
      return this.authService.refreshToken().pipe(
        map(newToken => {
          if (newToken) {
            console.log("🔄 Novo token gerado:", newToken);
            return true;
          } else {
            console.error("❌ Falha ao renovar token. Redirecionando para login.");
            this.authService.logout();
            return false;
          }
        }),
        catchError(error => {
          console.error("❌ Erro ao tentar renovar token:", error);
          this.authService.logout();
          return of(false);
        })
      );
    }
  
    return of(true);
  }
  
  
}
