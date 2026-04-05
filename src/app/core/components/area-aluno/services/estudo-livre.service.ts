import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { MateriaTopicosDTO, SalaEstudoService, TopicoNodeDTO } from './sala-estudo.service';

export interface EstudoLivrePayload {
  materiaNome: string;
  topicoNome: string;
  subtopicoNome?: string;
  tempoMinutos: number;
  observacao?: string;
  observacaoHtml?: string;
}

interface EstudoLivreRegisterBody {
  materiaNome: string;
  topicoNome: string;
  subtopicoNome?: string;
  tempoMinutos: number;
  observacao?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EstudoLivreService {
  private readonly apiUrl = `${environment.apiUrl}/estudo-livre`;

  constructor(
    private http: HttpClient,
    private salaEstudoService: SalaEstudoService
  ) {}

  registrar(payload: EstudoLivrePayload): Observable<unknown> {
    const body: EstudoLivreRegisterBody = {
      materiaNome: payload.materiaNome.trim(),
      topicoNome: payload.topicoNome.trim(),
      subtopicoNome: payload.subtopicoNome?.trim() || undefined,
      tempoMinutos: Number(payload.tempoMinutos),
      observacao: payload.observacao?.trim() || undefined
    };

    return this.http.post<unknown>(this.apiUrl, body).pipe(
      tap(() => this.salaEstudoService.limparCacheRevisoesDashboard()),
      switchMap((resp) => {
        const observacao = body.observacao?.trim() || '';
        if (!observacao) {
          return of(resp);
        }

        return this.resolverIdsParaAnotacao(resp, body).pipe(
          switchMap((ids) => {
            if (!ids) {
              return of(resp);
            }

            const observacaoHtml = payload.observacaoHtml?.trim() || '';
            const anotacoesHtml = observacaoHtml
              ? this.normalizarHtmlAnotacoes(observacaoHtml)
              : `<p>${this.escapeHtml(observacao).replace(/\n/g, '<br>')}</p>`;
            return this.salaEstudoService.salvarEstudo({
              materiaId: ids.materiaId,
              topicoId: ids.topicoId,
              modoTemporizador: 'livre',
              tipoSessao: 'ESTUDO',
              tempoLivreSegundos: 0,
              anotacoes: anotacoesHtml
            }).pipe(
              map(() => resp),
              catchError(() => of(resp))
            );
          }),
          catchError(() => of(resp))
        );
      })
    );
  }

  private resolverIdsParaAnotacao(
    resp: unknown,
    body: EstudoLivreRegisterBody
  ): Observable<{ materiaId: number; topicoId: number } | null> {
    const idsDoResponse = this.extrairIdsDoResponse(resp, !!body.subtopicoNome);
    if (idsDoResponse) {
      return of(idsDoResponse);
    }

    return this.salaEstudoService.listarMateriasParaEstudo('todas').pipe(
      map((materias) => this.resolverIdsPorNome(materias || [], body)),
      catchError(() => of(null))
    );
  }

  private extrairIdsDoResponse(
    resp: unknown,
    prefereSubtopico: boolean
  ): { materiaId: number; topicoId: number } | null {
    const raw = (resp || {}) as Record<string, unknown>;
    const materiaId = this.pickNumber(raw, ['materiaId', 'idMateria']);
    if (!materiaId) return null;

    const subtopicoId = this.pickNumber(raw, ['subtopicoId', 'idSubtopico']);
    const topicoId = this.pickNumber(raw, ['topicoId', 'idTopico']);
    const escolhido = prefereSubtopico ? (subtopicoId || topicoId) : (topicoId || subtopicoId);
    if (!escolhido) return null;

    return { materiaId, topicoId: escolhido };
  }

  private resolverIdsPorNome(
    materias: MateriaTopicosDTO[],
    body: EstudoLivreRegisterBody
  ): { materiaId: number; topicoId: number } | null {
    const materia = (materias || []).find((m) => this.toKey(m?.materiaNome) === this.toKey(body.materiaNome));
    const materiaId = Number(materia?.materiaId || 0);
    if (!materia || materiaId <= 0) return null;

    const topicosRaiz = Array.isArray(materia.topicos) ? materia.topicos : [];
    const topico = this.encontrarTopicoPorNome(topicosRaiz, body.topicoNome);
    if (!topico) return null;

    if (body.subtopicoNome) {
      const subtopico = this.encontrarTopicoPorNome(this.extrairFilhos(topico), body.subtopicoNome);
      const subtopicoId = this.getTopicoId(subtopico);
      if (subtopicoId > 0) {
        return { materiaId, topicoId: subtopicoId };
      }
    }

    const topicoId = this.getTopicoId(topico);
    return topicoId > 0 ? { materiaId, topicoId } : null;
  }

  private encontrarTopicoPorNome(topicos: TopicoNodeDTO[], nome: string): TopicoNodeDTO | null {
    const alvo = this.toKey(nome);
    if (!alvo) return null;

    const stack = Array.isArray(topicos) ? [...topicos] : [];
    while (stack.length) {
      const atual = stack.shift() as TopicoNodeDTO;
      if (this.toKey(String(atual?.descricao || '')) === alvo) {
        return atual;
      }
      const filhos = this.extrairFilhos(atual);
      if (filhos.length) {
        stack.push(...filhos);
      }
    }
    return null;
  }

  private extrairFilhos(topico: TopicoNodeDTO): TopicoNodeDTO[] {
    const filhos = topico?.subtopicos ?? topico?.filhos ?? [];
    return Array.isArray(filhos) ? filhos : [];
  }

  private getTopicoId(topico: TopicoNodeDTO | null | undefined): number {
    return Number(
      topico?.id ??
      topico?.topicoId ??
      topico?.subtopicoId ??
      topico?.idTopico ??
      topico?.idSubtopico ??
      0
    );
  }

  private pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const n = Number(raw?.[key]);
      if (Number.isFinite(n) && n > 0) {
        return n;
      }
    }
    return null;
  }

  private toKey(valor: string | undefined | null): string {
    return String(valor || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private normalizarHtmlAnotacoes(html: string): string {
    const normalizado = String(html || '').trim();
    if (!normalizado) return '';
    return normalizado.replace(/(?:<p><br><\/p>|\s*<p>\s*<\/p>)+/gi, '<p><br></p>').trim();
  }
}
