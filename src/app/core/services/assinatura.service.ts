// src/app/core/services/assinatura.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type TipoPlano = 'BASIC' | 'PREMIUM';

@Injectable({
  providedIn: 'root'
})
export class AssinaturaService {

  // Se environment.apiUrl = 'http://localhost:8080/api'
  // então apiUrl = 'http://localhost:8080/api/assinaturas'
  private apiUrl = `${environment.apiUrl}/assinaturas`;

  constructor(private http: HttpClient) {}

  /**
   * Cria sessão de checkout no backend (Stripe)
   * Espera receber { url: "https://checkout.stripe.com/..." }
   */
  criarCheckout(plano: TipoPlano): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${this.apiUrl}/checkout`,
      { plano }
    );
  }

  /**
   * (Futuro) Portal de gerenciamento da assinatura, se você quiser:
   */
  // abrirPortalCliente(): Observable<{ url: string }> {
  //   return this.http.post<{ url: string }>(
  //     `${this.apiUrl}/portal-cliente`,
  //     {}
  //   );
  // }

  /**
   * (Futuro) Cancelar assinatura:
   */
  // cancelarAssinatura(): Observable<void> {
  //   return this.http.post<void>(`${this.apiUrl}/cancelar`, {});
  // }
}
