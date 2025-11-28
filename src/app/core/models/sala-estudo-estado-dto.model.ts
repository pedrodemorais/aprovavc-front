export interface SalaEstudoEstadoDTO {
  status: 'nao_iniciado' | 'em_estudo' | 'pausado' | 'concluido';
   id?: number;

  provaId: number;
  topicoId: number;

  notas?: string | null;
  tempoMs?: number | null;

 
  modo?: string | null;   // "livre" | "pomodoro" | "flashcards" | "anotacoes"

  ultimaAtualizacao?: string | null; // Instant ISO (ex: "2025-11-28T14:59:10.123Z")

  pomodoro?: {
    etapa?: string | null; // "foco" | "pausa_curta" | "pausa_longa"
    restanteMs?: number | null;
    ciclosFocoConcluidos?: number | null;
  } | null;
}
