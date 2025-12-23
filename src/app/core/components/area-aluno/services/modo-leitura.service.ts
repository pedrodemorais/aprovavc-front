import { Injectable } from '@angular/core';

type Tema = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ModoLeituraService {
  private readonly storageKey = 'modoLeituraTema';
  private readonly classDark = 'theme-dark';

  init(): void {
    const salvo = (localStorage.getItem(this.storageKey) as Tema | null);
    const tema: Tema = salvo ?? 'light';
    this.aplicarTema(tema);
  }

  setTema(tema: Tema): void {
    this.aplicarTema(tema);
    localStorage.setItem(this.storageKey, tema);
  }

  toggle(): void {
    this.setTema(this.isDark() ? 'light' : 'dark');
  }

  isDark(): boolean {
    return document.body.classList.contains(this.classDark);
  }

  private aplicarTema(tema: Tema): void {
    const isDark = tema === 'dark';

    // body (o que seu CSS usa)
    document.body.classList.toggle(this.classDark, isDark);

    // html (ajuda com alguns componentes/scrollbars e variações de CSS)
    document.documentElement.classList.toggle(this.classDark, isDark);

    // melhora inputs nativos/scrollbars em dark
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }
}
