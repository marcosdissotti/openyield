import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  chatCompletion,
  listOpenAiCompatibleModels,
  LlamaRuntimeError,
} from '#features/llama-runtime/lib/llamaRuntimeApi'

describe('llamaRuntimeApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('chatCompletion parses assistant text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"a":1}' } }],
        }),
      })) as unknown as typeof fetch,
    )
    const out = await chatCompletion({
      baseUrl: 'http://x',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      timeoutMs: 5000,
    })
    expect(out.text).toBe('{"a":1}')
  })

  it('listOpenAiCompatibleModels parses data[].id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: 'my-model' }, { id: '' }, { id: '  ' }],
        }),
      })) as unknown as typeof fetch,
    )
    const out = await listOpenAiCompatibleModels('http://x')
    expect(out).toEqual([{ id: 'my-model' }])
  })

  it('chatCompletion maps network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'busy' })))
    await expect(
      chatCompletion({
        baseUrl: 'http://x',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(LlamaRuntimeError)
  })

  it('chatCompletion appends hint on proxy-style 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })),
    )
    await expect(
      chatCompletion({
        baseUrl: 'http://x',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/Start Server/)
  })
