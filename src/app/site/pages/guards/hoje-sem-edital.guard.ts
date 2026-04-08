import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { EditalService } from 'src/app/core/components/area-aluno/services/edital.service';

@Injectable({
  providedIn: 'root'
})
export class HojeSemEditalGuard implements CanActivate {
  constructor(
    private editalService: EditalService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.editalService.listar().pipe(
      map((editais) => {
        const total = Array.isArray(editais) ? editais.length : 0;
        if (total === 0) {
          return this.router.createUrlTree(['/area-restrita/registrar-livre']);
        }
        return true;
      }),
      catchError((err) => {
        console.error('❌ Erro ao validar editais para rota hoje:', err);
        return of(true);
      })
    );
  }
}

