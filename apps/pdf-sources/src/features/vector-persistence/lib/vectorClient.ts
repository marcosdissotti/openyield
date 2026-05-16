export interface VectorSearchResult {
  id: string
  score: number
  metadata: Record<string, unknown>
}

export function isVectorDbAvailable(): boolean {
  return !!(
    window.pdfSourcesElectron?.vectorAdicionar &&
    window.pdfSourcesElectron?.vectorBuscar
  )
}

export async function vectorAdicionarDocumento(
  texto: string,
  metadados: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const api = window.pdfSourcesElectron
  if (!api?.vectorAdicionar) return null
  return api.vectorAdicionar(texto, metadados)
}

export async function vectorBuscarSimilares(queryTexto: string, limite = 5): Promise<VectorSearchResult[]> {
  const api = window.pdfSourcesElectron
  if (!api?.vectorBuscar) return []
  return api.vectorBuscar(queryTexto, limite)
}
