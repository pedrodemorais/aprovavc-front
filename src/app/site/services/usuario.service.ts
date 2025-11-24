import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';


@Injectable({
  providedIn: 'root'
})
export class UsuarioService {
  

  constructor(private http: HttpClient) {}

  // 🔹 Buscar usuário por ID
  getUsuario(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/usuarios/buscar-usuario`);
  }


  atualizarUsuario( usuario: any) {
    console.log('-----------------------------',usuario);
    return this.http.put(`${environment.apiUrl}/usuarios/atualizar`, usuario);
  }

  

  cadastrarUsuario(empresaData: any): Observable<any> {
    
    

    console.log('🔄 Enviando requisição HTTP para criar empresa:', empresaData);
    return this.http.post(environment.apiUrl+'/usuarios/cadastro', empresaData, { responseType: 'text' });
  }
}
