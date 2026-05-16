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

export async function vectorBuscarChunksDoNotebook(
  queryTexto: string,
  notebookId: string,
  limite = 12,
): Promise<VectorSearchResult[]> {
  const api = window.pdfSourcesElectron
  if (!api?.vectorBuscarChunksNotebook) return []
  return api.vectorBuscarChunksNotebook(queryTexto, notebookId, limite)
}

export async function vectorGarantirChunksDoNotebook(
  notebookId: string,
): Promise<{ documentsIndexed: number; chunksIndexed: number } | null> {
  const api = window.pdfSourcesElectron
  if (!api?.vectorGarantirChunksNotebook) return null
  return api.vectorGarantirChunksNotebook(notebookId)
}
