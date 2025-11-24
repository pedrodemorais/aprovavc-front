import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Cliente } from 'src/app/core/models/cliente.model';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ClienteService {


   private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  cadastrarCliente(cliente: any): Observable<any> {
    console.log(`${this.apiUrl}/clientes`);
    return this.http.post<any>(`${this.apiUrl}/clientes`, cliente);
  }
  


  atualizarCliente(cliente: any): Observable<any> {
    
    return this.http.put<any>(`${this.apiUrl}/clientes/${cliente.id}`, cliente);
  }

salvar(cliente: Cliente): Observable<Cliente> {
  return this.http.post<Cliente>(`${this.apiUrl}/clientes`, cliente);
}

atualizar(id: number, cliente: Cliente): Observable<Cliente> {
  return this.http.put<Cliente>(`${this.apiUrl}/clientes/${id}`, cliente);
}


  buscarClientePorId(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

buscarTodos(): Observable<Cliente[]> {
  return this.http.get<Cliente[]>(`${this.apiUrl}/clientes/buscar`);
}

buscarComFiltros(params: HttpParams): Observable<Cliente[]> {
  return this.http.get<Cliente[]>(`${this.apiUrl}/clientes/buscar`, { params });
}


 

  deletarCliente(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/clientes/${id}`);
  }


}

