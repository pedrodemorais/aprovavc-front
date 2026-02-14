import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { UsuarioConsultaDTO } from 'src/app/core/components/area-aluno/models/AlunoParametroDTO';
import { AuthService } from 'src/app/site/services/auth.service';


@Injectable({
  providedIn: 'root'
})
export class UsuarioService {
  

  constructor(private http: HttpClient, private authService: AuthService) {}

  // 🔹 Buscar usuário por ID
  getUsuario(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/usuarios/buscar-usuario`);
  }


  atualizarUsuario( usuario: any) {
    console.log('-----------------------------',usuario);
    return this.http.put(`${environment.apiUrl}/usuarios/atualizar`, usuario);
  }

  getUsuarioLogado(): Observable<UsuarioConsultaDTO> {
  return this.authService.getUserData() as Observable<UsuarioConsultaDTO>;
}

cadastrarUsuario(usuarioData: any): Observable<{ message: string }> {
  return this.http.post<{ message: string }>(
    `${environment.apiUrl}/usuarios/cadastro`,
    usuarioData
  );
}


}
