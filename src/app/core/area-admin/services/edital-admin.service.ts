// src/app/core/area-admin/services/edital-admin.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  AtualizarEditalTemplateRequestDTO,
  CriarEditalTemplateRequestDTO,
  EditalTemplateDTO,
  OrgaoDTO,
  AreaDTO,
  CargoDTO,
  PageDTO,

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
  private readonly adminOrgaosBase = `${this.api}/admin/orgaos`;
  private readonly adminAreasBase = `${this.api}/admin/areas`;
  private readonly adminCargosBase = `${this.api}/admin/cargos`;
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
  // ADMIN - CADASTROS BASE
  // =========================

  listarOrgaos(): Observable<OrgaoDTO[]> {
    return this.http.get<OrgaoDTO[]>(this.adminOrgaosBase, this.options());
  }

  listarOrgaosPaginado(search = '', page = 0, size = 20): Observable<PageDTO<OrgaoDTO>> {
    const params = new HttpParams()
      .set('search', search || '')
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'nome,asc');
    return this.http.get<PageDTO<OrgaoDTO>>(this.adminOrgaosBase, { ...this.options(), params });
  }

  criarOrgao(nome: string): Observable<OrgaoDTO> {
    return this.http.post<OrgaoDTO>(this.adminOrgaosBase, { nome }, this.options());
  }

  atualizarOrgao(id: number, nome: string): Observable<OrgaoDTO> {
    return this.http.put<OrgaoDTO>(`${this.adminOrgaosBase}/${id}`, { nome }, this.options());
  }

  excluirOrgao(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminOrgaosBase}/${id}`, this.options());
  }

  salvarImagemOrgao(id: number, file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`${this.adminOrgaosBase}/${id}/imagem`, formData, this.options());
  }

  buscarImagemOrgao(id: number): Observable<string> {
    return this.http.get(`${this.adminOrgaosBase}/${id}/imagem`, {
      ...this.options(),
      responseType: 'text'
    });
  }

  buscarImagemOrgaoArquivo(id: number): Observable<import('@angular/common/http').HttpResponse<Blob>> {
    return this.http.get(`${this.adminOrgaosBase}/${id}/imagem`, {
      ...this.options(),
      observe: 'response',
      responseType: 'blob'
    });
  }

  excluirImagemOrgao(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminOrgaosBase}/${id}/imagem`, this.options());
  }

  listarAreas(): Observable<AreaDTO[]> {
    return this.http.get<AreaDTO[]>(this.adminAreasBase, this.options());
  }

  listarAreasPaginado(search = '', page = 0, size = 20): Observable<PageDTO<AreaDTO>> {
    const params = new HttpParams()
      .set('search', search || '')
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'nome,asc');
    return this.http.get<PageDTO<AreaDTO>>(this.adminAreasBase, { ...this.options(), params });
  }

  criarArea(nome: string): Observable<AreaDTO> {
    return this.http.post<AreaDTO>(this.adminAreasBase, { nome }, this.options());
  }

  atualizarArea(id: number, nome: string): Observable<AreaDTO> {
    return this.http.put<AreaDTO>(`${this.adminAreasBase}/${id}`, { nome }, this.options());
  }

  excluirArea(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminAreasBase}/${id}`, this.options());
  }

  listarCargos(): Observable<CargoDTO[]> {
    return this.http.get<CargoDTO[]>(this.adminCargosBase, this.options());
  }

  listarCargosPaginado(search = '', page = 0, size = 20): Observable<PageDTO<CargoDTO>> {
    const params = new HttpParams()
      .set('search', search || '')
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'nome,asc');
    return this.http.get<PageDTO<CargoDTO>>(this.adminCargosBase, { ...this.options(), params });
  }

  criarCargo(nome: string): Observable<CargoDTO> {
    return this.http.post<CargoDTO>(this.adminCargosBase, { nome }, this.options());
  }

  atualizarCargo(id: number, nome: string): Observable<CargoDTO> {
    return this.http.put<CargoDTO>(`${this.adminCargosBase}/${id}`, { nome }, this.options());
  }

  excluirCargo(id: number): Observable<void> {
    return this.http.delete<void>(`${this.adminCargosBase}/${id}`, this.options());
  }

  listarAreasPorOrgao(orgaoId: number): Observable<AreaDTO[]> {
    return this.http.get<AreaDTO[]>(`${this.adminOrgaosBase}/${orgaoId}/areas`, this.options());
  }

  vincularAreaAoOrgao(orgaoId: number, areaId: number): Observable<void> {
    return this.http.post<void>(`${this.adminOrgaosBase}/${orgaoId}/areas/${areaId}`, {}, this.options());
  }

  desvincularAreaDoOrgao(orgaoId: number, areaId: number): Observable<void> {
    return this.http.delete<void>(`${this.adminOrgaosBase}/${orgaoId}/areas/${areaId}`, this.options());
  }

  listarCargosPorArea(areaId: number): Observable<CargoDTO[]> {
    return this.http.get<CargoDTO[]>(`${this.adminAreasBase}/${areaId}/cargos`, this.options());
  }

  vincularCargoNaArea(areaId: number, cargoId: number): Observable<void> {
    return this.http.post<void>(`${this.adminAreasBase}/${areaId}/cargos/${cargoId}`, {}, this.options());
  }

  desvincularCargoDaArea(areaId: number, cargoId: number): Observable<void> {
    return this.http.delete<void>(`${this.adminAreasBase}/${areaId}/cargos/${cargoId}`, this.options());
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

  atualizarMateria(
    templateId: number,
    materiaId: number,
    payload: Partial<CriarMateriaTemplateRequestDTO>
  ): Observable<MateriaTemplateDTO> {
    return this.http.put<MateriaTemplateDTO>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}`,
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

  atualizarTopico(
    templateId: number,
    materiaId: number,
    topicoId: number,
    payload: Partial<CriarTopicoTemplateRequestDTO>
  ): Observable<TopicoTemplateDTO> {
    return this.http.put<TopicoTemplateDTO>(
      `${this.adminTemplateBase}/${templateId}/materias/${materiaId}/topicos/${topicoId}`,
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
