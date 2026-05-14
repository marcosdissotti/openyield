import { describe, expect, it } from 'vitest'
import { encodeHubRepoPath, inferHubSearchHitWeightFormat } from '#features/hf-hub/lib/hfHubModelsApi'

describe('encodeHubRepoPath', () => {
  it('mantém slash entre autor e repo (evita %2F que dá HTTP 400 no Hub)', () => {
    expect(encodeHubRepoPath('Qwen/Qwen2.5-0.5B-Instruct')).toBe('Qwen/Qwen2.5-0.5B-Instruct')
    expect(encodeHubRepoPath('org name/repo name')).toBe('org%20name/repo%20name')
  })
})

describe('inferHubSearchHitWeightFormat', () => {
  it('detecta GGUF por tag, library_name ou id', () => {
    expect(
      inferHubSearchHitWeightFormat({
        id: 'bartowski/Qwen_Qwen3.5-9B-GGUF',
        tags: ['gguf', 'license:apache-2.0'],
      }),
    ).toBe('gguf')
    expect(inferHubSearchHitWeightFormat({ id: 'x/y', tags: ['GGUF'], library_name: 'transformers' })).toBe('gguf')
    expect(inferHubSearchHitWeightFormat({ id: 'u/My-GGUF-files', tags: [] })).toBe('gguf')
    expect(inferHubSearchHitWeightFormat({ id: 'a/b', tags: [], library_name: 'gguf' })).toBe('gguf')
  })

  it('Safetensors sem sinal GGUF', () => {
    expect(
      inferHubSearchHitWeightFormat({
        id: 'Qwen/Qwen3.5-9B',
        tags: ['transformers', 'safetensors'],
        library_name: 'transformers',
      }),
    ).toBe('safetensors')
  })

  it('GGUF tem prioridade sobre safetensors nas tags', () => {
    expect(
      inferHubSearchHitWeightFormat({
        id: 'x/y',
        tags: ['safetensors', 'gguf'],
      }),
    ).toBe('gguf')
  })

  it('unknown quando não há pistas', () => {
    expect(inferHubSearchHitWeightFormat({ id: 'x/y', tags: ['pytorch'] })).toBe('unknown')
  })
})
