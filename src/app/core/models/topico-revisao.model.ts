export interface TopicoRevisao {
  id?: number;
  empresaId?: number;

  // relação com Matéria
  materiaId?: number;     // usado para enviar pro backend
  materiaNome?: string;   // vem do backend para exibir na tela

  assunto: string;
provaId?: number;       // usado para enviar pro backend
  provaNome?: string;     // vem do backend para exibir na tela
  dataPrimeiroEstudo?: string;   // formato 'YYYY-MM-DD'
  dataUltimaRevisao?: string;    // idem
  dataProximaRevisao?: string;   // idem

  nivelRevisao?: number;
   topicoEditalId?: number;
  topicoEditalDescricao?: string;
}
