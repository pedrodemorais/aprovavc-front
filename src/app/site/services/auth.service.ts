import { Inject, Injectable, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, tap, of, throwError, BehaviorSubject } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

export interface LoginResponse {
  access_token: string;
  assinaturaValida: boolean;
  statusAssinatura: string;
  planoAtual: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private assinaturaValidaSubject = new BehaviorSubject<boolean>(false);
  assinaturaValida$ = this.assinaturaValidaSubject.asObservable();

  private statusAssinaturaSubject = new BehaviorSubject<string | null>(null);
  statusAssinatura$ = this.statusAssinaturaSubject.asObservable();

  private planoAtualSubject = new BehaviorSubject<string | null>(null);
  planoAtual$ = this.planoAtualSubject.asObservable();

  // 🔥 Evento pra quem quiser ouvir atualização de token
  tokenAtualizado = new EventEmitter<void>();

  // 🔥 Estado reativo do access_token
  private accessTokenSubject = new BehaviorSubject<string | null>(this.getAccessToken());

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private router: Router,
    private http: HttpClient
  ) {
    // 🔥 IMPORTANTE: reidratar estado ao iniciar (inclusive depois de F5)
    this.recarregarEstadoDoLocalStorage();
  }

  // =====================================================
  //   🔥 REIDRATA OS SUBJECTS A PARTIR DO LOCALSTORAGE
  // =====================================================
  private recarregarEstadoDoLocalStorage(): void {
    if (!this.isBrowser()) return;
    const token = localStorage.getItem('access_token');
    const assinaturaValida = localStorage.getItem('assinaturaValida');
    const statusAssinatura = localStorage.getItem('statusAssinatura');
    const planoAtual = localStorage.getItem('planoAtual');

    // token
    this.accessTokenSubject.next(token);

    // assinatura
    this.assinaturaValidaSubject.next(assinaturaValida === 'true');

    this.statusAssinaturaSubject.next(
      statusAssinatura && statusAssinatura !== 'undefined' && statusAssinatura !== 'null'
        ? statusAssinatura
        : null
    );

    this.planoAtualSubject.next(
      planoAtual && planoAtual !== 'undefined' && planoAtual !== 'null'
        ? planoAtual
        : null
    );
  }

  // ========= LOGIN =========

  login(credentials: { email: string; senha: string }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${environment.apiUrl}/usuarios/login`,
        credentials,
        { withCredentials: true }
      )
      .pipe(
        tap((response) => {
          // ✅ salva o access_token normalmente
          localStorage.setItem('access_token', response.access_token);

          // ✅ guarda status da assinatura
          localStorage.setItem('assinaturaValida', String(response.assinaturaValida));
          localStorage.setItem('statusAssinatura', response.statusAssinatura);
          localStorage.setItem('planoAtual', response.planoAtual);

          // 🔥 notifica observers
          this.accessTokenSubject.next(response.access_token);
          this.assinaturaValidaSubject.next(response.assinaturaValida);
          this.statusAssinaturaSubject.next(response.statusAssinatura);
          this.planoAtualSubject.next(response.planoAtual);

          this.tokenAtualizado.emit();
        }),
        catchError((error: HttpErrorResponse) => {
          if (error.error instanceof ErrorEvent) {
            return throwError(
              () => new Error(`Erro no cliente ou na rede: ${error.error.message}`)
            );
          } else {
            return throwError(() => error);
          }
        })
      );
  }

atualizarStatusAssinaturaFromUser(user: any) {
  const status = user.statusAssinatura ?? '';
  const plano = user.planoAtual ?? '';
  const valida =
    user.assinaturaValida ??
    user.assinaturaAtiva ??
    (status === 'TRIAL' || status === 'ATIVA');

  const exp = user.dataExpiracaoLicenca ?? null;

  // Se você QUISER continuar guardando, ok. Se quiser tirar, pode remover esse bloco.
 

  // 🔥 Fonte de verdade para o app inteiro
  this.statusAssinaturaSubject.next(status);
  this.planoAtualSubject.next(plano);
  this.assinaturaValidaSubject.next(valida);
}

checarAssinaturaNoBack(): Observable<boolean> {
  const accessToken = this.getAccessToken();
  if (!accessToken) {
    console.warn('🚨 Sem token, não dá pra checar assinatura no backend.');
    this.assinaturaValidaSubject.next(false);
    return of(false);
  }

  return this.getUserData().pipe(
    tap((user) => {
      // Atualiza tudo com base no /me
      this.atualizarStatusAssinaturaFromUser(user);
    }),
    map((user) => {
      const status = user.statusAssinatura ?? '';
      const valida =
        user.assinaturaValida ??
        user.assinaturaAtiva ??
        (status === 'TRIAL' || status === 'ATIVA');

      this.assinaturaValidaSubject.next(valida);
      return valida;
    }),
    catchError((err) => {
      console.error('❌ Erro ao checar assinatura no backend:', err);
      this.assinaturaValidaSubject.next(false);
      return of(false);
    })
  );
}


  // ========= HELPERS DE TOKEN =========

  getAccessToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('access_token');
  }

  refreshAccessToken(): void {
    if (!this.isBrowser()) return;
    const token = localStorage.getItem('access_token');

    if (token) {
      localStorage.removeItem('access_token');
      localStorage.setItem('access_token', token);

      console.info('🔄 Token atualizado no localStorage.');
      this.accessTokenSubject.next(token);
      this.tokenAtualizado.emit();
      if (this.isBrowser()) {
        window.dispatchEvent(new Event('storage'));
      }
    }
  }

  setAccessToken(token: string): void {
    if (!this.isBrowser()) return;
    localStorage.setItem('access_token', token);
    this.accessTokenSubject.next(token);
    this.tokenAtualizado.emit();
  }

  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      return Date.now() > expirationTime;
    } catch (error) {
      console.error('❌ Erro ao verificar expiração do token:', error);
      return true;
    }
  }

  // ========= ASSINATURA / PLANO =========

  private getAssinaturaValidaFromStorage(): boolean {
    if (!this.isBrowser()) return false;
    const valor = localStorage.getItem('assinaturaValida');
    return valor === 'true';
  }

  isAssinaturaValida(): boolean {
    return this.getAssinaturaValidaFromStorage();
  }

  getStatusAssinatura(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('statusAssinatura');
  }

  getPlanoAtual(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('planoAtual');
  }

  // ========= DADOS DO USUÁRIO =========

  getUserData(): Observable<any> {
    return this.http
      .get<any>(`${environment.apiUrl}/usuarios/me`, { withCredentials: true })
      .pipe(
        tap((user) => {
          console.log('📤 Dados do usuário recebidos:', user.nome);
          console.log('📤 ID:', user.id);
        })
      );
  }

  decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch (error) {
      console.error('❌ Erro ao decodificar token JWT:', error);
      return null;
    }
  }

  getUserNameFromToken(): string | null {
    const token = this.getAccessTokenFromCookie();

    if (!token) {
      console.error('❌ Nenhum token encontrado no cookie.');
      return null;
    }

    try {
      const payloadBase64Url = token.split('.')[1];
      const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payloadDecoded = atob(payloadBase64);
      const payloadJson = JSON.parse(payloadDecoded);

      console.log('📥 Payload do Token:', payloadJson);

      return payloadJson.name || null;
    } catch (error) {
      console.error('❌ Erro ao decodificar o token!', error);
      return null;
    }
  }

  getUser() {
    const token = this.getAccessTokenFromCookie();

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('📤 Usuário recuperado do token:', payload);
        return payload;
      } catch (error) {
        console.error('❌ Erro ao decodificar o token JWT:', error);
        return null;
      }
    } else {
      console.log('❌ Nenhum usuário autenticado.');
      return null;
    }
  }

  getAccessTokenFromCookie(): string | null {
    return this.getAccessToken();
  }

  // ========= AUTENTICAÇÃO / REFRESH =========

  isAuthenticated(): Observable<boolean> {
    const accessToken = this.getAccessToken();

    if (!accessToken) {
      console.warn('🚨 Nenhum token encontrado. Usuário não autenticado.');
      return of(false);
    }

    return this.http
      .get<{ authenticated: boolean }>(`${environment.apiUrl}/usuarios/is-authenticated`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .pipe(
        map((response) => response.authenticated),
        tap((authenticated) => console.log('🔍 Usuário autenticado?', authenticated)),
        catchError((error) => {
          console.error('❌ Erro ao verificar autenticação:', error);

          if (error.status === 401) {
            console.warn('⚠️ Access token expirado! Tentando renovar...');

            return this.refreshToken().pipe(
              switchMap(() => this.isAuthenticated()),
              catchError((err) => {
                console.error('❌ Erro ao renovar token. Forçando logout.');
                this.logout();
                return of(false);
              })
            );
          }

          return of(false);
        })
      );
  }

  refreshToken(): Observable<string> {
    console.warn('🔄 Tentando renovar o token...');

    return this.http
      .post<{ access_token: string }>(
        `${environment.apiUrl}/usuarios/refresh`,
        {},
        { withCredentials: true }
      )
      .pipe(
        map((response) => {
          if (response.access_token) {
            console.log('✅ Novo access token recebido:', response.access_token);
            this.setAccessToken(response.access_token);
            return response.access_token;
          } else {
            console.error('❌ O servidor não retornou um novo access_token.');
            this.logout();
            return '';
          }
        }),
        catchError((error) => {
          console.error('❌ Erro ao tentar renovar token:', error);
          this.logout();
          return of('');
        })
      );
  }

  // ========= LOGOUT =========

  logout(): void {
    if (this.isBrowser()) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('assinaturaValida');
      localStorage.removeItem('statusAssinatura');
      localStorage.removeItem('planoAtual');
    }

    this.accessTokenSubject.next(null);
    this.assinaturaValidaSubject.next(false);
    this.statusAssinaturaSubject.next(null);
    this.planoAtualSubject.next(null);

    this.router.navigate(['/login']);
  }

  // ========= CADASTRO / ATIVAÇÃO / SENHA =========

  register(user: { nome: string; email: string; senha: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/usuarios/cadastrar`, user);
  }

  ativarConta(token: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/usuarios/ativacao?token=${token}`);
  }

  solicitarToken(email: string): Observable<string> {
    return this.http.post(
      `${environment.apiUrl}/usuarios/recuperar-senha`,
      { email },
      { responseType: 'text' }
    );
  }

  validarToken(token: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/usuarios/validar-token?token=${token}`);
  }

  redefinirSenha(dados: { token: string; novaSenha: string }) {
    return this.http.post(`${environment.apiUrl}/usuarios/redefinir-senha`, dados, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  alterarSenha(senhaAtual: string, novaSenha: string): Observable<any> {
    const token = this.getAccessTokenFromCookie();

    if (!token) {
      console.error('🚨 Nenhum token JWT encontrado! O usuário precisa estar autenticado.');
      return new Observable((observer) => {
        observer.error({ error: 'Usuário não autenticado.' });
        observer.complete();
      });
    }

    console.log('📡 Enviando requisição para alterar senha...');
    console.log('🔑 Token sendo enviado: ', token);

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });
    if (this.isBrowser()) {
      console.log('🔍 Token salvo no sessionStorage:', sessionStorage.getItem('authToken'));
    }

    const body = { senhaAtual, novaSenha };
    return this.http.post(`${environment.apiUrl}/usuarios/alterar-senha`, body, { headers });
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
