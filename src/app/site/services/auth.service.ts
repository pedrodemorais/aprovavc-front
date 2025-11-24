import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable,tap,of, throwError, Subject, BehaviorSubject } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { EventEmitter } from '@angular/core';
import { environment } from 'src/environments/environment'; // Importa o environment
import { HttpHeaders } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
 
  tokenAtualizado = new EventEmitter<void>(); 
  private accessTokenSubject = new BehaviorSubject<string | null>(this.getAccessToken());
 
  constructor(private router: Router, private http: HttpClient) {
   }


  login(credentials: { email: string, senha: string }): Observable<{ access_token: string }> {
    return this.http.post<{ access_token: string }>(`${environment.apiUrl}/usuarios/login`, credentials, { withCredentials: true }) // 🚀 Envia e recebe cookies
      .pipe(
        tap(response => {
          
          localStorage.setItem('access_token', response.access_token); // ✅ Salva apenas o access_token
        }),
        catchError((error: HttpErrorResponse) => {
         
  
          if (error.error instanceof ErrorEvent) {
            // Erro de rede ou no cliente
            return throwError(() => new Error(`Erro no cliente ou na rede: ${error.error.message}`));
          } else {
            // Erro vindo do backend
            return throwError(() => error);
          }
        })
      );
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
  }
  

  refreshAccessToken(): void {
    const token = localStorage.getItem('access_token');
  
    if (token) {
      localStorage.removeItem('access_token'); // 🔹 Remove primeiro
      localStorage.setItem('access_token', token); // 🔹 Adiciona novamente
  
      console.info('🔄 Token atualizado no localStorage.');
  
      // 🔥 Dispara evento para notificar que o token foi atualizado
      this.tokenAtualizado.emit();
      window.dispatchEvent(new Event('storage'));
    }
  }
  
  
  /**
   * 🔹 Define um novo accessToken no localStorage
   */
  setAccessToken(token: string): void {
    localStorage.setItem('access_token', token);
    this.accessTokenSubject.next(token); // 🔥 Notifica os observadores
    this.tokenAtualizado.emit();
  }


  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])); // Decodifica o JWT
      const expirationTime = payload.exp * 1000; // Converte para timestamp
      return Date.now() > expirationTime; // Retorna true se expirado
    } catch (error) {
      console.error("❌ Erro ao verificar expiração do token:", error);
      return true;
    }
  }

/**
 * 🔹 Obtém os dados do usuário logado
 */
