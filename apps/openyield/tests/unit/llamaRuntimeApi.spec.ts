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
      temperature: 0,
    })
    expect(out.text).toBe('{"a":1}')
  })

  it('chatCompletion inclui temperature no corpo quando passada', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { temperature?: number }
      expect(body.temperature).toBe(0)
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'x' } }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    await chatCompletion({
      baseUrl: 'http://x',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    })
    expect(fetchMock).toHaveBeenCalled()
  })

  it('chatCompletion lê streaming OpenAI-compatible', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"olá"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { stream?: boolean }
        expect(body.stream).toBe(true)
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
              controller.close()
            },
          }),
        }
      }) as unknown as typeof fetch,
    )

    const partials: string[] = []
    const out = await chatCompletion({
      baseUrl: 'http://x',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      onTextDelta: (_delta, text) => partials.push(text),
    })

    expect(out.text).toBe('olá mundo')
    expect(partials).toEqual(['olá', 'olá mundo'])
  })

  it('envia Authorization Bearer quando apiToken é passado', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer secret-token')
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    await chatCompletion({
      baseUrl: 'http://x',
      apiToken: ' secret-token ',
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(fetchMock).toHaveBeenCalled()
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

  it('listOpenAiCompatibleModels envia Authorization Bearer quando apiToken é passado', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer model-token')
      return {
        ok: true,
        json: async () => ({ data: [{ id: 'my-model' }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    const out = await listOpenAiCompatibleModels('http://x', 'model-token')
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
})
