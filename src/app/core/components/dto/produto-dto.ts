export interface ProdutoDTO {
  id?: number;
  codigo: string;
  codigoProprio?: string;
  custo?: string;
  descricao: string;
  referencia?: string;
  categoriaId: number;
  subcategoria?: number;
  marcaId?: number;
  ativo?: boolean;
  itemDeVenda?: boolean;
  kit?: boolean;
  fabricacaoPropria?: boolean;
  insumo?: boolean;
   insumos?: {
    id?: number;
    nome: string;
    quantidade: number;
    custo: number;
  }[];
  calculaEstoque?: boolean;
  utilizaVariacao?: boolean;
  mostrarNaLojaVirtual?: boolean;
  controlaValidade?: boolean;
  controlaLote?: boolean;
  controlaSerie?: boolean;
  produtoPerecivel?: boolean;
  permiteFracionamento?: boolean;
  precoVendaVarejo?: number;
  precoVendaAtacado?: number;
  precoCompra?: number;
  descontoPermitido?: number;
  unidadeEstoqueId?: number;
  unidadeCompraId?: number;
  unidadeIntermediariaId?: number;
  unidadeBaseId?: number;
  fatorConversaoCompraParaIntermediaria?: number;
  fatorConversaoIntermediariaParaBase?: number;
  altura?: number;
  largura?: number;
  profundidade?: number;
  volume?: number;
  pesoBruto?: number;
  pesoLiquido?: number;
  estoqueAtual?: number;
  estoqueMinimo?: number;
  estoqueMaximo?: number;
  localizacaoEstoque?: string;

  // Campos extras para exibição (não enviados ao backend normalmente)
  grupo?: string;

   
  subCategoria?: string;
  fornecedor?: string;
  unidadeEstoque?: string;
  unidadeCompra?: string;
  unidadeIntermediaria?: string;
  unidadeVenda?: string;
  conversoes?: string;
  usaConversao?: string;
  fatorConversao?: string;
  
  proximaUnidade?: string;
}
