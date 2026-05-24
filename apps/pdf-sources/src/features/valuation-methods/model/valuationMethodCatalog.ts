export type ValuationMethodId =
  | 'fcd'
  | 'graham'
  | 'graham-number'
  | 'epv'
  | 'ddm'
  | 'ev-ebitda'
  | 'pl-justo'
  | 'lynch-peg'
  | 'sotp'

export interface ValuationMethodMeta {
  id: ValuationMethodId
  label: string
  summary: string
  objective: string
  whenToUse: string
  interpretation: string
  tags: string[]
}

export interface ValuationMethodCategory {
  id: string
  label: string
  methodIds: ValuationMethodId[]
}

export const VALUATION_METHODS_BY_ID: Record<ValuationMethodId, ValuationMethodMeta> = {
  fcd: {
    id: 'fcd',
    label: 'Fluxo de caixa descontado (DCF)',
    summary:
      'Calcula o valor intrínseco trazendo para o valor presente os fluxos de caixa futuros, descontados pelo WACC.',
    objective: 'Estimar quanto a empresa vale hoje com base na geração futura de caixa.',
    whenToUse: 'Empresas maduras, crescimento previsível e análise fundamentalista completa.',
    interpretation: 'Preço atual abaixo do valor DCF → potencialmente descontada.',
    tags: ['Completo', 'Mais usado', 'Valor intrínseco'],
  },
  graham: {
    id: 'graham',
    label: 'Graham — LPA + crescimento',
    summary:
      'Fórmula básica de Benjamin Graham (Investing.com): V = LPA × (8,5 + 2 × g). Usa lucro por ação e crescimento — não usa VPA.',
    objective: 'Estimar valor intrínseco com base no LPA e na taxa de crescimento esperada dos lucros.',
    whenToUse: 'Value investing, triagem rápida e comparação com o preço de mercado.',
    interpretation:
      'Alinhado ao artigo da Investing.com Academy. Diferente do Graham Number (√22,5 × LPA × VPA) usado em calculadoras BR.',
    tags: ['LPA + crescimento', 'Investing.com'],
  },
  'graham-number': {
    id: 'graham-number',
    label: 'Graham Number — preço justo',
    summary:
      'Graham Number usado em calculadoras BR: preço justo = √(22,5 × LPA × VPA). Combina lucro e patrimônio por ação.',
    objective: 'Estimar preço justo por ação sem projeção de crescimento.',
    whenToUse: 'Ações defensivas, comparação com calculadoras de preço justo e triagem rápida.',
    interpretation: 'Preço abaixo do Graham Number → potencialmente descontada. Diferente da fórmula LPA + crescimento.',
    tags: ['LPA + VPA', 'Calculadoras BR'],
  },
  epv: {
    id: 'epv',
    label: 'Valor do poder de ganhos (EPV)',
    summary:
      'Estima quanto a empresa valeria se nunca mais crescesse, usando apenas a capacidade atual de lucro.',
    objective: 'Medir o valor operacional atual sem depender de crescimento futuro.',
    whenToUse: 'Empresas maduras, estratégias conservadoras e value investing.',
    interpretation: 'Indica um valor mínimo baseado na operação atual.',
    tags: ['Conservador', 'Value investing'],
  },
  ddm: {
    id: 'ddm',
    label: 'Modelo de desconto de dividendos (DDM)',
    summary: 'Calcula o valor da ação descontando os dividendos futuros esperados.',
    objective: 'Avaliar empresas que distribuem dividendos recorrentes.',
    whenToUse: 'Bancos, elétricas, REITs/FIIs e empresas pagadoras de dividendos.',
    interpretation: 'Preço abaixo do DDM → dividend yield potencialmente atrativo.',
    tags: ['Dividendos', 'Renda passiva'],
  },
  'ev-ebitda': {
    id: 'ev-ebitda',
    label: 'EV/EBITDA',
    summary: 'Compara o valor da empresa (EV) com a geração operacional de caixa (EBITDA).',
    objective: 'Comparar valuation entre empresas do mesmo setor.',
    whenToUse: 'Comparação setorial, screening e análise relativa.',
    interpretation: 'EV/EBITDA menor que concorrentes pode indicar desconto.',
    tags: ['Mercado', 'Comparativo'],
  },
  'pl-justo': {
    id: 'pl-justo',
    label: 'Preço/lucro justo (P/L)',
    summary: 'Compara o múltiplo P/L da empresa com a média do setor.',
    objective: 'Verificar se a ação negocia acima ou abaixo dos pares.',
    whenToUse: 'Bancos, empresas maduras e comparação rápida.',
    interpretation: 'P/L abaixo do setor pode indicar desconto relativo.',
    tags: ['Múltiplos', 'Mercado'],
  },
  'lynch-peg': {
    id: 'lynch-peg',
    label: 'PEG de Peter Lynch',
    summary: 'Relaciona o múltiplo P/L com a taxa de crescimento esperada da empresa.',
    objective: 'Avaliar se o crescimento justifica o preço atual.',
    whenToUse: 'Empresas de crescimento, tecnologia e growth investing.',
    interpretation: 'PEG < 1 → barata · PEG = 1 → justa · PEG > 1 → cara.',
    tags: ['Crescimento', 'Peter Lynch'],
  },
  sotp: {
    id: 'sotp',
    label: 'Soma das partes (SOTP)',
    summary: 'Avalia cada unidade de negócio separadamente e soma os valores.',
    objective: 'Calcular o valor real de holdings e conglomerados.',
    whenToUse: 'Holdings, empresas diversificadas e grupos empresariais.',
    interpretation: 'Valor final = soma dos segmentos avaliados individualmente.',
    tags: ['Holdings', 'Estrutural'],
  },
}

export const VALUATION_METHOD_CATEGORIES: ValuationMethodCategory[] = [
  {
    id: 'intrinsic',
    label: 'Valor intrínseco',
    methodIds: ['fcd', 'graham', 'graham-number', 'epv'],
  },
  {
    id: 'dividends',
    label: 'Dividendos',
    methodIds: ['ddm'],
  },
  {
    id: 'market',
    label: 'Comparação com mercado',
    methodIds: ['ev-ebitda', 'pl-justo', 'lynch-peg'],
  },
  {
    id: 'structure',
    label: 'Estrutura corporativa',
    methodIds: ['sotp'],
  },
]

export const DEFAULT_VALUATION_METHOD: ValuationMethodId = 'fcd'

export function valuationMethodLabel(id: ValuationMethodId): string {
  return VALUATION_METHODS_BY_ID[id]?.label ?? id
}

export function valuationMethodMeta(id: ValuationMethodId): ValuationMethodMeta {
  return VALUATION_METHODS_BY_ID[id]
}
