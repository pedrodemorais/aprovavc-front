import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import {
  EditalTemplateDTO,
  EstruturaTemplateDTO,
  ClonarEditalRequestDTO,
  ClonarEditalResponseDTO
} from 'src/app/core/area-admin/dto/edital-admin.dto';

@Injectable({ providedIn: 'root' })
export class EditalTemplateService {

  private readonly baseUrl = `${environment.apiUrl}`.replace(/\/+$/, '');
  private readonly api = this.baseUrl.endsWith('/api') ? this.baseUrl : `${this.baseUrl}/api`;
  private readonly templateBase = `${this.api}/admin/editais-template`;
  private readonly templatePublicBase = `${this.api}/editais-template/public`;
  private readonly templatePublicAltBase = `${this.api}/public/editais-template`;
  private readonly orgaoAdminBase = `${this.api}/admin/orgaos`;
  private readonly orgaoBase = `${this.api}/orgaos`;
  private readonly orgaoPublicAltBase = `${this.api}/public/orgaos`;
  private readonly cloneBase = `${this.api}/editais/clonar-template`;

  constructor(private http: HttpClient) {}

  private options() {
    return { withCredentials: true };
  }

  listarTemplates(): Observable<EditalTemplateDTO[]> {
    return this.http.get<EditalTemplateDTO[]>(this.templateBase, this.options());
  }

  listarTemplatesPublicos(): Observable<EditalTemplateDTO[]> {
    return this.http.get<EditalTemplateDTO[]>(this.templatePublicBase).pipe(
      catchError(() => {
        return this.http.get<EditalTemplateDTO[]>(this.templatePublicAltBase);
      }),
      catchError(() => of([]))
    );
  }

  buscarEstrutura(templateId: number): Observable<EstruturaTemplateDTO> {
    return this.http.get<EstruturaTemplateDTO>(`${this.templateBase}/${templateId}/estrutura`, this.options());
  }

  buscarTemplate(templateId: number): Observable<EditalTemplateDTO> {
    return this.http.get<EditalTemplateDTO>(`${this.templateBase}/${templateId}`, this.options());
  }

  buscarImagemArquivo(id: number): Observable<HttpResponse<Blob>> {
    return this.buscarOrgaoIdDoTemplate(id).pipe(
      switchMap((orgaoId) => {
        if (!orgaoId) {
          return throwError(() => new Error('Imagem nao encontrada para o template informado.'));
        }
        return this.buscarImagemOrgaoComFallback(orgaoId);
      })
    );
  }
  clonarTemplate(templateId: number, payload: ClonarEditalRequestDTO = {}): Observable<ClonarEditalResponseDTO> {
    return this.http.post<ClonarEditalResponseDTO>(
      `${this.cloneBase}/${templateId}`,
      payload,
      this.options()
    );
  }

  extrairEditalIdClonado(res: ClonarEditalResponseDTO | number | null | undefined): number | null {
    if (typeof res === 'number') {
      return Number.isFinite(res) && res > 0 ? res : null;
    }
    if (res && typeof res === 'object') {
      const id = Number((res as ClonarEditalResponseDTO).id);
      return Number.isFinite(id) && id > 0 ? id : null;
    }
    return null;
  }

  private buscarImagemTemplateComFallback(id: number): Observable<HttpResponse<Blob>> {
    const urls = [
      `${this.templateBase}/${id}/imagem`
    ];
    return this.buscarBlobComFallback(urls);
  }

  private buscarImagemOrgaoComFallback(orgaoId: number): Observable<HttpResponse<Blob>> {
    const urls = [
      `${this.orgaoAdminBase}/${orgaoId}/imagem`,
      `${this.orgaoBase}/${orgaoId}/imagem`
    ];
    return this.buscarBlobComFallback(urls);
  }

  private buscarOrgaoIdDoTemplate(templateId: number): Observable<number | null> {
    const urls = [
      `${this.templateBase}/${templateId}`
    ];
    return this.buscarTemplateComFallback(urls).pipe(
      map((tpl) => {
        const orgaoId = Number((tpl as any)?.orgaoId);
        return Number.isFinite(orgaoId) && orgaoId > 0 ? orgaoId : null;
      }),
      catchError(() => of(null))
    );
  }

  private buscarBlobComFallback(urls: string[]): Observable<HttpResponse<Blob>> {
    const [urlAtual, ...restante] = urls;
    if (!urlAtual) {
      return throwError(() => new Error('Imagem não encontrada.'));
    }

    return this.http.get(urlAtual, {
      ...this.options(),
      observe: 'response',
      responseType: 'blob'
    }).pipe(
      catchError(() => {
        if (!restante.length) {
          return throwError(() => new Error('Imagem não encontrada.'));
        }
        return this.buscarBlobComFallback(restante);
      })
    );
  }

  private buscarTemplateComFallback(urls: string[]): Observable<EditalTemplateDTO> {
    const [urlAtual, ...restante] = urls;
    if (!urlAtual) {
      return throwError(() => new Error('Template não encontrado.'));
    }

    return this.http.get<EditalTemplateDTO>(urlAtual, this.options()).pipe(
      catchError(() => {
        if (!restante.length) {
          return throwError(() => new Error('Template não encontrado.'));
        }
        return this.buscarTemplateComFallback(restante);
      })
    );
  }
}


