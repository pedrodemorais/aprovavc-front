export interface Topico {
   id: number; 
  descricao: string;
  ativo?: boolean;
  materiaId?: number;
  topicoPaiId?: number | null;
  dataCriacao?: string;
  dataAtualizacao?: string;
  subtopicos: Topico[];   // 👈 IMPORTANTE
}