getUserData(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/usuarios/me`, { withCredentials: true }).pipe(
      tap(user => {
        console.log("📤 Dados do usuário recebidos:", user.nome);
        console.log("📤 ID:", user.id);
      })
    );
}

logout(): void {
    
    localStorage.removeItem('access_token'); // Remove o token do localStorage
    
      this.router.navigate(['/login']); // Redireciona para a tela de login
  
  }

 
decodeToken(token: string): any {
  try {
    const payload = token.split('.')[1]; // Pegamos a parte do payload
    return JSON.parse(atob(payload)); // Decodificamos de Base64 para JSON
  } catch (error) {
    console.error("❌ Erro ao decodificar token JWT:", error);
    return null;
  }
}
getUserNameFromToken(): string | null {
  const token = this.getAccessTokenFromCookie();

  if (!token) {
    console.error("❌ Nenhum token encontrado no cookie.");
    return null;
  }

  try {
    const payloadBase64Url = token.split('.')[1]; // Pega a parte do payload
    const payloadBase64 = payloadBase64Url.replace(/-/g, '+').replace(/_/g, '/'); // Corrige encoding Base64
    const payloadDecoded = atob(payloadBase64); // Decodifica o Base64
    const payloadJson = JSON.parse(payloadDecoded); // Converte para objeto JSON

    console.log("📥 Payload do Token:", payloadJson); // Verifica se o name está correto

    return payloadJson.name || null; // Retorna o name, se existir
  } catch (error) {
    console.error("❌ Erro ao decodificar o token!", error);
    return null;
  }
}


isAuthenticated(): Observable<boolean> {
  const accessToken = this.getAccessToken();

  if (!accessToken) {
    console.warn("🚨 Nenhum token encontrado. Usuário não autenticado.");
    return of(false);
  }

  return this.http.get<{ authenticated: boolean }>(
    `${environment.apiUrl}/usuarios/is-authenticated`,
    {
      headers: { Authorization: `Bearer ${accessToken}` } // ✅ Envia o access_token
    }
  ).pipe(
    map(response => response.authenticated),
    tap(authenticated => console.log("🔍 Usuário autenticado?", authenticated)),
    catchError(error => {
      console.error("❌ Erro ao verificar autenticação:", error);

      // Se o erro for 401 (token expirado), tenta renovar antes de deslogar
      if (error.status === 401) {
        console.warn("⚠️ Access token expirado! Tentando renovar...");

        return this.refreshToken().pipe(
          switchMap(() => this.isAuthenticated()), // 🔄 Tenta autenticar novamente após renovar
          catchError(err => {
            console.error("❌ Erro ao renovar token. Forçando logout.");
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
  console.warn("🔄 Tentando renovar o token...");

  return this.http.post<{ access_token: string }>(
    `${environment.apiUrl}/usuarios/refresh`, 
    {}, 
    { withCredentials: true }
  ).pipe(
    map(response => {
      if (response.access_token) {
        console.log("✅ Novo access token recebido:", response.access_token);
        this.setAccessToken(response.access_token);
        return response.access_token;
      } else {
        console.error("❌ O servidor não retornou um novo access_token.");
        this.logout();
        return "";
      }
    }),
    catchError(error => {
      console.error("❌ Erro ao tentar renovar token:", error);
      this.logout();
      return of("");
    })
  );
}


  // Simulação de cadastro
 register(user: { nome: string; email: string; senha: string }): Observable<any> {
  return this.http.post<any>(`${environment.apiUrl}/usuarios/cadastrar`, user);
}

ativarConta(token: string): Observable<any> {
  return this.http.get(`${environment.apiUrl}/usuarios/ativacao?token=${token}`);
}

getUser() {
    const token = this.getAccessTokenFromCookie();
  
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1])); // Decodifica o token JWT
        console.log("📤 Usuário recuperado do token:", payload);
        return payload;
      } catch (error) {
        console.error("❌ Erro ao decodificar o token JWT:", error);
        return null;
      }
    } else {
      console.log("❌ Nenhum usuário autenticado.");
      return null;
    }
  }

getAccessTokenFromCookie(): string | null {
   
    return this.getAccessToken();
  }
  
  
   /**
   * 🔹 Solicita um token de recuperação de senha.
   * @param email Email do usuário
   * @returns Observable<string>
   */
solicitarToken(email: string): Observable<string> {
    return this.http.post(`${environment.apiUrl}/usuarios/recuperar-senha`, { email }, { responseType: 'text' });
  }

   // 🔹 Valida o token recebido no link
   validarToken(token: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/usuarios/validar-token?token=${token}`);
  }


  redefinirSenha(dados: { token: string, novaSenha: string }) {
    return this.http.post(`${environment.apiUrl}/usuarios/redefinir-senha`, dados, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    });
  }
  

 
  alterarSenha(senhaAtual: string, novaSenha: string): Observable<any> {
    
    const token = this.getAccessTokenFromCookie();
  
    if (!token) {
      console.error("🚨 Nenhum token JWT encontrado! O usuário precisa estar autenticado.");
      return new Observable(observer => {
        observer.error({ error: "Usuário não autenticado." });
        observer.complete();
      });
    }
  
    console.log("📡 Enviando requisição para alterar senha...");
    console.log("🔑 Token sendo enviado: ", token);
  
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // 🔥 Enviando token corretamente!
    });
    console.log("🔍 Token salvo no sessionStorage:", sessionStorage.getItem("authToken"));

    const body = { senhaAtual, novaSenha };
    return this.http.post(`${environment.apiUrl}/usuarios/alterar-senha`, body, { headers });
  }
  





}
