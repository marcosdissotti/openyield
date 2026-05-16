import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { LocalIndex } from 'vectra'
import type { IndexItem } from 'vectra'
import type { MetadataTypes } from 'vectra'
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'
import type { DocumentRow, NotebookRow } from '../src/shared/model/pdfLibraryDb'

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
const MAX_CHUNK_CHARS = 1800
const CHUNK_OVERLAP_CHARS = 220

export type VectorMetadata = Record<string, unknown>

export interface VectorSearchResult {
  id: string
  score: number
  metadata: VectorMetadata
}

type StoredMetadata = Record<string, MetadataTypes>
type StoredIndexItem = IndexItem<StoredMetadata> & { metadataFile?: string }

interface WorkspaceMeta {
  notebooks: NotebookRow[]
  activeNotebookId: string | null
}

interface PageSectionInput {
  page_num: number
  section_kind: 'texto' | 'layout' | 'ocr'
  body_markdown: string
  sort_order: number
}

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null

function userVectorRoot(): string {
  const root = path.join(app.getPath('userData'), 'vectra')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function pdfRoot(): string {
  const root = path.join(userVectorRoot(), 'pdfs')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function workspaceMetaPath(): string {
  return path.join(userVectorRoot(), 'workspace.json')
}

function configureTransformersCache(): void {
  const cacheDir = path.join(app.getPath('userData'), 'transformers-cache')
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
  env.cacheDir = cacheDir
}

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    configureTransformersCache()
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL)
  }
  return extractorPromise
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function toStoredMetadata(metadata: VectorMetadata): StoredMetadata {
  const stored: StoredMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'rawPlainText' || key === 'llmMarkdown' || key === 'chunkText') continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      stored[key] = value
    }
  }
  stored.__metadataJson = JSON.stringify(metadata)
  return stored
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function defaultWorkspaceMeta(): WorkspaceMeta {
  const now = new Date().toISOString()
  const id = randomUUID()
  return {
    notebooks: [{ id, title: 'Caderno 1', ticker: null, created_at: now, updated_at: now }],
    activeNotebookId: id,
  }
}

function readWorkspaceMeta(): WorkspaceMeta {
  try {
    const raw = readFileSync(workspaceMetaPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WorkspaceMeta>
    if (Array.isArray(parsed.notebooks) && parsed.notebooks.length) {
      return {
        notebooks: parsed.notebooks as NotebookRow[],
        activeNotebookId: parsed.activeNotebookId ?? parsed.notebooks[0]?.id ?? null,
      }
    }
  } catch {
    /* first run or corrupt metadata: recreate below */
  }
  const fallback = defaultWorkspaceMeta()
  writeWorkspaceMeta(fallback)
  return fallback
}

function writeWorkspaceMeta(meta: WorkspaceMeta): void {
  const p = workspaceMetaPath()
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(meta, null, 2))
  renameSync(tmp, p)
}

function metadataToDocumentRow(id: string, metadata: VectorMetadata): DocumentRow | null {
  if (metadata.kind !== 'document') return null
  const notebookId = typeof metadata.notebookId === 'string' ? metadata.notebookId : ''
  const fileName = typeof metadata.fileName === 'string' ? metadata.fileName : ''
  if (!notebookId || !fileName) return null
  return {
    id,
    notebook_id: notebookId,
    file_name: fileName,
    file_sha256: typeof metadata.fileSha256 === 'string' ? metadata.fileSha256 : '',
    pdf_path: typeof metadata.pdfPath === 'string' ? metadata.pdfPath : '',
    status: typeof metadata.status === 'string' ? metadata.status : 'ready',
    created_at: typeof metadata.createdAt === 'string' ? metadata.createdAt : new Date().toISOString(),
    updated_at: typeof metadata.updatedAt === 'string' ? metadata.updatedAt : new Date().toISOString(),
    raw_plain_text: typeof metadata.rawPlainText === 'string' ? metadata.rawPlainText : '',
    llm_markdown: typeof metadata.llmMarkdown === 'string' ? metadata.llmMarkdown : '',
  }
}

