export type StatusRevisaoCanonico = 'SEM' | 'FUTURA' | 'HOJE' | 'ATRASADA';
export type StatusRevisaoDashboard = 'VENCIDA' | 'EM_DIA' | 'FUTURA';

export function normalizarStatusCanonico(raw: any): StatusRevisaoCanonico | null {
  const valor = String(raw || '').trim().toUpperCase();
  if (!valor) return null;

  if (valor === 'SEM') return 'SEM';
  if (valor === 'FUTURA') return 'FUTURA';
  if (valor === 'HOJE') return 'HOJE';
  if (valor === 'ATRASADA') return 'ATRASADA';

  // aliases legados
  if (valor === 'EM_DIA') return 'HOJE';
  if (valor === 'VENCIDA') return 'ATRASADA';

  return null;
}

export function statusCanonicoParaDashboard(
  status: StatusRevisaoCanonico
): StatusRevisaoDashboard | null {
  if (status === 'ATRASADA') return 'VENCIDA';
  if (status === 'HOJE') return 'EM_DIA';
  if (status === 'FUTURA') return 'FUTURA';
  return null;
}

export function construirDataLocal(isoDate: string): Date {
  const valor = String(isoDate || '').trim();
  if (!valor) return new Date(NaN);

  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(NaN);

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(ano, mes - 1, dia);
  data.setHours(0, 0, 0, 0);
  return data;
}

export function inferirStatusCanonicoPorData(
  proximaRevisao: string,
  hojeRef?: Date
): StatusRevisaoCanonico {
  const hoje = hojeRef ? new Date(hojeRef) : new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataRev = construirDataLocal(proximaRevisao);
  const revTime = dataRev.getTime();
  const hojeTime = hoje.getTime();

  if (Number.isNaN(revTime)) return 'SEM';
  if (revTime < hojeTime) return 'ATRASADA';
  if (revTime === hojeTime) return 'HOJE';
  return 'FUTURA';
}

export function extrairStatusCanonicoRevisao(item: any, hojeRef?: Date): StatusRevisaoCanonico {
  const fromCanonico = normalizarStatusCanonico(item?.statusCanonico);
  if (fromCanonico) return fromCanonico;

  const fromStatusRevisao = normalizarStatusCanonico(item?.statusRevisao);
  if (fromStatusRevisao) return fromStatusRevisao;

  const fromStatus = normalizarStatusCanonico(item?.status);
  if (fromStatus) return fromStatus;

  const proxima = String(item?.proximaRevisao || item?.dataProximaRevisao || '').trim();
  if (proxima) return inferirStatusCanonicoPorData(proxima, hojeRef);

  return 'SEM';
}
