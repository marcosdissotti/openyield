export type CapabilityState = true | false | 'unknown'

export interface ModelCapabilities {
  vision: CapabilityState
  tools: CapabilityState
  reasoning: CapabilityState
}

/** Metadados mínimos do Hub (pesquisa ou detalhe) para inferir visão/raciocínio além do nome do ficheiro. */
export interface HubCapabilityMeta {
  id: string
  pipeline_tag?: string
  tags?: string[]
}

const VISION_PATTERNS = [
  /llava/i,
  /qwen3[-_.\s]?vl/i,
  /qwen.?2.?5.?vl/i,
  /qwen.?2.?vl/i,
  /qwen.?vl/i,
  /minicpm.?v/i,
  /moondream/i,
  /bakllava/i,
  /internvl/i,
  /glm-4v/i,
  /pixtral/i,
  /cogvlm/i,
  /idefics/i,
  /fuyu/i,
  /vl-?/i,
]

const TOOLS_HINT = [
  /llama.?3\.1/i,
  /llama-?3\.1/i,
  /mistral-?nemo/i,
  /firefunction/i,
  /functionary/i,
  /hermes-?3/i,
  /hermes-?2/i,
]

const REASONING_HINT = [
  /deepseek-?r1/i,
  /deepseek.*reasoner/i,
  /qwq/i,
  /o1/i,
  /thinking/i,
  /reasoning/i,
  /r1-?distill/i,
  /qwen3[-_.\s]?think/i,
  /qwen[-_.\s]?think/i,
  /thinker/i,
]

const VISION_TAG_SUBSTRINGS = [
  'image-text-to-text',
  'image-to-text',
  'visual-question-answering',
  'image-text',
  'qwen3_vl',
  'qwen2_vl',
  'llava',
]

const REASONING_TAG_SUBSTRINGS = ['reasoning', 'chain-of-thought', 'thinking', 'cot', 'o1', 'r1', 'qwq']

/**
 * Heurísticas a partir do nome do ficheiro GGUF (sem metadados curados do Hub).
 */
export function inferModelCapabilitiesFromFileName(fileName: string): ModelCapabilities {
  const base = fileName.replace(/\.gguf$/i, '')
  const vision = VISION_PATTERNS.some((re) => re.test(base)) ? true : ('unknown' as const)
  const tools = TOOLS_HINT.some((re) => re.test(base)) ? true : ('unknown' as const)
  const reasoning = REASONING_HINT.some((re) => re.test(base)) ? true : ('unknown' as const)
  return { vision, tools, reasoning }
}

/**
 * Combina nome do repositório + `pipeline_tag` + `tags` do Hugging Face (quando existem).
 * Usar na lista de pesquisa e no painel de detalhe para distinguir VL de modelos só texto.
 */
export function inferCapabilitiesFromHubMetadata(meta: HubCapabilityMeta): ModelCapabilities {
  const tail = (meta.id.split('/').pop() ?? meta.id).replace(/\.gguf$/i, '')
  const tags = (meta.tags ?? []).map((t) => String(t).toLowerCase())
  const pipe = (meta.pipeline_tag ?? '').toLowerCase()
  const hay = `${meta.id.toLowerCase()} ${tail} ${tags.join(' ')} ${pipe}`

  const fromName = inferModelCapabilitiesFromFileName(`${tail}.gguf`)

  const hasVisionTag = tags.some((t) => VISION_TAG_SUBSTRINGS.some((v) => t.includes(v)))
  const hasVisionPipe =
    /image|vision|vl|multimodal|image-text|visual|video-text|image-to-text/.test(pipe) ||
    /\b(vlm|llava|qwen3[_-]?vl|qwen[_-]?2\.?5[_-]?vl)\b/.test(hay)

  let vision: CapabilityState = fromName.vision
  if (hasVisionTag || hasVisionPipe) vision = true
  else if (
    (pipe === 'text-generation' || pipe === 'text2text-generation') &&
    !hasVisionTag &&
    !VISION_PATTERNS.some((re) => re.test(tail))
  ) {
    vision = false
  }

  const hasReasonTag = tags.some((t) => REASONING_TAG_SUBSTRINGS.some((r) => t.includes(r)))
  let reasoning: CapabilityState = fromName.reasoning
  if (hasReasonTag || /\b(r1|qwq|o1|thinking|reasoning|thinker|cot)\b/i.test(hay)) reasoning = true

  return {
    vision,
    tools: fromName.tools,
    reasoning,
  }
}

export function capabilityShortLabelPt(
  key: 'vision' | 'tools' | 'reasoning',
  state: CapabilityState,
): string {
  const v =
    key === 'vision'
      ? { true: 'Com imagem', false: 'Só texto', unknown: 'Imagem ?' }
      : key === 'tools'
        ? { true: 'Tools API', false: 'Sem tools', unknown: 'Tools ?' }
        : { true: 'Raciocínio', false: 'Sem “pensar”', unknown: 'Pensar ?' }
  return state === true ? v.true : state === false ? v.false : v.unknown
}

export function capabilityTooltipPt(key: 'vision' | 'tools' | 'reasoning', state: CapabilityState): string {
  const base =
    key === 'vision'
      ? 'Entrada de imagem no chat (modelos VL no LM Studio / API compatível).'
      : key === 'tools'
        ? 'Chamada de ferramentas / function calling (depende do modelo e do servidor).'
        : 'Modelos orientados a cadeia de raciocínio / thinking (heurística pelo nome ou tags do Hub).'
  const statePt =
    state === true ? 'Provável suporte.' : state === false ? 'Provável que não (só texto ou chat normal).' : 'Incerto: confira a ficha do modelo no Hugging Face.'
  return `${base} ${statePt}`
}