function fromStoredMetadata(metadata: StoredMetadata | undefined): VectorMetadata {
  const raw = metadata?.__metadataJson
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as VectorMetadata
    } catch {
      /* keep scalar metadata fallback below */
    }
  }
  const restored: VectorMetadata = {}
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (key !== '__metadataJson') restored[key] = value
  }
  return restored
}

function readItemMetadataFile(indexFolderPath: string, metadataFile?: string): VectorMetadata | null {
  if (!metadataFile) return null
  try {
    const raw = readFileSync(path.join(indexFolderPath, metadataFile), 'utf-8')
    return fromStoredMetadata(JSON.parse(raw) as StoredMetadata)
  } catch {
    return null
  }
}

function firstMarkdownLine(chunk: string): string {
  return (chunk.match(/^[^\n]*/)?.[0] ?? '').trim()
}

function parseSectionKind(heading: string): 'texto' | 'layout' | 'ocr' | 'vision' | 'unknown' {
  const folded = heading.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (/texto\s+extraido/.test(folded)) return 'texto'
  if (/layout/.test(folded)) return 'layout'
  if (/\bocr\b/.test(folded)) return 'ocr'
  if (/visao|vision|ia/.test(folded)) return 'vision'
  return 'unknown'
}

function stripPageHeading(chunk: string): string {
  return chunk.replace(/^##\s+P[^\n\d]*gina\s+\d+[^\n]*\n+/, '').trim()
}

function cleanChunkText(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/\t/g, ' | ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitLongText(text: string): string[] {
  const clean = cleanChunkText(text)
  if (!clean) return []
  if (clean.length <= MAX_CHUNK_CHARS) return [clean]

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const paragraph of paragraphs) {
    if (!buf) {
      buf = paragraph
      continue
    }
    if (`${buf}\n\n${paragraph}`.length <= MAX_CHUNK_CHARS) {
      buf = `${buf}\n\n${paragraph}`
      continue
    }
    chunks.push(buf)
    const overlap = buf.slice(Math.max(0, buf.length - CHUNK_OVERLAP_CHARS)).trim()
    buf = overlap ? `${overlap}\n\n${paragraph}` : paragraph
  }
  if (buf) chunks.push(buf)

  const hardSplit: string[] = []
  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHUNK_CHARS * 1.25) {
      hardSplit.push(chunk)
      continue
    }
    for (let i = 0; i < chunk.length; i += MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS) {
      hardSplit.push(chunk.slice(i, i + MAX_CHUNK_CHARS).trim())
    }
  }
  return hardSplit.filter(Boolean)
}

