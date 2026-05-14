import { describe, expect, it } from 'vitest'
import {
  inferCapabilitiesFromHubMetadata,
  inferModelCapabilitiesFromFileName,
} from '#features/llama-runtime/lib/inferModelCapabilities'

describe('inferModelCapabilitiesFromFileName', () => {
  it('detects vision for llava', () => {
    const c = inferModelCapabilitiesFromFileName('ggml-model-q4_0-llava-v1.6-mistral.gguf')
    expect(c.vision).toBe(true)
  })

  it('detects reasoning hint', () => {
    const c = inferModelCapabilitiesFromFileName('DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf')
    expect(c.reasoning).toBe(true)
  })

  it('unknown vision for generic name', () => {
    const c = inferModelCapabilitiesFromFileName('tinyllama-1b.gguf')
    expect(c.vision).toBe('unknown')
  })

  it('detects Qwen3-VL from filename', () => {
    const c = inferModelCapabilitiesFromFileName('Qwen3-VL-2B-Instruct-BF16.gguf')
    expect(c.vision).toBe(true)
  })
})

describe('inferCapabilitiesFromHubMetadata', () => {
  it('marks vision from pipeline image-text-to-text', () => {
    const c = inferCapabilitiesFromHubMetadata({
      id: 'org/Qwen3-VL-2B-Instruct',
      pipeline_tag: 'image-text-to-text',
      tags: ['transformers', 'safetensors'],
    })
    expect(c.vision).toBe(true)
  })

  it('marks vision false for plain text-generation without VL tags', () => {
    const c = inferCapabilitiesFromHubMetadata({
      id: 'Qwen/Qwen3-0.6B',
      pipeline_tag: 'text-generation',
      tags: ['text-generation', 'transformers', 'safetensors', 'qwen3'],
    })
    expect(c.vision).toBe(false)
  })

  it('marks vision from qwen3_vl tag', () => {
    const c = inferCapabilitiesFromHubMetadata({
      id: 'unsloth/Qwen3-VL-2B-Instruct',
      pipeline_tag: 'image-text-to-text',
      tags: ['qwen3_vl', 'gguf'],
    })
    expect(c.vision).toBe(true)
  })
})
