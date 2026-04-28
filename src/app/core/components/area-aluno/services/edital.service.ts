import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from 'src/environments/environment';
import { Edital } from '../models/Edital';
import { AuthService } from 'src/app/site/services/auth.service';
import { EditalTemplateService } from './edital-template.service';

export interface EditalFormPayload {
  nome: string;
  cargo?: string | null;
  descricao?: string | null;
  dataProva?: string | null;   // yyyy-MM-dd
  materiasIds: number[];
}

@Injectable({ providedIn: 'root' })
export class EditalService {

  private apiUrl = `${environment.apiUrl}/editais`;
  private alunosUrl = `${environment.apiUrl}/alunos`;
  private readonly noCacheHeaders = new HttpHeaders({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0'
  });

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private editalTemplateService: EditalTemplateService
  ) {}

  listar(): Observable<Edital[]> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http.get<Edital[]>(this.apiUrl, { params, headers: this.noCacheHeaders });
  }

  listarComInclude(include?: string[]): Observable<Edital[]> {
    if (!include?.length) {
      return this.listar();
    }

    const params = new HttpParams()
      .set('include', include.join(','))
      .set('_t', String(Date.now()));
    return this.http.get<Edital[]>(this.apiUrl, { params, headers: this.noCacheHeaders });
  }

  buscarPorId(id: number): Observable<Edital> {
    const params = new HttpParams().set('_t', String(Date.now()));
    return this.http.get<Edital>(`${this.apiUrl}/${id}`, { params, headers: this.noCacheHeaders });
  }

  criar(payload: EditalFormPayload): Observable<Edital> {
    return this.http.post<Edital>(this.apiUrl, payload);
  }

  atualizar(id: number, payload: EditalFormPayload): Observable<Edital> {
    return this.http.put<Edital>(`${this.apiUrl}/${id}`, payload);
  }

  excluir(id: number): Observable<void> {
    const url = `${this.apiUrl}/${id}`;
    console.log('[EDITAL SERVICE] DELETE', url);
    return this.http.delete<void>(url);
  }

  definirComoAtivo(id: number): Observable<void> {
    return this.http.post<any>(`${this.alunosUrl}/${id}/selecionar-edital`, {}).pipe(
      map(() => void 0)
    );
  }

  selecionarEdital(editalId: number): Observable<any> {
    return this.http.post<any>(`${this.alunosUrl}/${editalId}/selecionar-edital`, {});
  }

  desmarcarEdital(editalId: number): Observable<any> {
    return this.http.post<any>(`${this.alunosUrl}/${editalId}/desmarcar-edital`, {});
  }

  garantirEditalPadraoAtivo(editais: Edital[]): Observable<boolean> {
    const lista = editais || [];
    const jaTemAtivo = lista.some((e) => e?.ativo);
    if (jaTemAtivo) {
      return of(false);
    }

    return this.authService.getUserData().pipe(
      map((user) => this.obterTemplatePadraoDoUsuario(user)),
      switchMap((templateId) => {
        if (!templateId) {
          return of(false);
        }

        const editalParaAtivar = lista.find((e) => this.obterTemplateIdDoEdital(e) === templateId);
        if (editalParaAtivar?.id) {
          return this.selecionarEdital(editalParaAtivar.id).pipe(
            map(() => true),
            catchError((err) => {
              console.error('[EDITAL SERVICE] Erro ao ativar edital padrao:', err);
              return of(false);
            })
          );
        }

        return this.editalTemplateService.clonarTemplate(templateId).pipe(
          map((res) => this.editalTemplateService.extrairEditalIdClonado(res)),
          switchMap((editalId) => {
            if (!editalId) {
              return of(false);
            }

            return this.selecionarEdital(editalId).pipe(
              map(() => true),
              catchError((err) => {
                console.error('[EDITAL SERVICE] Erro ao ativar edital clonado padrao:', err);
                return of(false);
              })
            );
          }),
          catchError((err) => {
            console.error('[EDITAL SERVICE] Erro ao clonar edital padrao:', err);
            return of(false);
          })
        );
      }),
      catchError((err) => {
        console.error('[EDITAL SERVICE] Erro ao buscar usuario para ativar edital padrao:', err);
        return of(false);
      })
    );
  }
  atualizarStatusMateria(editalId: number, materiaId: number, ativo: boolean): Observable<void> {
    return this.http.patch<void>(
      `${this.apiUrl}/${editalId}/materias/${materiaId}`,
      { ativo }
    );
  }

  atualizarStatusTopico(editalId: number, topicoId: number, ativo: boolean): Observable<void> {
    return this.http.patch<void>(
      `${this.apiUrl}/${editalId}/topicos/${topicoId}`,
      { ativo }
    );
  }

  private obterTemplatePadraoDoUsuario(user: any): number | null {
    const parametros = user?.aluno?.parametros || [];
    const parametro = (parametros as Array<{ chave?: string; valor?: string }>)
      .find((p) => p?.chave === 'editalTemplateId');

    const templateId = Number(parametro?.valor);
    return Number.isFinite(templateId) && templateId > 0 ? templateId : null;
  }

  private obterTemplateIdDoEdital(edital: Edital): number | null {
    const anyEdital = edital as any;
    const templateId = Number(
      anyEdital?.editalTemplateId ??
      anyEdital?.templateId ??
      anyEdital?.template?.id
    );

    return Number.isFinite(templateId) && templateId > 0 ? templateId : null;
  }
}

