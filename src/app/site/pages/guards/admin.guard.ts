import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    const token = this.authService.getAccessToken();

    if (!token) {
      this.authService.logout();
      return this.router.createUrlTree(['/login']);
    }

    // Se teu AuthService já tem método pra pegar roles, use ele.
    // Se não tiver, decodifica do JWT direto:
    const payload = this.decodePayload(token);

    const role = payload?.role || payload?.roles || payload?.authorities;

    const isAdmin =
      (typeof role === 'string' && (role === 'ROLE_ADMIN' || role === 'ADMIN')) ||
      (Array.isArray(role) && (role.includes('ROLE_ADMIN') || role.includes('ADMIN'))) ||
      (Array.isArray(role) && role.some((r: any) => r?.authority === 'ROLE_ADMIN'));

    return isAdmin ? true : this.router.createUrlTree(['/area-restrita/dashboard']);
  }

  private decodePayload(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
      return JSON.parse(decodeURIComponent(escape(atob(padded))));
    } catch {
      return null;
    }
  }
}
