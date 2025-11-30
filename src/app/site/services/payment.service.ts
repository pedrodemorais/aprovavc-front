import { Injectable } from '@angular/core';
import { HttpClient ,HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = 'http://localhost:8080/api/payments/create-preference'; // URL da API Spring Boot

  constructor(private http: HttpClient) {}
  createPreference(paymentData: any): Observable<string> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    return this.http.post<string>(this.apiUrl, paymentData, { headers });
  }
  
  
}


// import { Injectable } from '@angular/core';
// import { HttpClient, HttpHeaders } from '@angular/common/http';
// import { Observable } from 'rxjs';

// @Injectable({
//   providedIn: 'root'
// })
// export class PaymentService {
//   private apiUrl = 'http://localhost:8080/api/payments/process_payment';

//   constructor(private http: HttpClient) {}

//   processPayment(paymentData: any) {
//     return this.http.post(this.apiUrl, paymentData);
//   }
// }

