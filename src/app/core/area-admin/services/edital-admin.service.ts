// src/app/core/area-admin/services/edital-admin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  AtualizarEditalTemplateRequestDTO,
  CriarEditalTemplateRequestDTO,
  EditalTemplateDTO,

  CriarMateriaTemplateRequestDTO,
  MateriaTemplateDTO,
  CriarTopicoTemplateRequestDTO,
  TopicoTemplateDTO,

  EstruturaTemplateDTO,

  ClonarEditalRequestDTO,
  ClonarEditalResponseDTO
} from '../dto/edital-admin.dto';

@Injectable({
  providedIn: 'root'
})
export class EditalAdminService {

  private readonly baseUrl = `${environment.apiUrl}`.replace(/\/+$/, '');
  private readonly api = this.baseUrl.endsWith('/api') ? this.baseUrl : `${this.baseUrl}/api`;

  private readonly adminTemplateBase = `${this.api}/admin/editais-template`;
  private readonly cloneBase = `${this.api}/editais/clonar-template`;

  constructor(private http: HttpClient) {}

  private options() {
    const token = localStorage.getItem('access_token');

    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return { headers, withCredentials: true };
  }

  // =========================
  // ADMIN - TEMPLATES
  // =========================

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

  despublicarTemplate(id: number): Observable<EditalTemplateDTO> {
    return this.http.post<EditalTemplateDTO>(`${this.adminTemplateBase}/${id}/despublicar`, {}, this.options());
  }

  excluirTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminTemplateBase}/${id}`, this.options());
  }

  salvarImagem(id: number, file: File): Observable<EditalTemplateDTO> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<EditalTemplateDTO>(
      `${this.adminTemplateBase}/${id}/imagem`,
      formData,
      this.options()
    );
  }

  buscarImagem(id: number): Observable<string> {
    return this.http.get(`${this.adminTemplateBase}/${id}/imagem`, {
      ...this.options(),
      responseType: 'text'
    });
  }

  buscarImagemArquivo(id: number): Observable<import('@angular/common/http').HttpResponse<Blob>> {
    return this.http.get(`${this.adminTemplateBase}/${id}/imagem`, {
      ...this.options(),
      observe: 'response',
      responseType: 'blob'
    });
  }

  excluirImagem(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminTemplateBase}/${id}/imagem`, this.options());
  }

  // =========================
  // ADMIN - MATERIAS
  // =========================

  listarMaterias(templateId: number): Observable<MateriaTemplateDTO[]> {
    return this.http.get<MateriaTemplateDTO[]>(
      `${this.adminTemplateBase}/${templateId}/materias`,
      this.options()
    );
  }

  criarMateria(templateId: number, payload: CriarMateriaTemplateRequestDTO): Observable<MateriaTemplateDTO> {
    return this.http.post<MateriaTemplateDTO>(
      `${this.adminTemplateBase}/${templateId}/materias`,
      payload,
      this.options()
    );
  }

  excluirMateria(templateId: number, materiaId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}`,
      this.options()
    );
  }

  // =========================
  // ADMIN - TOPICOS
  // =========================

  listarTopicos(templateId: number, materiaId: number): Observable<TopicoTemplateDTO[]> {
    return this.http.get<TopicoTemplateDTO[]>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}/topicos`,
      this.options()
    );
  }

  criarTopico(templateId: number, materiaId: number, payload: CriarTopicoTemplateRequestDTO): Observable<TopicoTemplateDTO> {
    return this.http.post<TopicoTemplateDTO>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}/topicos`,
      payload,
      this.options()
    );
  }

  excluirTopico(templateId: number, materiaId: number, topicoId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}/topicos/${topicoId}`,
      this.options()
    );
  }

  // =========================
  // ADMIN - ESTRUTURA
  // =========================

  buscarEstrutura(templateId: number): Observable<EstruturaTemplateDTO> {
    return this.http.get<EstruturaTemplateDTO>(
      `${this.adminTemplateBase}/${templateId}/estrutura`,
      this.options()
    );
  }

  // =========================
  // CLONE (RETORNA NUMBER)
  // =========================

  clonarTemplateParaAluno(templateId: number, payload: ClonarEditalRequestDTO = {}): Observable<ClonarEditalResponseDTO> {
    return this.http.post<ClonarEditalResponseDTO>(
      `${this.cloneBase}/${templateId}`,
      payload,
      this.options()
    );
  }
}
