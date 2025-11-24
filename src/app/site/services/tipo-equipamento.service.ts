import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface TipoEquipamento {
  id: number;
  nome: string;
  descricao?: string;
  vidaUtilMeses?: number | null;
  periodicidadeManutencaoDias?: number | null;
  ativo: boolean;
}

@Injectable({ providedIn: 'root' })
export class TipoEquipamentoService {
  // MESMA estratégia do MarcaService:
  private readonly baseUrl = `${environment.apiUrl}/tipos-equipamento`;

  constructor(private http: HttpClient) {}

  listarTodos(): Observable<TipoEquipamento[]> {
    return this.http.get<TipoEquipamento[]>(this.baseUrl);
  }

  buscar(nome: string): Observable<TipoEquipamento[]> {
    const termo = (nome ?? '').trim();
    const params = termo ? new HttpParams().set('nome', termo) : undefined;
    // nada de baseUrl + apiUrl aqui:
    return this.http.get<TipoEquipamento[]>(this.baseUrl, { params });
  }

  criar(dto: Partial<TipoEquipamento>): Observable<TipoEquipamento> {
    return this.http.post<TipoEquipamento>(this.baseUrl, dto);
  }

  atualizar(dto: Partial<TipoEquipamento>): Observable<TipoEquipamento> {
    return this.http.put<TipoEquipamento>(`${this.baseUrl}/${dto.id}`, dto);
  }

  deletar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
