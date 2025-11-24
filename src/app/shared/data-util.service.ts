import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DateUtilService {

  /**
   * Converte uma data de dd/MM/yyyy para yyyy-MM-dd
   */
  formatarDataParaBackend(data: string): string | null {
    if (!data) return null;
    const rawDate = data.replace(/\D/g, '');
    if (rawDate.length === 8) {
      const day = rawDate.substring(0, 2);
      const month = rawDate.substring(2, 4);
      const year = rawDate.substring(4, 8);
      return `${year}-${month}-${day}`;
    }
    console.warn('Data inválida:', data);
    return null;
  }

  /**
   * Converte uma data de yyyy-MM-dd para dd/MM/yyyy
   */
  formatarDataParaTela(data: string): string | null {
    if (!data) return null;
    const parts = data.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    console.warn('Data inválida:', data);
    return null;
  }

  /**
   * Converte um objeto, formatando todos os campos de data encontrados
   * @param objeto - objeto que contém campos de data
   * @param campos - lista dos campos que precisam ser convertidos
   * @param paraBackend - se true, converte para yyyy-MM-dd
   */
  formatarDatasEmObjeto(objeto: any, campos: string[], paraBackend: boolean = true): any {
    const novoObjeto = { ...objeto };
    campos.forEach(campo => {
      if (novoObjeto[campo]) {
        novoObjeto[campo] = paraBackend
          ? this.formatarDataParaBackend(novoObjeto[campo])
          : this.formatarDataParaTela(novoObjeto[campo]);
      }
    });
    return novoObjeto;
  }

  /**
   * Converte um array de objetos formatando os campos de data
   * @param array - array de objetos
   * @param campos - lista de campos de data
   * @param paraBackend - se true, converte para yyyy-MM-dd
   */
  formatarDatasEmArray(array: any[], campos: string[], paraBackend: boolean = true): any[] {
    return array.map(item => this.formatarDatasEmObjeto(item, campos, paraBackend));
  }
}
