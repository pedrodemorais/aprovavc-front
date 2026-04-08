import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface DashboardResumoRequest {
  lite?: boolean;
  include?: string[];
}

@Injectable({ providedIn: 'root' })
export class DashboardResumoService {
  private readonly apiUrl = `${environment.apiUrl}/dashboard/resumo`;

  constructor(private http: HttpClient) {}

  buscarResumo(req?: DashboardResumoRequest): Observable<any> {
    let params = new HttpParams();

    if (typeof req?.lite === 'boolean') {
      params = params.set('lite', String(req.lite));
    }

    if (req?.include?.length) {
      params = params.set('include', req.include.join(','));
    }

    return this.http.get<any>(this.apiUrl, { params });
  }
}

