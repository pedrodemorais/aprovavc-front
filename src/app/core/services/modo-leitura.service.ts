import { Injectable } from '@angular/core';

type Tema = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ModoLeituraService {
  private readonly storageKey = 'modoLeituraTema';
  private readonly bodyClass = 'modo-leitura';

  init(): void {
    const salvo = localStorage.getItem(this.storageKey) as Tema | null;
    const tema: Tema = salvo ?? 'light';
    this.setTema(tema);
  }

  setTema(tema: Tema): void {
    const isDark = tema === 'dark';
    document.body.classList.toggle(this.bodyClass, isDark);
    localStorage.setItem(this.storageKey, tema);
  }

  toggle(): void {
    this.setTema(this.isDark() ? 'light' : 'dark');
  }

  isDark(): boolean {
    return document.body.classList.contains(this.bodyClass);
  }
}
