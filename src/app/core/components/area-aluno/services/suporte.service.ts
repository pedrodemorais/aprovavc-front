import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

interface SuporteEmailPayload {
  emailRemetente: string;
  assunto: string;
  mensagem: string;
}

@Injectable({
  providedIn: 'root'
})
export class SuporteService {
  private apiUrl = `${environment.apiUrl}/suporte`;

  constructor(private http: HttpClient) {}

  enviarEmail(payload: SuporteEmailPayload): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/email`, payload);
  }
}
