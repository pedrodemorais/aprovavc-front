export interface RevisaoMateria {
  id: number;
  alunoId: number;
  materiaId: number;
  estudoId?: number | null;
  dataRevisao: string; // LocalDate
  etapa: number;       // 1..5
  concluida: boolean;
}
