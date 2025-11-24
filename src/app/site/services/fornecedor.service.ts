import { Injectable } from '@angular/core';
import { HttpClient,HttpParams  } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FornecedorService {

   private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  cadastrarFornecedor(fornecedor: any): Observable<any> {
    console.log(`${this.apiUrl}/fornecedores`);
    return this.http.post<any>(`${this.apiUrl}/fornecedores`, fornecedor);
  }
  


  atualizarFornecedor( fornecedor: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/fornecedores/${fornecedor.id}`, fornecedor);
  }



  buscarFornecedorPorId(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  //tipoDePessoa,dataNascimento,nomeFantasia,razaoSocial ,documentoCpfCnpj,documentoRgIe,telefone,municipio,uf,ativo
  buscarFornecedor(
    tipoDePessoa?:string,
    dataNascimento?:string,
    nomeFantasia?: string,
    razaoSocial?:string,
    documentoCpfCnpj?:string, 
    documentoRgIe?:string, 
    telefone?: string, 
    email?: string, 
    whatsApp?: string, 
    municipio?:string, 
    uf?:string,
    ativo?:string
  ): Observable<any[]> {
    let params = new HttpParams();
    
    if (tipoDePessoa) {
      params = params.set('tipoDePessoa', tipoDePessoa);
    }
    if (dataNascimento) {
      params = params.set('dataNascimento', dataNascimento);
    }
    if (razaoSocial) {
      params = params.set('razaoSocial', razaoSocial);
    }
    if (documentoCpfCnpj) {
      params = params.set('documentoCpfCnpj', documentoCpfCnpj);
      console.log('-----------------------------------BATEU AQUI');
    
    }

    if (documentoRgIe) {
      params = params.set('documentoRgIe', documentoRgIe);
    }

    if (nomeFantasia) {
      params = params.set('nomeFantasia', nomeFantasia);
    }
    if (municipio) {
      params = params.set('municipio', municipio);
    }
    if (whatsApp) {
      params = params.set('whatsApp', whatsApp);
      console.log('-----------------------------------BATEU NO ZAPPP');
    }
    if (email) {
      params = params.set('email', email);
      console.log('-----------------------------------BATEU NO ZAPPP');
    }

    if (telefone) {
      params = params.set('telefone', telefone);
      console.log('-----------------------------------BATEU AQUI');
    }
    if (uf) {
      params = params.set('uf', uf);
    }
    if (ativo) {
      params = params.set('ativo', ativo);
    }
  

    return this.http.get<any[]>(`${this.apiUrl}/fornecedores/buscar`, { params });
  }

  deletarFornecedor(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/fornecedores/${id}`);
  }


}
