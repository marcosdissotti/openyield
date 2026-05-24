const HF_PREFIX = '/hf-hub'

function hfUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.DEV) {
    return `${HF_PREFIX}${p}`
  }
  return `https://huggingface.co${p}`
}

/** Path `/api/models/{namespace}/{repo}` — não usar `%2F` no slug inteiro (a API devolve HTTP 400). */
export function encodeHubRepoPath(modelId: string): string {
  return modelId
    .trim()
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

export type HfHubSort = 'downloads' | 'trending' | 'likes' | 'date' | 'alphabetical'

export interface HfModelSearchHit {
  id: string
  downloads?: number
  likes?: number
  pipeline_tag?: string
  tags?: string[]
  lastModified?: string
  library_name?: string
  gated?: boolean
  private?: boolean
}

/** Formato de pesos sugerido pelas tags/nome da pesquisa do Hub (sem pedir detalhe por modelo). */
export type HubSearchWeightFormatHint = 'gguf' | 'safetensors' | 'unknown'

export function inferHubSearchHitWeightFormat(
  hit: Pick<HfModelSearchHit, 'id' | 'tags' | 'library_name'>,
): HubSearchWeightFormatHint {
  const id = hit.id.toLowerCase()
  const tags = (hit.tags ?? []).map((t) => t.toLowerCase())
  const lib = (hit.library_name ?? '').toLowerCase()
  if (lib === 'gguf' || tags.some((t) => t === 'gguf' || t.includes('gguf')) || id.includes('gguf')) {
    return 'gguf'
  }
  if (tags.includes('safetensors')) {
    return 'safetensors'
  }
  return 'unknown'
}

export interface HfGgufSibling {
  rfilename: string
  size?: number
}

export interface HfModelFullDetail extends HfModelSearchHit {
  siblingsGguf: HfGgufSibling[]
  /** Markdown README quando a API o incluir em `full=true` */
  readme?: string
  cardData?: Record<string, unknown>
}

/**
 * Pesquisa modelos no Hub (via proxy em dev para contornar CORS).
 * @see https://huggingface.co/docs/hub/api
 */
export async function searchHfModels(
  query: string,
  opts?: { limit?: number; sort?: HfHubSort; direction?: -1 | 1 },
): Promise<HfModelSearchHit[]> {
  const q = encodeURIComponent(query.trim() || 'gguf')
  const limit = opts?.limit ?? 40
  const sort = opts?.sort ?? 'downloads'
  const direction = opts?.direction ?? -1
  const url = hfUrl(`/api/models?search=${q}&limit=${limit}&sort=${sort}&direction=${direction}`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HF search ${res.status}`)
  }
  const data = (await res.json()) as Record<string, unknown>[]
  return data
    .map((row) => ({
      id: String(row.modelId ?? row.id ?? ''),
      downloads: typeof row.downloads === 'number' ? row.downloads : undefined,
      likes: typeof row.likes === 'number' ? row.likes : undefined,
      pipeline_tag: typeof row.pipeline_tag === 'string' ? row.pipeline_tag : undefined,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
      lastModified: typeof row.lastModified === 'string' ? row.lastModified : undefined,
      library_name: typeof row.library_name === 'string' ? row.library_name : undefined,
      gated: typeof row.gated === 'boolean' ? row.gated : undefined,
      private: typeof row.private === 'boolean' ? row.private : undefined,
    }))
    .filter((x) => x.id)
}

/**
 * Detalhe completo + ficheiros GGUF (uma chamada `full=true`).
 */
export async function getHfModelDetail(modelId: string): Promise<HfModelFullDetail | null> {
  const pathSeg = encodeHubRepoPath(modelId)
  if (!pathSeg) {
    throw new Error('ID do modelo vazio ou inválido.')
  }
  const url = hfUrl(`/api/models/${pathSeg}?full=true`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Hugging Face: HTTP ${res.status} ao pedir detalhes do modelo.`)
  }
  let row: Record<string, unknown>
  try {
    row = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error('Hugging Face: resposta inválida (não é JSON).')
  }
  const sibs = (row.siblings as { rfilename: string; size?: number }[] | undefined) ?? []
  const siblingsGguf = sibs
    .filter((s) => s.rfilename.toLowerCase().endsWith('.gguf'))
    .map((s) => ({ rfilename: s.rfilename, size: s.size }))

  return {
    id: String(row.id ?? row.modelId ?? modelId),
    downloads: typeof row.downloads === 'number' ? row.downloads : undefined,
    likes: typeof row.likes === 'number' ? row.likes : undefined,
    pipeline_tag: typeof row.pipeline_tag === 'string' ? row.pipeline_tag : undefined,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    lastModified: typeof row.lastModified === 'string' ? row.lastModified : undefined,
    library_name: typeof row.library_name === 'string' ? row.library_name : undefined,
    gated: typeof row.gated === 'boolean' ? row.gated : undefined,
    private: typeof row.private === 'boolean' ? row.private : undefined,
    readme: typeof row.readme === 'string' ? row.readme : undefined,
    cardData: row.cardData && typeof row.cardData === 'object' ? (row.cardData as Record<string, unknown>) : undefined,
    siblingsGguf,
  }
}

/** @deprecated usar getHfModelDetail */
export async function listGgufSiblingsForModel(modelId: string): Promise<HfGgufSibling[]> {
  try {
    const d = await getHfModelDetail(modelId)
    return d?.siblingsGguf ?? []
  } catch {
    return []
  }
}

export function resolveHfDownloadUrl(modelId: string, rfilename: string): string {
  const [author, repo] = modelId.split('/')
  if (!author || !repo) {
    throw new Error(`modelId inválido: ${modelId}`)
  }
  const parts = rfilename.split('/')
  const encoded = parts.map((seg) => encodeURIComponent(seg)).join('/')
  return `https://huggingface.co/${author}/${repo}/resolve/main/${encoded}`
}

export function formatHfBytes(n?: number): string {
  if (n == null || Number.isNaN(n)) return '—'
  const gb = n / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = n / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return `${Math.round(n / 1024)} KB`
}

export function hfRelativeTime(iso?: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const days = Math.floor((Date.now() - t) / (86400 * 1000))
  if (days < 1) return 'hoje'
  if (days === 1) return 'há 1 dia'
  if (days < 60) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} meses`
  return `há ${Math.floor(days / 365)} anos`
}

/** Heurística: parâmetros a partir de tags / id (ex. 7B, 4B) */
export function guessParameterSizeFromHub(hit: Pick<HfModelSearchHit, 'id' | 'tags'>): string | null {
  const pool = [hit.id, ...(hit.tags ?? [])].join(' ')
  const m = pool.match(/\b(\d{1,3}\.?\d?\s?[bB])\b/)
  return m ? m[1]!.replace(/\s/g, '').toUpperCase() : null
}

export function guessArchFromHub(hit: Pick<HfModelSearchHit, 'id' | 'tags' | 'pipeline_tag'>): string {
  const tags = (hit.tags ?? []).map((t) => t.toLowerCase())
  const id = hit.id.toLowerCase()
  for (const t of ['qwen3_vl', 'qwen2_vl', 'llama', 'mistral', 'gemma', 'phi', 'deepseek']) {
    if (tags.some((x) => x.includes(t)) || id.includes(t)) return t
  }
  return hit.pipeline_tag?.replace(/-/g, '_') ?? '—'
}
