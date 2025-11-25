// src/app/area-restrita/services/prova.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Prova } from '../models/prova.model';
import { environment } from 'src/environments/environment';
export interface ProvaEstudoDTO {
  id?: number;
  nome: string;              // ajuste o nome do campo conforme seu DTO
  // status, ativo, etc, se existir
}
@Injectable({ providedIn: 'root' })
export class ProvaService {

   private apiUrl = `${environment.apiUrl}/api/provas-estudo`;
  

  constructor(private http: HttpClient) {}

  listar(nome?: string): Observable<ProvaEstudoDTO[]> {
    let params = new HttpParams();
    if (nome) {
      params = params.set('nome', nome);
    }
    return this.http.get<ProvaEstudoDTO[]>(this.apiUrl, { params });
  }
}
