import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders   } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { map } from 'rxjs/operators';

export interface EmpresaParametro {
  id: number;
  empresaId: number;
  chave: string;
  valor: string;
}
export interface EmpresaParametroDTO {
  chave: string;
  valor: string;
}

@Injectable({
  providedIn: 'root',
})

export class EmpresaParametroService {
   private apiUrl = `${environment.apiUrl}/alunos/parametros`;
  
    constructor(private http: HttpClient) { }
    getParametros(): Observable<EmpresaParametro[]> {
      return this.http.get<EmpresaParametro[]>(this.apiUrl);
    }

     /** 🔥 Retorna o valor de um parâmetro específico pela chave */
  getParametroPorChave(chave: string): Observable<string | null> {
    return this.http.get<EmpresaParametro[]>(this.apiUrl).pipe(
      map(parametros => {
        const param = parametros.find(p => p.chave === chave);
        return param ? param.valor : null;
      })
    );
  }

   /** 🔥 Atualiza um parâmetro no backend */
/** 🔥 Atualiza um parâmetro no backend enviando o token automaticamente via cookie */
atualizarParametro(parametro: EmpresaParametroDTO): Observable<any> {
  return this.http.put(this.apiUrl+'/atualizar', parametro, { 
    withCredentials: true, // 🔥 Garante que os cookies sejam enviados automaticamente
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  });
}

 
}
