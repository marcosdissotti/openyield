import { describe, expect, it } from 'vitest'
import { sanitizeOcrPlainText } from '#features/extract-pdf-rich/lib/sanitizeOcrPlainText'

describe('sanitizeOcrPlainText', () => {
  it('colapsa pontilhado OCR antes do nº de página em linhas tipo sumário', () => {
    const line =
      '1.1. Dados Operacionais TIIMEStIaiS...........ii0isÔciiiiiiiiiiimi ss ses sssssnnancos 3'
    const out = sanitizeOcrPlainText(line)
    expect(out).toContain('… 3')
    expect(out).not.toMatch(/iiiiiiiiii/)
  })

  it('não altera linhas sem padrão de índice', () => {
    const t = 'Texto normal sem numeração inicial.'
    expect(sanitizeOcrPlainText(t)).toBe(t)
  })

  it('mantém linha numerada sem cauda de lixo longa', () => {
    expect(sanitizeOcrPlainText('2.2. Custos e Despesas 9')).toBe('2.2. Custos e Despesas 9')
  })
})
