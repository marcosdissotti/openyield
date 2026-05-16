/** Espelho dos tipos persistidos no processo principal (evita importar `electron/` no renderer). */
export interface NotebookRow {
  id: string
  title: string
  ticker: string | null
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  notebook_id: string
  file_name: string
  file_sha256: string
  pdf_path: string
  status: string
  created_at: string
  updated_at: string
  raw_plain_text: string
  llm_markdown: string
}
