import { describe, expect, it } from 'vitest'
import { estimatePromptTokens, selectEvidenceForSection } from '#features/investment-report/lib/contextBudget'

describe('contextBudget', () => {
  it('prioriza evidências relevantes para a seção e respeita orçamento', () => {
    const evidence = [
      '[Fonte A, pág. 1, trecho]\nReceita líquida cresceu sem detalhes de inadimplência.',
      '[Fonte A, pág. 2, trecho]\nPECLD subiu 32%, inadimplência aumentou e contas a receber pioraram.',
      '[Fonte A, pág. 3, trecho]\nCapex e universalização avançaram no trimestre.',
      '[Fonte A, pág. 4, trecho]\nArrecadação ficou pressionada por faturas vencidas.',
    ].join('\n\n---\n\n')

    const out = selectEvidenceForSection({
      evidence,
      sectionTitle: 'Risco de crédito e arrecadação',
      instruction: 'Analise inadimplência, PECLD, contas a receber e recebimento de faturas.',
      maxChars: 190,
      maxBlockChars: 120,
      minBlocks: 1,
    })

    expect(out.length).toBeLessThanOrEqual(220)
    expect(out).toMatch(/PECLD|Arrecadação/)
    expect(out).not.toContain('universalização avançaram')
  })

  it('estima tokens de forma conservadora por caracteres', () => {
    expect(estimatePromptTokens('123456789')).toBe(3)
  })
})
