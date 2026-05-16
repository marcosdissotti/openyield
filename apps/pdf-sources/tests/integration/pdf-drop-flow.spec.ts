import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App.vue'

vi.mock('#features/extract-pdf-rich', async (importOriginal) => {
  const mod = await importOriginal<typeof import('#features/extract-pdf-rich')>()
  return {
    ...mod,
    buildLlmDocumentFromPdf: vi.fn(async () => ({
      rawPlainText: 'Hello Cypress Fixture',
      llmMarkdown: '# Fixture\n\n## Página 1 — texto extraído\n\nHello Cypress Fixture\n',
      bitmapPageNumbers: [1],
    })),
  }
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '../fixtures/sample.pdf')

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  opts: { timeoutMs?: number; stepMs?: number } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const stepMs = opts.stepMs ?? 25
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return
    await new Promise((r) => setTimeout(r, stepMs))
    await flushPromises()
  }
  throw new Error('waitFor timeout')
}

describe('PDF drop flow (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows extracted text after choosing a PDF via file input', async () => {
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, [PrimeVue, { unstyled: true }]],
      },
    })

    const input = wrapper.find('[data-cy=pdf-drop-area] input[type="file"]')
    expect(input.exists()).toBe(true)

    const buf = readFileSync(fixturePath)
    const file = new File([buf], 'sample.pdf', { type: 'application/pdf' })
    const el = input.element as HTMLInputElement
    const dt = new DataTransfer()
    dt.items.add(file)
    el.files = dt.files
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    await waitFor(() => wrapper.find('[data-cy=source-markdown-panel]').exists())

    expect(wrapper.find('[data-cy=source-markdown-panel]').text()).toContain('Hello Cypress Fixture')
  })
})
