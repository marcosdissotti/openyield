import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveLmStudioFetchBase } from '#features/llama-runtime/lib/resolveLlmServerBaseUrl'

describe('resolveLmStudioFetchBase', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('in dev with window, maps loopback :1234 to same-origin /lm-studio', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' } })
    expect(resolveLmStudioFetchBase('http://127.0.0.1:1234')).toBe('http://127.0.0.1:5173/lm-studio')
    expect(resolveLmStudioFetchBase('http://localhost:1234/')).toBe('http://127.0.0.1:5173/lm-studio')
  })

  it('does not map non-default port', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' } })
    expect(resolveLmStudioFetchBase('http://127.0.0.1:9999')).toBe('http://127.0.0.1:9999')
  })

  it('does not map LAN host', () => {
    vi.stubGlobal('window', { location: { origin: 'http://127.0.0.1:5173' } })
    expect(resolveLmStudioFetchBase('http://192.168.1.10:1234')).toBe('http://192.168.1.10:1234')
  })
})
