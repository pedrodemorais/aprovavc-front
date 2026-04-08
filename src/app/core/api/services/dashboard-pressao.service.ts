import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { PressaoDoDiaDTO, PressaoJanelaDias } from '../dto/pressao-do-dia.dto';

@Injectable({ providedIn: 'root' })
export class DashboardPressaoService {
  private readonly baseUrl = `${environment.apiUrl}/dashboard/pressao-do-dia`;

  constructor(private http: HttpClient) {}

  getPressaoDoDia(janelaDias: PressaoJanelaDias = 1): Observable<PressaoDoDiaDTO> {
    const params = new HttpParams().set('janelaDias', String(janelaDias));
    return this.http.get<PressaoDoDiaDTO>(this.baseUrl, { params });
  }
}