function parseMarkdownPageSections(markdown: string): Array<{
  pageNum: number
  sectionKind: 'texto' | 'layout' | 'ocr' | 'vision' | 'unknown'
  sectionTitle: string
  body: string
}> {
  const src = (markdown || '').replace(/\r\n/g, '\n')
  const chunks = src.split(/(?=^##\s+P[^\n\d]*gina\s+\d+)/m)
  const out: Array<{
    pageNum: number
    sectionKind: 'texto' | 'layout' | 'ocr' | 'vision' | 'unknown'
    sectionTitle: string
    body: string
  }> = []
  for (const chunk of chunks) {
    const pageMatch = chunk.match(/^##\s+P[^\n\d]*gina\s+(\d+)(?:\s+\u2014\s*([^\n]+))?/i)
    if (!pageMatch) continue
    const heading = firstMarkdownLine(chunk)
    const pageNum = parseInt(pageMatch[1]!, 10)
    const sectionTitle = (pageMatch[2] ?? 'Conteúdo').trim()
    const body = stripPageHeading(chunk)
    if (!Number.isFinite(pageNum) || !body.trim()) continue
    out.push({
      pageNum,
      sectionKind: parseSectionKind(heading),
      sectionTitle,
      body,
    })
  }
  return out
}

export class VectorService {
  private readonly index: LocalIndex<StoredMetadata>
  private inicializacaoPromise: Promise<void> | null = null

  constructor(indexPath = path.join(userVectorRoot(), 'documents')) {
    this.index = new LocalIndex<StoredMetadata>(indexPath)
  }

  async inicializar(): Promise<void> {
    if (!this.inicializacaoPromise) {
      this.inicializacaoPromise = (async () => {
        await getExtractor()
        await this.ensureIndexCreated()
      })()
    }
    await this.inicializacaoPromise
  }

  private async ensureIndexCreated(): Promise<void> {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({
        version: 1,
        metadata_config: {
          indexed: ['id', 'kind', 'documentId', 'notebookId', 'title', 'fileName', 'pageNum', 'sectionKind'],
        },
      })
    }
  }

  private itemMetadata(item: StoredIndexItem): VectorMetadata {
    return readItemMetadataFile(this.index.folderPath, item.metadataFile) ?? fromStoredMetadata(item.metadata)
  }

  async adicionarDocumento(texto: string, metadados: VectorMetadata = {}): Promise<{ id: string }> {
    await this.inicializar()
    const cleanText = normalizeText(texto)
    if (!cleanText) throw new Error('Texto vazio: nada para indexar no Vectra.')

    const id =
      typeof metadados.id === 'string' && metadados.id.trim()
        ? metadados.id.trim()
        : typeof metadados.documentId === 'string' && metadados.documentId.trim()
          ? metadados.documentId.trim()
          : randomUUID()

    const vector = await this.gerarEmbedding(cleanText)
    await this.index.upsertItem({
      id,
      vector,
      metadata: toStoredMetadata({
        ...metadados,
        id,
        textPreview: cleanText.slice(0, 500),
        embeddingModel: EMBEDDING_MODEL,
      }),
    })
    return { id }
  }

  async loadWorkspaceState(): Promise<{
    notebooks: NotebookRow[]
    activeNotebookId: string | null
    documents: DocumentRow[]
  }> {
    await this.ensureIndexCreated()
    const meta = readWorkspaceMeta()
    const items = (await this.index.listItems()) as StoredIndexItem[]
    const documents = items
      .map((item) =>
        metadataToDocumentRow(
          item.id,
          readItemMetadataFile(this.index.folderPath, item.metadataFile) ?? fromStoredMetadata(item.metadata),
        ),
      )
      .filter((row): row is DocumentRow => row != null)
      .sort((a, b) => a.notebook_id.localeCompare(b.notebook_id) || a.created_at.localeCompare(b.created_at))

    const notebooksById = new Map(meta.notebooks.map((n) => [n.id, n]))
    for (const doc of documents) {
      if (!notebooksById.has(doc.notebook_id)) {
        const now = new Date().toISOString()
        notebooksById.set(doc.notebook_id, {
          id: doc.notebook_id,
          title: 'Caderno',
          ticker: null,
          created_at: now,
          updated_at: now,
        })
      }
    }

    let notebooks = [...notebooksById.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (!notebooks.length) notebooks = defaultWorkspaceMeta().notebooks
    const activeNotebookId =
      meta.activeNotebookId && notebooks.some((n) => n.id === meta.activeNotebookId)
        ? meta.activeNotebookId
        : notebooks[0]?.id ?? null
    writeWorkspaceMeta({ notebooks, activeNotebookId })
    return { notebooks, activeNotebookId, documents }
  }

  upsertNotebook(row: { id: string; title: string; ticker: string | null }): void {
    const meta = readWorkspaceMeta()
    const now = new Date().toISOString()
    const existing = meta.notebooks.find((n) => n.id === row.id)
    if (existing) {
      existing.title = row.title
      existing.ticker = row.ticker
      existing.updated_at = now
    } else {
      meta.notebooks.push({ id: row.id, title: row.title, ticker: row.ticker, created_at: now, updated_at: now })
    }
    if (!meta.activeNotebookId) meta.activeNotebookId = row.id
    writeWorkspaceMeta(meta)
  }

  setActiveNotebook(notebookId: string): void {
    const meta = readWorkspaceMeta()
    meta.activeNotebookId = notebookId
    writeWorkspaceMeta(meta)
  }

  async deleteNotebook(notebookId: string): Promise<void> {
    await this.ensureIndexCreated()
    const items = (await this.index.listItems()) as StoredIndexItem[]
    for (const item of items) {
      const metadata = this.itemMetadata(item)
      if ((metadata.kind === 'document' || metadata.kind === 'documentChunk') && metadata.notebookId === notebookId) {
        await this.index.deleteItem(item.id)
      }
    }
    const meta = readWorkspaceMeta()
    meta.notebooks = meta.notebooks.filter((n) => n.id !== notebookId)
    if (!meta.notebooks.length) {
      writeWorkspaceMeta(defaultWorkspaceMeta())
      return
    }
    if (meta.activeNotebookId === notebookId) meta.activeNotebookId = meta.notebooks[0]?.id ?? null
    writeWorkspaceMeta(meta)
  }

  async persistPdfDocument(input: {
    documentId: string
    notebookId: string
    fileName: string
    pdfBytes: Uint8Array
    rawPlainText: string
    llmMarkdown: string
    pageSections: PageSectionInput[]
  }): Promise<{ pdfPath: string; fileSha256: string }> {
    await this.ensureIndexCreated()
    const bytes = Buffer.from(input.pdfBytes)
    const hash = sha256Hex(bytes)
    const absPdf = path.join(pdfRoot(), `${hash}.pdf`)
    if (!existsSync(absPdf)) {
      const tmp = `${absPdf}.tmp`
      writeFileSync(tmp, bytes)
      renameSync(tmp, absPdf)
    }

    const existing = (await this.index.getItem(input.documentId)) as StoredIndexItem | undefined
    const existingMeta = existing
      ? readItemMetadataFile(this.index.folderPath, existing.metadataFile) ?? fromStoredMetadata(existing.metadata)
      : {}
    const now = new Date().toISOString()
    await this.adicionarDocumento(input.llmMarkdown || input.rawPlainText, {
      ...existingMeta,
      kind: 'document',
      id: input.documentId,
      documentId: input.documentId,
      notebookId: input.notebookId,
      fileName: input.fileName,
      title: input.fileName,
      fileSha256: hash,
      pdfPath: absPdf,
      status: 'ready',
      createdAt: typeof existingMeta.createdAt === 'string' ? existingMeta.createdAt : now,
      updatedAt: now,
      rawPlainText: input.rawPlainText,
      llmMarkdown: input.llmMarkdown,
      pageSections: input.pageSections,
    })
    await this.upsertDocumentChunks({
      documentId: input.documentId,
      notebookId: input.notebookId,
      fileName: input.fileName,
      sourceText: input.llmMarkdown || input.rawPlainText,
    })
    return { pdfPath: absPdf, fileSha256: hash }
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.ensureIndexCreated()
    await this.deleteDocumentChunks(documentId)
    await this.index.deleteItem(documentId)
  }

  private async deleteDocumentChunks(documentId: string): Promise<void> {
    const items = (await this.index.listItems()) as StoredIndexItem[]
    for (const item of items) {
      const metadata = this.itemMetadata(item)
      if (metadata.kind === 'documentChunk' && metadata.documentId === documentId) {
        await this.index.deleteItem(item.id)
      }
    }
  }

  private async documentHasChunks(documentId: string): Promise<boolean> {
    const items = (await this.index.listItems()) as StoredIndexItem[]
    for (const item of items) {
      const metadata = this.itemMetadata(item)
      if (metadata.kind === 'documentChunk' && metadata.documentId === documentId) return true
    }
    return false
  }

  private async upsertDocumentChunks(input: {
    documentId: string
    notebookId: string
    fileName: string
    sourceText: string
  }): Promise<void> {
    await this.deleteDocumentChunks(input.documentId)
    const sections = parseMarkdownPageSections(input.sourceText)
    const baseSections = sections.length
      ? sections
      : [{ pageNum: 1, sectionKind: 'texto' as const, sectionTitle: 'Texto extraído', body: input.sourceText }]

    for (const section of baseSections) {
      const chunks = splitLongText(section.body)
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i]!
        const id = `${input.documentId}:chunk:${section.pageNum}:${section.sectionKind}:${i + 1}`
        await this.adicionarDocumento(chunkText, {
          kind: 'documentChunk',
          id,
          chunkId: id,
          documentId: input.documentId,
          notebookId: input.notebookId,
          fileName: input.fileName,
          title: input.fileName,
          pageNum: section.pageNum,
          sectionKind: section.sectionKind,
          sectionTitle: section.sectionTitle,
          chunkIndex: i + 1,
          chunkTotal: chunks.length,
          chunkText,
        })
      }
    }
  }

  async garantirChunksDoNotebook(notebookId: string): Promise<{ documentsIndexed: number; chunksIndexed: number }> {
    await this.ensureIndexCreated()
    const items = (await this.index.listItems()) as StoredIndexItem[]
    let documentsIndexed = 0
    let chunksIndexed = 0
    for (const item of items) {
      const metadata = this.itemMetadata(item)
      if (metadata.kind !== 'document' || metadata.notebookId !== notebookId) continue
      const documentId = typeof metadata.documentId === 'string' ? metadata.documentId : item.id
      if (await this.documentHasChunks(documentId)) continue
      const sourceText =
        typeof metadata.llmMarkdown === 'string' && metadata.llmMarkdown.trim()
          ? metadata.llmMarkdown
          : typeof metadata.rawPlainText === 'string'
            ? metadata.rawPlainText
            : ''
      if (!sourceText.trim()) continue
      const before = (await this.index.listItems()).length
      await this.upsertDocumentChunks({
        documentId,
        notebookId,
        fileName: typeof metadata.fileName === 'string' ? metadata.fileName : 'documento.pdf',
        sourceText,
      })
      const after = (await this.index.listItems()).length
      documentsIndexed++
      chunksIndexed += Math.max(0, after - before)
    }
    return { documentsIndexed, chunksIndexed }
  }

  async readDocumentPdf(documentId: string): Promise<{ fileName: string; bytes: ArrayBuffer } | null> {
    await this.ensureIndexCreated()
    const item = (await this.index.getItem(documentId)) as StoredIndexItem | undefined
    if (!item) return null
    const metadata = readItemMetadataFile(this.index.folderPath, item.metadataFile) ?? fromStoredMetadata(item.metadata)
    if (metadata.kind !== 'document') return null
    const pdfPath = typeof metadata.pdfPath === 'string' ? metadata.pdfPath : ''
    if (!pdfPath || !existsSync(pdfPath)) return null
    const fileName = typeof metadata.fileName === 'string' && metadata.fileName.trim() ? metadata.fileName : 'documento.pdf'
    const bytes = readFileSync(pdfPath)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return { fileName, bytes: arrayBuffer }
  }

  async buscarSimilares(queryTexto: string, limite = 5): Promise<VectorSearchResult[]> {
    await this.inicializar()
    const cleanQuery = normalizeText(queryTexto)
    if (!cleanQuery) return []

    const topK = Math.max(1, Math.min(50, Math.floor(limite || 5)))
    const vector = await this.gerarEmbedding(cleanQuery)
    const results = await this.index.queryItems(vector, cleanQuery, topK)
    return results.map((result) => {
      const item = result.item as StoredIndexItem
      return {
        id: item.id,
        score: result.score,
        metadata: this.itemMetadata(item),
      }
    })
  }

  async buscarChunksDoNotebook(queryTexto: string, notebookId: string, limite = 12): Promise<VectorSearchResult[]> {
    await this.inicializar()
    const cleanQuery = normalizeText(queryTexto)
    if (!cleanQuery || !notebookId.trim()) return []

    const topK = Math.max(10, Math.min(120, Math.floor((limite || 12) * 8)))
    const vector = await this.gerarEmbedding(cleanQuery)
    const results = await this.index.queryItems(vector, cleanQuery, topK)
    const seen = new Set<string>()
    const filtered: VectorSearchResult[] = []
    for (const result of results) {
      const item = result.item as StoredIndexItem
      const metadata = this.itemMetadata(item)
      if (metadata.kind !== 'documentChunk' || metadata.notebookId !== notebookId) continue
      const id = String(metadata.chunkId ?? item.id)
      if (seen.has(id)) continue
      seen.add(id)
      filtered.push({ id: item.id, score: result.score, metadata })
      if (filtered.length >= Math.max(1, limite)) break
    }
    return filtered
  }

  private async gerarEmbedding(texto: string): Promise<number[]> {
    const extractor = await getExtractor()
    const tensor = await extractor(texto, { pooling: 'mean', normalize: true })
    return Array.from(tensor.data as Float32Array)
  }
}

let vectorServiceSingleton: VectorService | null = null

export function getVectorService(): VectorService {
  if (!vectorServiceSingleton) vectorServiceSingleton = new VectorService()
  return vectorServiceSingleton
}
