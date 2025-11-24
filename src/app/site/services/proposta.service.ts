import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {  PropostaRequestDTO,  PropostaResponseDTO,  PropostaItemDTO,  OrigemLead} from '../../core/models/proposta.model'


@Injectable({ providedIn: 'root' })
export class PropostaService {

  private apiUrl = `${environment.apiUrl}/propostas`;

  constructor(private http: HttpClient) {}

  /** Cabeçalhos padrões (se já tiver interceptor de Auth, pode remover isso) */
  private headers(): HttpHeaders {
    const token = localStorage.getItem('token'); // ajuste se usar outro storage
    let h = new HttpHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' });
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  /** Cria proposta */
  criar(dto: PropostaRequestDTO): Observable<PropostaResponseDTO> {
    return this.http.post<PropostaResponseDTO>(`${this.apiUrl}`, dto, { headers: this.headers() });
  }

  /** Atualiza proposta */
  atualizar(id: number, dto: PropostaRequestDTO): Observable<PropostaResponseDTO> {
    return this.http.put<PropostaResponseDTO>(`${this.apiUrl}/${id}`, dto, { headers: this.headers() });
  }

  /** Busca por id */
  buscarPorId(id: number): Observable<PropostaResponseDTO> {
    return this.http.get<PropostaResponseDTO>(`${this.apiUrl}/${id}`, { headers: this.headers() });
  }

  /** Exclui proposta */
  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`, { headers: this.headers() });
  }

  // =========================
  // Helpers de integração
  // =========================

  /**
   * Converte os valores do FormGroup para o DTO esperado no backend.
   * Faz parse numérico e garante strings/nullable como o back aceita.
   */
  toRequestDTO(formValue: any): PropostaRequestDTO {
    // data: se vier string tipo '2025-08-13' está ok.
    // Se vier Date, converter:
    const data = this.ensureDateString(formValue?.data);

    const itens: PropostaItemDTO[] = (formValue?.itens || []).map((raw: any) => ({
      descricao: String(raw?.descricao ?? '').trim(),
      quantidade: this.toNumber(raw?.quantidade, 0),
      unidade: this.optionalString(raw?.unidade),
      precoVista: this.toNumber(raw?.precoVista, 0),
      precoPrazo: this.toNumber(raw?.precoPrazo, 0),
      desconto: this.toNumber(raw?.desconto, 0)
    }));

    const dto: PropostaRequestDTO = {
      data,
      cliente: String(formValue?.cliente ?? '').trim(),
      telefone: this.optionalString(formValue?.telefone),
      email: this.optionalString(formValue?.email),
      origemLead: this.mapOrigemLead(formValue?.origemLead),
      descricao: this.optionalString(formValue?.descricao),
      observacoes: this.optionalString(formValue?.observacoes),
      itens
    };

    return dto;
  }

  // ----- utilitários internos -----
  private toNumber(value: any, fallback = 0): number {
    // aceita "1.234,56" ou "1234.56" e também número direto
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const norm = value.replace(/\./g, '').replace(',', '.'); // BR -> US
      const n = Number(norm);
      return Number.isFinite(n) ? n : fallback;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private optionalString(v: any): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  }

  private ensureDateString(v: any): string {
    if (!v) return new Date().toISOString().slice(0, 10); // hoje como fallback
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // yyyy-MM-dd
    try {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    } catch {}
    return String(v); // deixa passar do jeito que veio (backend valida)
  }

  private mapOrigemLead(v: any): OrigemLead | null {
    if (!v) return null;
    const s = String(v).toUpperCase();
    // aceita valores do select da sua tela e converte para enum do back
    if (s === 'INDICAÇÃO' || s === 'INDICACAO') return 'INDICACAO';
    if (s === 'INSTAGRAM') return 'INSTAGRAM';
    if (s === 'GOOGLE') return 'GOOGLE';
    if (s === 'OUTRO') return 'OUTRO';
    return null;
  }




  // proposta.service.ts
getProximoNumero() {
   console.log('-------------------------------------------------------')
  return this.http.get<{ numero: number }>(`${this.apiUrl}/proximo-numero`);
}




  }

