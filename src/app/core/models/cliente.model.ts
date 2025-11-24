// src/app/models/cliente.model.ts
export interface Cliente {
  id?: number;
  nomeFantasia: string;
  razaoSocial: string;
  documentoCpfCnpj: string;
  documentoRgIe?: string;
  email?: string;
  whatsApp?: string;
  telefone?: string;
  site?: string;
  endereco?: any; // você pode tipar melhor depois
  ativo?: boolean;
  observacao?: string;
  tipoDePessoa: 'Física' | 'Jurídica';
  dataNascimento?: Date;
}
