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

  private apiUrl = `${environment.apiUrl}/assinaturas`; 
  // Ex: environment.apiUrl = 'http://localhost:8080/api'

  constructor(private http: HttpClient) {}

  criarCheckout(plano: TipoPlano): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${this.apiUrl}/checkout`,
      { plano }
    );
  }
}
