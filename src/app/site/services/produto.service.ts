import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ProdutoDTO } from 'src/app/core/components/dto/produto-dto';
import { ProdutoFiltroDTO } from 'src/app/models/produto-filtro-dto';

@Injectable({
  providedIn: 'root'
})
export class ProdutoService {
  private apiUrl = `${environment.apiUrl}/produtos`;

  constructor(private http: HttpClient) {}

  cadastrarProduto(produto: ProdutoDTO): Observable<ProdutoDTO> {
    return this.http.post<ProdutoDTO>(this.apiUrl, produto);
  }

  atualizarProduto(produto: ProdutoDTO): Observable<ProdutoDTO> {
    return this.http.put<ProdutoDTO>(`${this.apiUrl}/${produto.id}`, produto);
  }

  buscarProdutoPorId(id: number): Observable<ProdutoDTO> {
    return this.http.get<ProdutoDTO>(`${this.apiUrl}/${id}`);
  }

  deletarProduto(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  buscarProdutosPorFiltro(filtro: ProdutoFiltroDTO): Observable<ProdutoDTO[]> {
    return this.http.post<ProdutoDTO[]>(`${this.apiUrl}/filtro`, filtro);
  }
  // No seu ProdutoService:
buscarProdutosInsumo(): Observable<ProdutoDTO[]> {
  const filtro = { insumo: true }; // ou os campos obrigatórios do seu DTO
  return this.http.post<ProdutoDTO[]>(`${this.apiUrl}/filtro`, filtro);
}

}
