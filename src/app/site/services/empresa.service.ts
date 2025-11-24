import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders  } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmpresaService {

  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) { }

  private getToken(): string {
    return localStorage.getItem('token') || ''; // 🔥 Garante que nunca seja null
  }
  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.getToken()}`
    });
  }



  uploadLogo(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/empresas/upload-logo`, formData, {
       
        responseType: 'text' // Retorna um texto confirmando o upload
    });
}

  


  getLogo(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/empresas/logo`, { 
      headers: this.getAuthHeaders(), 
      responseType: 'blob' // 🔥 Recebe a imagem como um Blob
    });
  }
  
  
}
