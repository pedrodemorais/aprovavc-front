export interface UnidadeDto {
  id?: number;
  sigla: string;
  descricao: string;
  fatorConversao: number;
  empresaId?: number;
  permiteFracionar: boolean;
  casasDecimais: number;
  tipo: 'QUANTIDADE' | 'PESO' | 'VOLUME' | 'COMPRIMENTO' | 'AREA' | 'EMBALAGEM' | 'OUTROS';
}
