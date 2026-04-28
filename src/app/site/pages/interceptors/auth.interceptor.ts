import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from 'src/app/site/services/auth.service';
import { catchError, switchMap, finalize } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshing = false;
  private refreshToken$?: Observable<string>;

  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const apiRequest = this.isApiRequest(req.url);
    let token = this.authService.getAccessToken();

    // Avoid intercepting the refresh request itself to prevent loops.
    if (req.url.includes('/refresh')) {
      return next.handle(req);
    }

    if (apiRequest && !req.withCredentials) {
      req = req.clone({ withCredentials: true });
    }

    // If token is expired, try refresh before sending the request.
    if (token && this.authService.isTokenExpired(token)) {
      return this.handle401(req, next);
    }

    if (token) {
      req = this.addToken(req, token);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          if (!apiRequest) {
            return throwError(() => error);
          }
          return this.handle401(req, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.refreshing) {
      this.refreshing = true;
      this.refreshToken$ = this.authService.refreshToken().pipe(
        finalize(() => {
          this.refreshing = false;
          this.refreshToken$ = undefined;
        })
      );
    }

    return (this.refreshToken$ || this.authService.refreshToken()).pipe(
      switchMap((newToken) => {
        if (!newToken) {
          this.authService.logout();
          return throwError(() => new Error('Token refresh failed.'));
        }
        const retryReq = this.addToken(req, newToken).clone({ withCredentials: true });
        return next.handle(retryReq);
      }),
      catchError((err) => {
        this.authService.logout();
        return throwError(() => err);
      })
    );
  }

  private addToken(request: HttpRequest<any>, token: string) {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private isApiRequest(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('/api/')) return true;
    return url.startsWith(environment.apiUrl);
  }
}
