import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  private readonly onboardingTemplateKey = 'onboarding:editalTemplateId';

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private editalTemplateService: EditalTemplateService
  ) {}

  listar(): Observable<Edital[]> {
    return this.http.get<Edital[]>(this.apiUrl);
  }

  buscarPorId(id: number): Observable<Edital> {
    return this.http.get<Edital>(`${this.apiUrl}/${id}`);
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
    return this.http.post<void>(`${this.apiUrl}/${id}/ativar`, {});
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
      this.limparTemplatePendente();
      return of(false);
    }

    return this.authService.getUserData().pipe(
      map((user) => this.obterTemplatePadraoDoUsuario(user) ?? this.obterTemplatePendente()),
      switchMap((templateId) => {
        if (!templateId) {
          return of(false);
        }

        const editalParaAtivar = lista.find((e) => this.obterTemplateIdDoEdital(e) === templateId);
        if (editalParaAtivar?.id) {
          return this.selecionarEdital(editalParaAtivar.id).pipe(
            map(() => {
              this.limparTemplatePendente();
              return true;
            }),
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
              map(() => {
                this.limparTemplatePendente();
                return true;
              }),
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

  private obterTemplatePendente(): number | null {
    try {
      const raw = localStorage.getItem(this.onboardingTemplateKey);
      const templateId = Number(raw);
      return Number.isFinite(templateId) && templateId > 0 ? templateId : null;
    } catch {
      return null;
    }
  }

  private limparTemplatePendente(): void {
    try {
      localStorage.removeItem(this.onboardingTemplateKey);
    } catch {}
  }
}

