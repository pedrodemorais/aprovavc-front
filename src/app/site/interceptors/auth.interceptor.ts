import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, finalize } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let token = this.authService.getAccessToken();

    // 🔹 Evita interceptar a própria requisição de refresh para não gerar loop
    if (req.url.includes('/refresh')) {
      return next.handle(req);
    }

    // 🔹 Se o token estiver expirado, primeiro faz o refresh antes de continuar a requisição
    if (token && this.authService.isTokenExpired(token)) {
      return this.authService.refreshToken().pipe(
        switchMap(newToken => {
          // ✅ Atualiza a requisição original com o novo token e a reenvia
          req = this.addToken(req, newToken);
          return next.handle(req);
        }),
        catchError(error => {
          return throwError(error);
        })
      );
    }

    // 🔹 Se o token ainda for válido, segue normalmente
    if (token) {
      req = this.addToken(req, token);
    }

    return next.handle(req);
  }

  private addToken(request: HttpRequest<any>, token: string) {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
}
