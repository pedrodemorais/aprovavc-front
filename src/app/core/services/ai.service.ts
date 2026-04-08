import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

interface AiTesteResponse {
  resposta?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly url = `${environment.apiUrl}/ia/teste`;

  constructor(private http: HttpClient) {}

  testarIA(prompt: string): Observable<string> {
    return this.http.post<AiTesteResponse>(this.url, { prompt }).pipe(
      map((response) => String(response?.resposta || ''))
    );
  }
}
