// shared/comunicacao.service.ts
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ComunicacaoService {

  private salvarSubject = new Subject<void>();
  salvar$ = this.salvarSubject.asObservable();

  private novoSubject = new Subject<void>();
  novo$ = this.novoSubject.asObservable();

  private excluirSubject = new Subject<void>();
  excluir$ = this.excluirSubject.asObservable();

  private pesquisarSubject = new Subject<void>();
  pesquisar$ = this.pesquisarSubject.asObservable();

  private imprimirSubject = new Subject<void>();
  imprimir$ = this.imprimirSubject.asObservable();

  private tituloSource = new Subject<string>();
  titulo$ = this.tituloSource.asObservable();

  private proximo = new Subject<string>();
  proximo$ = this.proximo.asObservable();

  acao$ = new Subject<string>();

  emitirSalvar() {
    this.salvarSubject.next();
    console.log('bateu aqui agora')
  }

  emitirNovo() {
    this.novoSubject.next();
  }

  emitirExcluir() {
    this.excluirSubject.next();
     console.log('bateu no emitirExcluir')
  }

  emitirPesquisar() {
    this.pesquisarSubject.next();
  }

  emitirImprimir() {
    this.imprimirSubject.next();
  }

   emitirTitulo(titulo: string) {
    this.tituloSource.next(titulo);
  }

   emitirAcao(acao: string,payload?: any) {
     console.log('[bus] emit', acao, payload);
    this.acao$.next(acao);
  }

  emitirOnUltimo() {
    console.log('bateu no onUltimo');
    this.acao$.next('onUltimo');
  }

  emitirOnProximo() {
    console.log('bateu no onProximo');
    this.proximo.next('onProximo');
  }
  emitirOnAnterior() {
    console.log('bateu no onAnterior');
    this.acao$.next('onAnterior');
  }
  emitirOnPrimeiro() {
    console.log('bateu no onPrimeiro');
    this.acao$.next('onPrimeiro');
  }
}
