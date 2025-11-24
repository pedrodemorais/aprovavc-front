import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MarcaService {

  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  cadastrarMarca(marca: any): Observable<any> {
    console.log(`${this.apiUrl}/marcas`);
    console.log(`marcassssssssssssssssssssssssssss`);

    return this.http.post<any>(`${this.apiUrl}/marcas`, marca);
  }
  


  atualizarMarca( categoria: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/marcas/${categoria.id}`, categoria);
  }



  buscarMMarcaPorId(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }


  buscarMarca( nome?: string): Observable<any[]> {
     console.log(`marca.service.ts: buscarMarca chamada com nome=${nome}`);
    let params = new HttpParams();
    
   
    if (nome) {
      params = params.set('nomeMarca', nome);
    }
   
 
  

    return this.http.get<any[]>(`${this.apiUrl}/marcas/buscar`, { params });
  }

  buscarTodasMarcas() {
    const url = `${this.apiUrl}/marcas`;
    console.log("🔍 Chamando GET:", url);
    return this.http.get<any[]>(url);
  }
  

  deletarMarca(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/marcas/${id}`);
  }


}


