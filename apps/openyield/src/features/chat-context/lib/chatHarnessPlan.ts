export type ChatIntent = 'lookup' | 'compare' | 'report' | 'advisory' | 'general'

export interface ChatPlan {
  intent: ChatIntent
  fields: string[]
  keywords: string[]
  depth: 'fast' | 'deep'
}

const FIELD_LOOKUP_HINTS: Record<string, string[]> = {
  marg_ebit: ['margem ebit', 'marg ebit', 'margim ebit', 'margem evit', 'margim evit', 'ebit margin', 'margem de ebit'],
  marg_bruta: ['margem bruta', 'marg bruta', 'margim bruta'],
  marg_liquida: ['margem liquida', 'marg liquida', 'margim liquida'],
  roe: ['roe', 'return on equity'],
  roic: ['roic'],
  receita_liquida_12m: ['receita liquida', 'receita líquida'],
  ebit_12m: ['ebit ', ' ebit', 'ebitda', 'evit '],
  lucro_liquido_12m: ['lucro liquido', 'lucro líquido'],
  fair_price: ['preco justo', 'preço justo', 'fair price', 'valuation', 'fcd', 'graham', 'intrinseco', 'intrínseco', 'dcf'],
  inadimplencia: ['inadimplencia', 'inadimplência', 'nao pagantes', 'não pagantes', 'pecld'],
}

export function normalizeQuestionText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function isAdvisoryQuestion(question: string): boolean {
  const q = normalizeQuestionText(question)
  return (
    /devo investir|vale a pena|devo comprar|devo vender|comprar ou vender|investir n|investir em|invisto|colocar dinheiro|entrar na acao|entrar nessa|sair da acao|o que acha|sua opiniao|minha carteira|decisao de invest|recomenda compr|recomenda vender|bom momento|mau momento|compensa invest|faz sentido invest|essa acao|nesta acao|nessa acao|should i invest|worth buying|buy or sell/i.test(
      q,
    ) ||
    (/\b(investir|investimento|comprar|vender)\b/i.test(q) && q.split(/\s+/).length <= 14)
  )
}

export function isExplicitFieldLookup(question: string, fields: string[]): boolean {
  if (isAdvisoryQuestion(question)) return false
  const q = normalizeQuestionText(question)
  if (q.split(/\s+/).filter(Boolean).length <= 3 && !/\?/.test(question)) return false

  for (const field of fields) {
    const hints = FIELD_LOOKUP_HINTS[field] ?? [field.replace(/_/g, ' ')]
    if (hints.some((hint) => q.includes(normalizeQuestionText(hint)))) return true
  }
  return false
}

export function shouldUseStructuredFastPath(question: string, plan: ChatPlan): boolean {
  if (plan.intent === 'advisory' || plan.intent === 'general' || plan.intent === 'compare' || plan.intent === 'report') {
    return false
  }
  if (plan.intent !== 'lookup' || !plan.fields.length) return false
  return isExplicitFieldLookup(question, plan.fields)
}

export function shouldUseValuationFastPath(question: string, plan: ChatPlan): boolean {
  if (plan.intent === 'advisory') return false
  if (plan.intent !== 'compare' && !plan.fields.includes('fair_price')) return false
  return isExplicitFieldLookup(question, ['fair_price']) || (plan.intent === 'compare' && /\bcompar|versus| vs\.? /i.test(question))
}

export function refineChatPlan(question: string, plan: ChatPlan): ChatPlan {
  if (isAdvisoryQuestion(question)) {
    return {
      intent: 'advisory',
      fields: [],
      keywords: advisorySearchKeywords(question),
      depth: 'deep',
    }
  }
  if (plan.intent === 'lookup' && !isExplicitFieldLookup(question, plan.fields)) {
    return {
      ...plan,
      intent: 'general',
      depth: 'deep',
    }
  }
  if (plan.intent === 'compare' || plan.intent === 'report') {
    return { ...plan, depth: 'deep' }
  }
  return plan
}

export function advisorySearchKeywords(question: string): string[] {
  const base = question
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2)
  return [
    ...base,
    'riscos',
    'dividendos',
    'EBITDA',
    'margem',
    'receita',
    'lucro',
    'dívida',
    'alavancagem',
    'valuation',
    'preço justo',
    'capex',
    'guidance',
    'inadimplência',
    'perdas de água',
    'tarifa',
    'payout',
  ].slice(0, 16)
}

