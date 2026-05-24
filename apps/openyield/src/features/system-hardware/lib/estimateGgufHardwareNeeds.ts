/**
 * Heurísticas: a API pública do Hugging Face **não** define um campo padronizado de
 * "VRAM mínima recomendada" por modelo. Usamos tamanho do GGUF e/ou etiqueta de parâmetros (7B, 70B…).
 */

/** VRAM estimada para inferência quantizada (margem sobre o tamanho em disco). */
export function estimateVramBytesForGgufFile(sizeBytes: number): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 6 * 1024 ** 3
  return Math.ceil(sizeBytes * 1.34)
}

/** RAM mínima útil para carregar o ficheiro + SO (ordem de grandeza). */
export function estimateRamBytesForGgufFile(sizeBytes: number): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 8 * 1024 ** 3
  return Math.ceil(sizeBytes * 1.22)
}

const PARAM_TO_VRAM_GIB = new Map<string, number>([
  ['0.5B', 2],
  ['0.6B', 2],
  ['1B', 3],
  ['1.5B', 3],
  ['1.8B', 3],
  ['2B', 4],
  ['3B', 5],
  ['4B', 6],
  ['7B', 8],
  ['8B', 9],
  ['9B', 10],
  ['13B', 12],
  ['14B', 13],
  ['27B', 20],
  ['32B', 22],
  ['34B', 24],
  ['70B', 44],
  ['72B', 46],
  ['405B', 240],
])

export function estimateMinVramBytesFromParameterLabel(param: string | null | undefined): number | null {
  if (!param) return null
  const k = param.replace(/\s/g, '').toUpperCase()
  const hit = PARAM_TO_VRAM_GIB.get(k)
  if (hit != null) return Math.ceil(hit * 1024 ** 3)
  const m = k.match(/^(\d+(?:\.\d+)?)B$/i)
  if (!m) return null
  const n = parseFloat(m[1]!)
  if (!Number.isFinite(n)) return null
  const gib = Math.max(2, Math.min(200, n * 1.15 + 1.5))
  return Math.ceil(gib * 1024 ** 3)
}

/** Preferir tamanho real do GGUF; senão cair no parâmetro (tags/nome). */
export function estimateMinVramBytesForGgufOrProfile(
  sizeBytes: number | undefined,
  parameterLabel: string | null | undefined,
): number {
  if (sizeBytes != null && sizeBytes > 0) return estimateVramBytesForGgufFile(sizeBytes)
  const fromParam = estimateMinVramBytesFromParameterLabel(parameterLabel)
  if (fromParam != null) return fromParam
  return 8 * 1024 ** 3
}

export function estimateMinRamBytesForGgufOrProfile(
  sizeBytes: number | undefined,
  parameterLabel: string | null | undefined,
): number {
  if (sizeBytes != null && sizeBytes > 0) return estimateRamBytesForGgufFile(sizeBytes)
  const v = estimateMinVramBytesForGgufOrProfile(undefined, parameterLabel)
  return Math.ceil(v * 1.12)
}
