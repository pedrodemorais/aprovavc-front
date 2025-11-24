import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CategoriaService {

   private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  cadastrarCategoria(categoria: any): Observable<any> {
    console.log(`${this.apiUrl}/categorias`);
    return this.http.post<any>(`${this.apiUrl}/categorias`, categoria);
  }
  


  atualizarCategoria( categoria: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/categorias/${categoria.id}`, categoria);
  }



  buscarCategoriaPorId(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }


  buscarCategoria(
  
    nome?: string,
   
  ): Observable<any[]> {
    let params = new HttpParams();
    
   
    if (nome) {
      params = params.set('nomeCategoria', nome);
    }
   
 
  

    return this.http.get<any[]>(`${this.apiUrl}/categorias/buscar`, { params });
  }

  buscarTodasCategorias() {
    const url = `${this.apiUrl}/categorias`;
    console.log("🔍 Chamando GET:", url);
    return this.http.get<any[]>(url);
  }
  

  deletarCategoria(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/categorias/${id}`);
  }


}