export function deterministicChatPlan(question: string): ChatPlan {
  const q = normalizeQuestionText(question)
  if (isAdvisoryQuestion(question)) {
    return { intent: 'advisory', fields: [], keywords: advisorySearchKeywords(question), depth: 'deep' }
  }

  const fields: string[] = []
  const keywords = new Set<string>()
  const add = (field: string, words: string[]) => {
    fields.push(field)
    words.forEach((word) => keywords.add(word))
  }

  if (/(marg(?:em|in)?\s+e(?:b|v)it|ebit\s+margin)/i.test(q)) {
    add('marg_ebit', ['margem ebit', 'marg ebit', 'ebit'])
  }
  if (/marg(?:em|in)?\s+bruta/i.test(q)) add('marg_bruta', ['margem bruta', 'lucro bruto'])
  if (/marg(?:em|in)?\s+liquida/i.test(q)) add('marg_liquida', ['margem liquida', 'lucro liquido'])
  if (/\broe\b/i.test(q)) add('roe', ['roe'])
  if (/\broic\b/i.test(q)) add('roic', ['roic'])
  if (/receita/i.test(q)) add('receita_liquida_12m', ['receita liquida'])
  if (/(?:^|\s)ebit(?:da)?(?:\s|$)|\bebit\b/i.test(q)) add('ebit_12m', ['ebit', 'ebitda'])
  if (/lucro/i.test(q)) add('lucro_liquido_12m', ['lucro liquido'])
  if (/preco justo|preço justo|fair price|valuation|fcd|graham|intrinseco|intrínseco|dcf|graham number|upside/i.test(q)) {
    add('fair_price', ['preco justo', 'fair price', 'fcd', 'graham'])
  }
  if (/inadimpl|nao pagant|não pagant|pecld|contas a receber/i.test(q)) {
    add('inadimplencia', ['inadimplencia', 'pecld'])
  }

  if (!keywords.size) {
    question
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 8)
      .forEach((word) => keywords.add(word))
  }

  const compare = /\bcompar|versus| vs\.? |\be\b.*\b(q|t)[1-4]|\b(q|t)[1-4].*\b(q|t)[1-4]/i.test(q)
  const report = /\brelatorio|relatório|crie|gere\b/i.test(q)
  const intent: ChatIntent = report ? 'report' : compare ? 'compare' : fields.length && isExplicitFieldLookup(question, fields) ? 'lookup' : 'general'

  return {
    intent,
    fields: [...new Set(fields)],
    keywords: [...keywords].slice(0, 12),
    depth: compare || report || intent === 'general' ? 'deep' : 'fast',
  }
}

export function buildHarnessPlannerPrompt(question: string): string {
  return [
    'Você é o planejador de um harness financeiro chamado OpenYield (estilo analista RI + valuation).',
    'Ferramentas: snapshots fundamentalistas, valuations (FCD/Graham), PDFs, índice vetorial, síntese LLM.',
    'Retorne somente JSON: {"intent":"lookup|compare|report|advisory|general","fields":["marg_ebit"],"keywords":["..."],"depth":"fast|deep"}.',
    'Regras:',
    '- advisory: decisão de investimento, "devo investir", "vale a pena", opinião, tese bull/bear, riscos — SEMPRE depth=deep, fields=[].',
    '- lookup: SOMENTE quando pede UM indicador específico ("qual o ROE?", "margem EBIT").',
    '- compare: compara empresas, tickers ou períodos.',
    '- report: pede relatório completo.',
    '- general: perguntas abertas que precisam síntese, mas não são conselho de investimento.',
    '- NUNCA classifique "devo investir" ou "o que acha dessa ação" como lookup.',
    `Pergunta: ${question}`,
  ].join('\n')
}

export function buildHarnessAnswerInstructions(plan: ChatPlan, activeLabel: string): string[] {
  const common = [
    'Você é o analista do harness OpenYield — responda em português, como um analista de RI experiente.',
    'Use APENAS dados do contexto (snapshot, valuations, PDFs). Não invente números.',
    'Cite fontes quando possível (PDF, campo do snapshot, modelo FCD/Graham).',
    'Se faltar dado material, diga explicitamente o que falta e como obter (ex.: calcular FCD, adicionar release).',
    `Empresa/caderno em foco: ${activeLabel}.`,
  ]

  if (plan.intent === 'advisory') {
    return [
      ...common,
      'O usuário pede orientação sobre investimento. NÃO dê recomendação personalizada de compra/venda.',
      'Estruture a resposta assim (use markdown):',
      '## Resumo',
      '## Pontos positivos (bull)',
      '## Riscos e pontos de atenção (bear)',
      '## Fundamentos (margens, crescimento, dívida, caixa/dividendos)',
      '## Valuation (preço vs valor — use FCD/Graham se disponível; senão diga que falta)',
      '## Comparáveis (outros tickers do workspace, se relevante)',
      '## O que falta no caderno',
      '## Conclusão',
      'Termine com: "Isto é análise informativa, não recomendação de investimento."',
    ]
  }

  if (plan.intent === 'compare') {
    return [
      ...common,
      'Compare empresas/tickers com tabela ou bullets: valuation, margens, alavancagem, dividendos, riscos.',
      'Use valuations de todos os cadernos disponíveis no contexto.',
    ]
  }

  if (plan.intent === 'report') {
    return [
      ...common,
      'Gere relatório estruturado: tese, fundamentos, valuation from PDFs, valuation, riscos, catalisadores, conclusão.',
    ]
  }

  return [
    ...common,
    'Responda de forma completa e sintética. Se a pergunta for ampla, cubra fundamentos, riscos e valuation quando couber.',
  ]
}
