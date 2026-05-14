export function mapPdfExtractError(error: unknown): string {
  if (error instanceof Error && error.message === 'EMPTY_PDF_TEXT') {
    return 'Este PDF não tem camada de texto (provavelmente um scan). Tente um PDF digital.'
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return 'Não foi possível extrair o texto deste PDF.'
}
