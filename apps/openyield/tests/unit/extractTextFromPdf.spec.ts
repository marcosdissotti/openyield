import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractTextFromPdf } from '#features/extract-pdf-text'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '../fixtures/sample.pdf')

describe('extractTextFromPdf', () => {
  it('extracts embedded text from a minimal PDF', async () => {
    const buf = readFileSync(fixturePath)
    const file = new File([buf], 'sample.pdf', { type: 'application/pdf' })
    const text = await extractTextFromPdf(file)
    expect(text).toContain('Hello Cypress Fixture')
  })
})
