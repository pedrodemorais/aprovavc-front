import { Inject, Injectable } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

type Tema = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ModoLeituraService {
  private readonly storageKey = 'modoLeituraTema';
  private readonly classDark = 'theme-dark';

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  init(): void {
    if (!this.isBrowser()) return;
    const salvo = (localStorage.getItem(this.storageKey) as Tema | null);
    const tema: Tema = salvo ?? 'light';
    this.aplicarTema(tema);
  }

  setTema(tema: Tema): void {
    if (!this.isBrowser()) return;
    this.aplicarTema(tema);
    localStorage.setItem(this.storageKey, tema);
  }

  toggle(): void {
    if (!this.isBrowser()) return;
    this.setTema(this.isDark() ? 'light' : 'dark');
  }

  isDark(): boolean {
    if (!this.isBrowser()) return false;
    return document.body.classList.contains(this.classDark);
  }

  private aplicarTema(tema: Tema): void {
    if (!this.isBrowser()) return;
    const isDark = tema === 'dark';

    // body (o que seu CSS usa)
    document.body.classList.toggle(this.classDark, isDark);

    // html (ajuda com alguns componentes/scrollbars e variações de CSS)
    document.documentElement.classList.toggle(this.classDark, isDark);

    // melhora inputs nativos/scrollbars em dark
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
