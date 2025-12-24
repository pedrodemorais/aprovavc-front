import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  EditalTemplateDTO,
  ClonarEditalRequestDTO,
  ClonarEditalResponseDTO
} from 'src/app/core/area-admin/dto/edital-admin.dto';

@Injectable({ providedIn: 'root' })
export class EditalTemplateService {

  private readonly baseUrl = `${environment.apiUrl}`.replace(/\/+$/, '');
  private readonly api = this.baseUrl.endsWith('/api') ? this.baseUrl : `${this.baseUrl}/api`;
  private readonly templateBase = `${this.api}/admin/editais-template`;
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

  listarTemplates(): Observable<EditalTemplateDTO[]> {
    return this.http.get<EditalTemplateDTO[]>(this.templateBase, this.options());
  }

  clonarTemplate(templateId: number, payload: ClonarEditalRequestDTO = {}): Observable<ClonarEditalResponseDTO> {
    return this.http.post<ClonarEditalResponseDTO>(
      `${this.cloneBase}/${templateId}`,
      payload,
      this.options()
    );
  }
}
