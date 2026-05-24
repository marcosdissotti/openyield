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
  ai_summary: string
  ai_summary_updated_at: string
}

export interface StudioReportRow {
  id: string
  notebook_id: string
  type: 'risk'
  title: string
  subtitle: string
  status: 'generating' | 'ready' | 'error'
  body: string
  created_at: string
  updated_at: string
  progress_percent: number
  eta_label: string
}

export interface FundamentalFieldRow {
  key: string
  label: string
  section: string
  value: string
  source?: string
  source_file?: string
  source_page?: string
  source_line?: string
  calculation?: string
  manual?: boolean
  calculated?: boolean
}

export interface FundamentalSnapshotRow {
  id: string
  notebook_id: string
  ticker: string | null
  title: string
  status: 'generating' | 'ready' | 'error'
  fields: FundamentalFieldRow[]
  error: string | null
  progress_percent: number
  eta_label: string
  created_at: string
  updated_at: string
}

/** Modelo FCD persistido por caderno (1 por notebook_id). */
export interface FcdSnapshotRow {
  notebook_id: string
  ticker: string | null
  inputs_json: string
  created_at: string
  updated_at: string
}
