export interface EstudoTopicoRequestDTO {
  materiaId: number;
  topicoId: number;
  modoTemporizador: 'livre' | 'pomodoro';
  tempoLivreSegundos: number;
  anotacoes: string;
  pomodoroFase?: 'foco' | 'pausa-curta' | 'pausa-longa';
  pomodoroCiclosConcluidos?: number;
}