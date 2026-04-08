import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AlunoParametroDTO } from 'src/app/core/dto/aluno-parametro.dto';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AlunoParametroService {
  private readonly baseUrl = `${environment.apiUrl}/alunos/parametros`;

  constructor(private http: HttpClient) {}

  listarParametros(): Observable<AlunoParametroDTO[]> {
    return this.http.get<AlunoParametroDTO[]>(this.baseUrl);
  }

  atualizarParametro(chave: string, valor: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/atualizar`, { chave, valor });
  }
}

