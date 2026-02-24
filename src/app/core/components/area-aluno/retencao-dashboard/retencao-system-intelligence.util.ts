import { EditalResumoRetencaoDTO, RetencaoAnalyticsSerieDTO } from 'src/app/core/models/retencao-analytics.models';

export interface IndiceEstabilidadeResultado {
  valor: number;
  classificacao: 'Saudavel' | 'Estavel' | 'Instavel' | 'Critico';
}

export interface MomentumResultado {
  deltaCriticos: number;
  status: 'Em recuperacao' | 'Deteriorando' | 'Estavel';
}

export interface EstadoSistemaFaixa {
  label: 'Critico' | 'Instavel' | 'Estavel' | 'Saudavel';
  faixaTexto: 'Zona vermelha' | 'Zona de risco' | 'Zona estavel' | 'Zona verde';
}

export interface EstadoSistemaUrgencia {
  nivel: 'ok' | 'warn' | 'danger';
  texto: string;
}

export interface EstadoSistemaProximaAcao {
  texto: string;
  ctaLabel: string;
  ctaAction: 'goCriticos' | 'goRisco' | 'startFirstCritico' | 'none';
}

export const ESTADO_SISTEMA_EXPLICACAO_CURTA =
  'Este indice mede a saude do seu sistema de revisao (quanto menos criticos/em risco, maior o score).';

export function calcularIndiceEstabilidade(
  summaryHoje: EditalResumoRetencaoDTO | null | undefined
): IndiceEstabilidadeResultado {
  const totalTopicos = Number(summaryHoje?.totalTopicos || 0);
  if (!Number.isFinite(totalTopicos) || totalTopicos <= 0) {
    return { valor: 100, classificacao: 'Saudavel' };
  }

  const criticos = Number(summaryHoje?.topicosCriticos || 0);
  const emRisco = Number(summaryHoje?.topicosEmRisco || 0);

  const percentCriticos = (criticos / totalTopicos) * 100;
  const percentEmRisco = (emRisco / totalTopicos) * 100;

  const bruto = 100 - (percentCriticos * 0.7) - (percentEmRisco * 0.3);
  const clamped = Math.max(0, Math.min(100, bruto));
  const valor = Math.round(clamped);

  if (valor >= 75) return { valor, classificacao: 'Saudavel' };
  if (valor >= 50) return { valor, classificacao: 'Estavel' };
  if (valor >= 30) return { valor, classificacao: 'Instavel' };
  return { valor, classificacao: 'Critico' };
}

export function calcularMomentum(
  snapshots: RetencaoAnalyticsSerieDTO[] | null | undefined
): MomentumResultado | null {
  if (!Array.isArray(snapshots) || snapshots.length < 8) {
    return null;
  }

  const snapshotHoje = snapshots[snapshots.length - 1];
  const snapshot7dias = snapshots[snapshots.length - 8];

  const criticosHoje = Number(snapshotHoje?.criticos || 0);
  const criticos7dias = Number(snapshot7dias?.criticos || 0);
  const deltaCriticos = criticosHoje - criticos7dias;

  if (deltaCriticos < 0) return { deltaCriticos, status: 'Em recuperacao' };
  if (deltaCriticos > 0) return { deltaCriticos, status: 'Deteriorando' };
  return { deltaCriticos, status: 'Estavel' };
}

export function mapearFaixaEstabilidade(score: number): EstadoSistemaFaixa {
  const valor = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  if (valor <= 29) return { label: 'Critico', faixaTexto: 'Zona vermelha' };
  if (valor <= 49) return { label: 'Instavel', faixaTexto: 'Zona de risco' };
  if (valor <= 74) return { label: 'Estavel', faixaTexto: 'Zona estavel' };
  return { label: 'Saudavel', faixaTexto: 'Zona verde' };
}

export function montarUrgenciaEstadoSistema(percentCriticos: number): EstadoSistemaUrgencia {
  const pct = Number(percentCriticos || 0);
  if (pct >= 60) {
    return {
      nivel: 'danger',
      texto: 'Muitos topicos estao criticos - alto risco de esquecer conteudo.'
    };
  }
  if (pct >= 30) {
    return {
      nivel: 'warn',
      texto: 'Parte do edital esta critica - atencao para nao acumular atrasos.'
    };
  }
  return {
    nivel: 'ok',
    texto: 'Boa estabilidade - mantenha a consistencia para nao voltar a acumular.'
  };
}

export function montarProximaAcaoEstadoSistema(
  qtdCriticos: number,
  qtdEmRisco: number
): EstadoSistemaProximaAcao {
  const criticos = Math.max(0, Math.floor(Number(qtdCriticos || 0)));
  const emRisco = Math.max(0, Math.floor(Number(qtdEmRisco || 0)));

  if (criticos > 0) {
    const qtd = Math.min(2, criticos);
    return {
      texto: `Revise ${qtd} topico(s) critico(s) hoje para melhorar a estabilidade.`,
      ctaLabel: 'Ver topicos criticos',
      ctaAction: 'goCriticos'
    };
  }

  if (emRisco > 0) {
    const qtd = Math.min(2, emRisco);
    return {
      texto: `Revise ${qtd} topico(s) em risco hoje para evitar virar critico.`,
      ctaLabel: 'Ver topicos em risco',
      ctaAction: 'goRisco'
    };
  }

  return {
    texto: 'Continue revisando para manter o sistema saudavel.',
    ctaLabel: '',
    ctaAction: 'none'
  };
}

export function montarDelta7dLabel(momentum: MomentumResultado | null): string {
  if (!momentum) {
    return 'Tendencia: - (historico insuficiente)';
  }
  if (momentum.deltaCriticos === 0) {
    return 'Estavel na ultima semana';
  }
  const sinal = momentum.deltaCriticos > 0 ? '+' : '';
  return `${momentum.status} (${sinal}${momentum.deltaCriticos} criticos/7d)`;
}
