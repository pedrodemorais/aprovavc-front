import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Observable } from 'rxjs';
import { UsuarioConsultaDTO } from '../models/AlunoParametroDTO';


@Injectable({
  providedIn: 'root'
})
export class PerfilAlunoService {

  private baseUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  /** Dados do usuário logado + aluno + assinatura */
  getUsuarioLogado(): Observable<UsuarioConsultaDTO> {
    return this.http.get<UsuarioConsultaDTO>(`${this.baseUrl}/usuarios/buscar-usuario`);
  }

  /** Chama backend pra criar sessão de checkout Stripe */
  criarCheckout(plano: 'BASIC' | 'PREMIUM'): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(
      `${this.baseUrl}/assinaturas/checkout`,
      { plano }
    );
  }
}
