export interface EstudoTopicoRequestDTO {
  materiaId: number;
  topicoId: number;
  modoTemporizador: 'livre' | 'pomodoro';
  tipoSessao: 'ESTUDO' | 'REVISAO';
  tempoLivreSegundos: number;
  anotacoes: string;
  pomodoroFase?: 'foco' | 'pausa-curta' | 'pausa-longa';
  pomodoroCiclosConcluidos?: number;
}
