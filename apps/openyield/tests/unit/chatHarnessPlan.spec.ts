import { describe, expect, it } from 'vitest'
import {
  deterministicChatPlan,
  isAdvisoryQuestion,
  refineChatPlan,
  shouldUseStructuredFastPath,
} from '#features/chat-context/lib/chatHarnessPlan'

describe('chatHarnessPlan', () => {
  it('detecta pergunta de investimento como advisory', () => {
    expect(isAdvisoryQuestion('oi sera q devo investir nessa acao')).toBe(true)
    expect(isAdvisoryQuestion('vale a pena comprar CSMG3?')).toBe(true)
    expect(isAdvisoryQuestion('qual a margem EBIT?')).toBe(false)
  })

  it('nao usa fast path estruturado para advisory', () => {
    const plan = deterministicChatPlan('oi sera q devo investir nessa acao')
    expect(plan.intent).toBe('advisory')
    expect(shouldUseStructuredFastPath('oi sera q devo investir nessa acao', plan)).toBe(false)
  })

  it('usa fast path apenas para lookup explicito', () => {
    const question = 'qual a margem EBIT da empresa?'
    const plan = refineChatPlan(question, deterministicChatPlan(question))
    expect(plan.intent).toBe('lookup')
    expect(shouldUseStructuredFastPath(question, plan)).toBe(true)
  })

  it('reclassifica lookup vago para general', () => {
    const question = 'me fala sobre a empresa'
    const plan = refineChatPlan(question, { intent: 'lookup', fields: ['marg_ebit'], keywords: ['ebit'], depth: 'fast' })
    expect(plan.intent).toBe('general')
    expect(plan.depth).toBe('deep')
  })
})
