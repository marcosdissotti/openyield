import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'
import type { DocumentRow, NotebookRow } from '../src/shared/model/pdfLibraryDb'

import type { Database as SqliteDatabase } from 'better-sqlite3'

const require = createRequire(import.meta.url)
const BetterSqlite3 = require('better-sqlite3') as new (filename: string) => SqliteDatabase

type PageSectionInput = {
  page_num: number
  section_kind: 'texto' | 'layout' | 'ocr'
  body_markdown: string
  sort_order: number
}

let dbInstance: SqliteDatabase | null = null

function dataRoot(): string {
  const root = path.join(app.getPath('userData'), 'pdf-sources-data')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  const pdfs = path.join(root, 'pdfs')
  if (!existsSync(pdfs)) mkdirSync(pdfs, { recursive: true })
  return root
}

function dbPath(): string {
  return path.join(dataRoot(), 'library.sqlite')
}

function migrate(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notebook (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ticker TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebook(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_sha256 TEXT NOT NULL,
      pdf_path TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS document_body (
      document_id TEXT PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
      raw_plain_text TEXT NOT NULL,
      llm_markdown TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS page_section (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
      page_num INTEGER NOT NULL,
      section_kind TEXT NOT NULL CHECK(section_kind IN ('texto','layout','ocr')),
      body_markdown TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_document_notebook ON document(notebook_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_page_section_doc ON page_section(document_id, page_num);
  `)
}

export function getPdfDb(): SqliteDatabase {
  if (dbInstance) return dbInstance
  const p = dbPath()
  const existed = existsSync(p)
  const db = new BetterSqlite3(p)
  dbInstance = db
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  if (!existed) {
    const now = new Date().toISOString()
    const id = randomUUID()
    db
      .prepare(
        `INSERT INTO notebook (id, title, ticker, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, 'Caderno 1', null, now, now)
    db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('active_notebook_id', ?)`).run(id)
  }
  return db
}

export function getActiveNotebookId(): string | null {
  const row = getPdfDb()
    .prepare(`SELECT value FROM app_meta WHERE key = 'active_notebook_id'`)
    .get() as { value: string } | undefined
  return row?.value ?? null
}

export function setActiveNotebookId(notebookId: string): void {
  getPdfDb().prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('active_notebook_id', ?)`).run(notebookId)
}

export function listNotebooks(): NotebookRow[] {
  return getPdfDb()
    .prepare(`SELECT id, title, ticker, created_at, updated_at FROM notebook ORDER BY datetime(created_at)`)
    .all() as NotebookRow[]
}

export function upsertNotebook(row: { id: string; title: string; ticker: string | null }): void {
  const db = getPdfDb()
  const now = new Date().toISOString()
  const existing = db.prepare(`SELECT id FROM notebook WHERE id = ?`).get(row.id) as { id: string } | undefined
  if (existing) {
    db.prepare(`UPDATE notebook SET title = ?, ticker = ?, updated_at = ? WHERE id = ?`).run(
      row.title,
      row.ticker,
      now,
      row.id,
    )
  } else {
    db.prepare(
      `INSERT INTO notebook (id, title, ticker, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(row.id, row.title, row.ticker, now, now)
  }
}

export function deleteNotebook(notebookId: string): void {
  const db = getPdfDb()
  db.prepare(`DELETE FROM notebook WHERE id = ?`).run(notebookId)
  let remaining = listNotebooks()
  if (!remaining.length) {
    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO notebook (id, title, ticker, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, 'Caderno 1', null, now, now)
    setActiveNotebookId(id)
    return
  }
  const active = getActiveNotebookId()
  if (active === notebookId) {
    const first = remaining[0]
    if (first) setActiveNotebookId(first.id)
  }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export function persistPdfDocument(input: {
  documentId: string
  notebookId: string
  fileName: string
  pdfBytes: Uint8Array
  rawPlainText: string
  llmMarkdown: string
  pageSections: PageSectionInput[]
}): { pdfPath: string; fileSha256: string } {
  const db = getPdfDb()
  const hash = sha256Hex(Buffer.from(input.pdfBytes))
  const pdfRel = path.join('pdfs', `${hash}.pdf`)
  const absPdf = path.join(dataRoot(), pdfRel)
  if (!existsSync(absPdf)) {
    const tmp = `${absPdf}.tmp`
    writeFileSync(tmp, input.pdfBytes)
    renameSync(tmp, absPdf)
  }
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO document (id, notebook_id, file_name, file_sha256, pdf_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`,
    ).run(input.documentId, input.notebookId, input.fileName, hash, absPdf, now, now)
    db.prepare(`INSERT OR REPLACE INTO document_body (document_id, raw_plain_text, llm_markdown) VALUES (?, ?, ?)`).run(
      input.documentId,
      input.rawPlainText,
      input.llmMarkdown,
    )
    db.prepare(`DELETE FROM page_section WHERE document_id = ?`).run(input.documentId)
    const ins = db.prepare(
      `INSERT INTO page_section (document_id, page_num, section_kind, body_markdown, sort_order) VALUES (?, ?, ?, ?, ?)`,
    )
    for (const s of input.pageSections) {
      ins.run(input.documentId, s.page_num, s.section_kind, s.body_markdown, s.sort_order)
    }
  })
  tx()
  return { pdfPath: absPdf, fileSha256: hash }
}

export function deleteDocument(documentId: string): void {
  const db = getPdfDb()
  db.prepare(`DELETE FROM document WHERE id = ?`).run(documentId)
}

export function listDocumentsForNotebook(notebookId: string): DocumentRow[] {
  return getPdfDb()
    .prepare(
      `SELECT d.id, d.notebook_id, d.file_name, d.file_sha256, d.pdf_path, d.status, d.created_at, d.updated_at,
              b.raw_plain_text, b.llm_markdown
       FROM document d
       JOIN document_body b ON b.document_id = d.id
       WHERE d.notebook_id = ?
       ORDER BY datetime(d.created_at)`,
    )
    .all(notebookId) as DocumentRow[]
}

export function listAllDocumentsWithBodies(): DocumentRow[] {
  return getPdfDb()
    .prepare(
      `SELECT d.id, d.notebook_id, d.file_name, d.file_sha256, d.pdf_path, d.status, d.created_at, d.updated_at,
              b.raw_plain_text, b.llm_markdown
       FROM document d
       JOIN document_body b ON b.document_id = d.id
       ORDER BY d.notebook_id, datetime(d.created_at)`,
    )
    .all() as DocumentRow[]
}

export function loadWorkspaceState(): {
  notebooks: NotebookRow[]
  activeNotebookId: string | null
  documents: DocumentRow[]
} {
  const notebooks = listNotebooks()
  let active = getActiveNotebookId()
  if (!active && notebooks.length) {
    active = notebooks[0].id
    setActiveNotebookId(active)
  }
  if (active && !notebooks.some((n) => n.id === active)) {
    active = notebooks[0]?.id ?? null
    if (active) setActiveNotebookId(active)
  }
  const documents = listAllDocumentsWithBodies()
  return { notebooks, activeNotebookId: active, documents }
}

/** Dev: resolve userData path for debugging */
export function debugDataPaths(): { db: string; root: string } {
  return { db: dbPath(), root: dataRoot() }
}
