import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const doc = await PDFDocument.create()
const page = doc.addPage([612, 792])
const font = await doc.embedFont(StandardFonts.Helvetica)
const longFixtureText =
  'Hello Cypress Fixture. ' +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(4) +
  'Padding para ultrapassar o limite mínimo de OCR e evitar Tesseract nos testes e2e.'
page.drawText(longFixtureText, { x: 72, y: 720, size: 11, font, maxWidth: 468 })

const bytes = await doc.save()

for (const rel of ['tests/fixtures/sample.pdf', 'cypress/fixtures/sample.pdf']) {
  const out = path.join(root, rel)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, bytes)
}

console.log('Wrote sample.pdf to tests/fixtures and cypress/fixtures')
