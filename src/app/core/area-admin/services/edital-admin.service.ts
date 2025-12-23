// src/app/core/area-admin/services/edital-admin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  AtualizarEditalTemplateRequestDTO,
  ClonarEditalRequestDTO,
  ClonarEditalResponseDTO,
  CriarEditalTemplateRequestDTO,
  EditalTemplateDTO
} from '../dto/edital-admin.dto';

@Injectable({
  providedIn: 'root'
})
export class EditalAdminService {

  /**
   * ✅ NÃO VAI DAR /api/api
   * - se environment.apiUrl = http://localhost:8080/api  -> mantém
   * - se environment.apiUrl = http://localhost:8080      -> adiciona /api
   */
  private readonly baseUrl = `${environment.apiUrl}`.replace(/\/+$/, '');
  private readonly api = this.baseUrl.endsWith('/api') ? this.baseUrl : `${this.baseUrl}/api`;

  // ADMIN endpoints (ROLE_ADMIN)
  private readonly adminTemplateBase = `${this.api}/admin/editais-template`;

  // CLONE endpoint
  // Se seu backend usa outro caminho, troca SÓ aqui.
  private readonly cloneBase = `${this.api}/editais/clonar-template`;

  constructor(private http: HttpClient) {}

  // =====================================================
  // ✅ OPTIONS: Bearer + withCredentials (igual seu Auth)
  // =====================================================
  private options() {
    const token = localStorage.getItem('access_token');

    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return {
      headers,
      withCredentials: true
    };
  }

  // =====================================================
  // ADMIN - TEMPLATES (ROLE_ADMIN)
  // =====================================================

  listarTemplates(): Observable<EditalTemplateDTO[]> {
    return this.http.get<EditalTemplateDTO[]>(this.adminTemplateBase, this.options());
  }

  buscarTemplatePorId(id: number): Observable<EditalTemplateDTO> {
    return this.http.get<EditalTemplateDTO>(`${this.adminTemplateBase}/${id}`, this.options());
  }

  criarTemplate(payload: CriarEditalTemplateRequestDTO): Observable<EditalTemplateDTO> {
    return this.http.post<EditalTemplateDTO>(this.adminTemplateBase, payload, this.options());
  }

  atualizarTemplate(id: number, payload: AtualizarEditalTemplateRequestDTO): Observable<EditalTemplateDTO> {
    return this.http.put<EditalTemplateDTO>(`${this.adminTemplateBase}/${id}`, payload, this.options());
  }

  publicarTemplate(id: number): Observable<EditalTemplateDTO> {
    return this.http.post<EditalTemplateDTO>(`${this.adminTemplateBase}/${id}/publicar`, {}, this.options());
  }

  excluirTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminTemplateBase}/${id}`, this.options());
  }

  // =====================================================
  // CLONE - TEMPLATE -> EDITAL DO ALUNO
  // =====================================================

  clonarTemplateParaAluno(templateId: number, payload: ClonarEditalRequestDTO = {}): Observable<ClonarEditalResponseDTO> {
    return this.http.post<ClonarEditalResponseDTO>(`${this.cloneBase}/${templateId}`, payload, this.options());
  }
}
