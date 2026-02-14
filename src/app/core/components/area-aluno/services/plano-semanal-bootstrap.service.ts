import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BlocoEstudoDTO } from '../../dto/blocos-estudo.dto';
import { Edital } from '../models/Edital';
import { BlocosEstudoService } from './blocos-estudo.service';
import { EditalService } from './edital.service';

@Injectable({ providedIn: 'root' })
export class PlanoSemanalBootstrapService {
  private emExecucao = false;

  constructor(
    private blocosService: BlocosEstudoService,
    private editalService: EditalService
  ) {}

  preencherSeNecessarioNoLogin(): Observable<boolean> {
    if (this.emExecucao) return of(false);
    this.emExecucao = true;

    return this.obterEditaisAtivosGarantindoPadrao().pipe(
      switchMap((ativos) => {
        if (!ativos.length) return of(false);

        return this.obterIdsMateriasAtivas(ativos).pipe(
          switchMap((materiaIds) => {
            const pool = materiaIds.slice(0, 6);
            if (!pool.length) return of(false);

            return this.blocosService.listarBlocos().pipe(
              switchMap((blocos) => {
                const lista = (blocos || []).slice().sort((a, b) => a.numero - b.numero);
                if (!lista.length) return of(false);
                if (!this.semanaEstaVazia(lista)) return of(false);

                const planejados = this.aplicarDistribuicaoInicial(lista, pool);
                const blocosParaPersistir = planejados.filter((b) => {
                  const minutos = Number(b.minutosDisponiveis || 0);
                  const itens = b.itens || [];
                  return minutos > 0 && itens.length > 0;
                });
                if (!blocosParaPersistir.length) return of(false);

                return forkJoin(
                  blocosParaPersistir.map((bloco) =>
                    this.blocosService.atualizarBloco(bloco.numero, {
                      minutosDisponiveis: bloco.minutosDisponiveis ?? 0,
                      itens: (bloco.itens || []).map((it, idx) => ({
                        id: it.id ?? undefined,
                        materiaEstudoId: it.materiaEstudoId,
                        ordem: idx + 1,
                        peso: it.peso ?? undefined
                      }))
                    })
                  )
                ).pipe(map(() => true));
              })
            );
          })
        );
      }),
      catchError(() => of(false)),
      map((resultado) => {
        this.emExecucao = false;
        return resultado;
      })
    );
  }

  private obterEditaisAtivosGarantindoPadrao(): Observable<Edital[]> {
    return this.editalService.listar().pipe(
      switchMap((editais) => {
        const lista = editais || [];
        if (lista.some((e) => e?.ativo)) {
          return of(lista.filter((e) => e?.ativo));
        }

        return this.editalService.garantirEditalPadraoAtivo(lista).pipe(
          switchMap((ativou) => {
            if (!ativou) return of([]);
            return this.editalService.listar().pipe(
              map((recarregado) => (recarregado || []).filter((e) => e?.ativo)),
              catchError(() => of([]))
            );
          })
        );
      }),
      catchError(() => of([]))
    );
  }

  private obterIdsMateriasAtivas(editaisAtivos: Edital[]): Observable<number[]> {
    const idsDiretos = this.extrairMateriaIds(editaisAtivos);
    if (idsDiretos.length) return of(idsDiretos);

    const ativosComId = (editaisAtivos || []).filter((e) => Number((e as any)?.id) > 0);
    if (!ativosComId.length) return of([]);

    return forkJoin(
      ativosComId.map((e) => this.editalService.buscarPorId(Number((e as any).id)))
    ).pipe(
      map((detalhes) => this.extrairMateriaIds(detalhes || [])),
      catchError(() => of([]))
    );
  }

  private extrairMateriaIds(editais: Edital[]): number[] {
    const ids = new Set<number>();
    (editais || []).forEach((edital) => {
      (edital?.materias || []).forEach((materia: any) => {
        if (materia?.ativo === false) return;
        const rawId =
          materia?.materiaId ??
          materia?.idMateria ??
          materia?.materia?.id ??
          materia?.id;
        const materiaId = Number(rawId);
        if (Number.isFinite(materiaId) && materiaId > 0) {
          ids.add(materiaId);
        }
      });
    });
    return Array.from(ids);
  }

  private semanaEstaVazia(blocos: BlocoEstudoDTO[]): boolean {
    return (blocos || []).every((bloco) => {
      const itens = bloco?.itens || [];
      const minutos = Number(bloco?.minutosDisponiveis || 0);
      return itens.length === 0 && minutos <= 0;
    });
  }

  private aplicarDistribuicaoInicial(blocos: BlocoEstudoDTO[], poolIds: number[]): BlocoEstudoDTO[] {
    const distribuicao = this.gerarDistribuicao(poolIds);
    const minutosPorMateria = 60;

    return (blocos || []).map((bloco) => {
      const numero = Number(bloco.numero);
      const idxDia = numero - 1;
      if (idxDia < 0 || idxDia > 5) {
        return { ...bloco, itens: [], minutosDisponiveis: 0 };
      }

      const idsDia = distribuicao[idxDia] || [];
      const itens = idsDia.map((materiaId, idx) => ({
        id: undefined,
        materiaEstudoId: materiaId,
        ordem: idx + 1,
        peso: minutosPorMateria
      }));
      return {
        ...bloco,
        itens,
        minutosDisponiveis: idsDia.length * minutosPorMateria
      };
    });
  }

  private gerarDistribuicao(poolIds: number[]): number[][] {
    const dias = 6;
    const slotsPorDia = 3;
    const out: number[][] = Array.from({ length: dias }, () => []);
    const restante = new Map<number, number>(poolIds.map((id) => [id, 2]));
    const alvo = poolIds.length * 2;

    let alocados = 0;
    let cursorDia = 0;
    let guard = 0;

    while (alocados < alvo && guard < 1000) {
      guard += 1;
      const dia = cursorDia % dias;
      cursorDia += 1;

      if (out[dia].length >= slotsPorDia) continue;

      const candidatos = poolIds.filter((id) => {
        const falta = restante.get(id) || 0;
        if (falta <= 0) return false;
        if (out[dia].includes(id)) return false;
        return true;
      });

      if (!candidatos.length) continue;

      const diaAnterior = dia > 0 ? out[dia - 1] : [];
      const semAnterior = candidatos.filter((id) => !diaAnterior.includes(id));
      const universo = semAnterior.length ? semAnterior : candidatos;

      const escolhido = universo
        .slice()
        .sort((a, b) => {
          const ra = restante.get(a) || 0;
          const rb = restante.get(b) || 0;
          if (rb !== ra) return rb - ra;
          return a - b;
        })[0];

      if (!escolhido) continue;

      out[dia].push(escolhido);
      restante.set(escolhido, Math.max(0, (restante.get(escolhido) || 0) - 1));
      alocados += 1;
    }

    return out;
  }
}

