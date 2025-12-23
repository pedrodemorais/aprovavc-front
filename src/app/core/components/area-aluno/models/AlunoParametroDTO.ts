export interface AlunoParametroDTO {
  id?: number;
  alunoId?: number;
  chave: string;
  valor: string;
}

export interface MunicipioDTO {
  id?: number;
  municipioIbge: string;
  uf: string;
}

export interface EnderecoDTO {
  id?: number;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cep: string;
  municipio: MunicipioDTO;
}

export interface AlunoDTO {
  id?: number;
  nomeAluno: string;
  email: string;
  telefone: string;
  exigeDocNoCadastro?: boolean;
  dataCriacao?: string;
  dataAtualizacao?: string;
  endereco: EnderecoDTO;
  parametros?: AlunoParametroDTO[];
  

}

export interface UsuarioConsultaDTO {
  assinaturaValida: null;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;

  assinaturaAtiva?: boolean;
  statusAssinatura?: string;
  planoAtual?: string;
  dataExpiracaoLicenca?: string;

  aluno?: AlunoDTO;
}
/** DTO usado no PUT /api/usuarios/atualizar */
export interface UsuarioUpdateDTO {
  nome: string;
  email: string;
  aluno: AlunoDTO;
}